import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  type LanguageDefinition,
  SUPPORTED_LANGUAGES,
  getLanguage,
} from '../../src/parser';
import {
  BARE_KEYWORDS,
  KEYWORD_SLOTS,
  NAME_KEYWORDS,
  classifyLine,
  compileKeywordTable,
  keywordTable,
  tokenize,
} from '../../src/parser/tokens';

const definitions = Object.values(LANGUAGES);

function lang(code: string): LanguageDefinition {
  const definition = getLanguage(code);
  if (definition === undefined) throw new Error(`No language ${code}`);
  return definition;
}

function allSpellings(definition: LanguageDefinition): (readonly string[])[] {
  return Object.values(definition.keywords) as (readonly string[])[];
}

describe('LANGUAGES', () => {
  it('supports en and ja, keyed by code', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['en', 'ja']);
    expect(Object.keys(LANGUAGES)).toEqual(SUPPORTED_LANGUAGES);
    for (const [code, definition] of Object.entries(LANGUAGES)) expect(definition.code).toBe(code);
    expect(DEFAULT_LANGUAGE).toBe('en');
  });

  it('keeps the English keywords of v0 and adds those of v0.2', () => {
    expect(LANGUAGES.en).toEqual({
      code: 'en',
      name: 'English',
      nativeName: 'English',
      colons: [':'],
      keywords: {
        screen: ['Screen'],
        element: ['Element'],
        when: ['When'],
        andWhen: ['And when'],
        show: ['Show'],
        hide: ['Hide'],
        and: ['And'],
        enable: ['Enable'],
        disable: ['Disable'],
        background: ['Background'],
      },
    });
  });

  it('defines the Japanese keywords', () => {
    expect(LANGUAGES.ja).toEqual({
      code: 'ja',
      name: 'Japanese',
      nativeName: '日本語',
      colons: [':', '：'],
      keywords: {
        screen: ['画面'],
        element: ['要素'],
        when: ['条件'],
        andWhen: ['かつ条件'],
        show: ['表示'],
        hide: ['非表示'],
        and: ['かつ'],
        enable: ['有効'],
        disable: ['無効'],
        background: ['背景'],
      },
    });
  });

  it.each(definitions.map((d) => [d.code, d] as const))(
    '%s: every keyword is well-formed and unambiguous',
    (_, definition) => {
      expect(definition.colons).toContain(':');
      const all = allSpellings(definition).flat();
      expect(Object.keys(definition.keywords).sort()).toEqual(Object.values(KEYWORD_SLOTS).sort());
      for (const spellings of allSpellings(definition)) {
        expect(spellings.length).toBeGreaterThan(0);
      }
      for (const keyword of all) {
        expect(keyword).not.toBe('');
        expect(keyword.trim()).toBe(keyword);
        expect(keyword).not.toMatch(/[:：]/);
        expect(keyword).not.toMatch(/^[#@]/);
      }
      // No spelling is used by two keywords.
      expect(new Set(all).size).toBe(all.length);
    },
  );

  it('is frozen', () => {
    expect(Object.isFrozen(LANGUAGES)).toBe(true);
    const ja = lang('ja');
    expect(Object.isFrozen(ja)).toBe(true);
    expect(Object.isFrozen(ja.keywords)).toBe(true);
    expect(Object.isFrozen(ja.keywords.show)).toBe(true);
    expect(Object.isFrozen(ja.colons)).toBe(true);
  });
});

describe('getLanguage', () => {
  it('returns the definition of a supported code', () => {
    expect(getLanguage('ja')).toBe(LANGUAGES.ja);
    expect(getLanguage('en')).toBe(LANGUAGES.en);
  });

  it('returns undefined for unknown codes, other cases and Object.prototype keys', () => {
    for (const code of ['xx', 'JA', 'ja-JP', '', 'constructor', '__proto__', 'toString']) {
      expect(getLanguage(code)).toBeUndefined();
    }
  });
});

describe('keyword tables', () => {
  it('maps every canonical keyword to a dictionary slot', () => {
    expect(Object.keys(KEYWORD_SLOTS).sort()).toEqual([...NAME_KEYWORDS, ...BARE_KEYWORDS].sort());
  });

  it('exposes the primary spelling of every keyword', () => {
    expect(keywordTable('ja').primary).toEqual({
      Screen: '画面',
      Element: '要素',
      When: '条件',
      AndWhen: 'かつ条件',
      Show: '表示',
      Hide: '非表示',
      And: 'かつ',
      Enable: '有効',
      Disable: '無効',
      Background: '背景',
    });
    expect(keywordTable('en').primary.Show).toBe('Show');
  });

  it('caches tables and rejects unsupported codes', () => {
    expect(keywordTable('ja')).toBe(keywordTable('ja'));
    expect(() => keywordTable('xx')).toThrow(TypeError);
  });

  it('rejects a dictionary with an empty slot', () => {
    const broken = {
      ...lang('en'),
      keywords: { ...lang('en').keywords, hide: [] },
    };
    expect(() => compileKeywordTable(broken)).toThrow(/no spelling for 'Hide'/);
  });

  it('supports synonyms, preferring the longest spelling', () => {
    const table = compileKeywordTable({
      code: 'x-test',
      name: 'Test',
      nativeName: 'Test',
      colons: [':'],
      keywords: {
        screen: ['Page', 'Screen'],
        element: ['Part'],
        when: ['If', 'If not'],
        andWhen: ['And if'],
        show: ['Show'],
        hide: ['Hide'],
        and: ['And', 'Also'],
        enable: ['On'],
        disable: ['Off'],
        background: ['Setup'],
      },
    });
    expect(table.primary.Screen).toBe('Page');
    expect(classifyLine('Screen: A', 1, table)).toMatchObject({
      keyword: 'Screen',
      text: 'Screen',
      name: 'A',
    });
    expect(classifyLine('Also: B', 1, table)).toMatchObject({ keyword: 'And', text: 'Also' });
    expect(classifyLine('If not: C', 1, table)).toMatchObject({
      keyword: 'When',
      text: 'If not',
      name: 'C',
    });
    expect(classifyLine('If: C', 1, table)).toMatchObject({ keyword: 'When', text: 'If' });
    expect(classifyLine('Off', 1, table)).toMatchObject({ keyword: 'Disable', text: 'Off' });
    expect(classifyLine('Setup: x', 1, table)).toMatchObject({ keyword: 'Background', name: 'x' });
    expect(classifyLine('And if: y', 1, table)).toMatchObject({ keyword: 'AndWhen', name: 'y' });
    expect(classifyLine('Show: A', 1, table)).toMatchObject({ keyword: 'Show' });
  });
});

describe('classifyLine with the Japanese keywords', () => {
  const ja = keywordTable('ja');

  it('classifies name keywords with an ASCII or a full-width colon', () => {
    const cases = [
      ['画面', 'Screen'],
      ['要素', 'Element'],
      ['条件', 'When'],
      ['表示', 'Show'],
      ['非表示', 'Hide'],
      ['かつ', 'And'],
    ] as const;
    for (const [text, keyword] of cases) {
      for (const colon of [':', '：']) {
        expect(classifyLine(`\u3000${text}${colon}\u3000名前 A\u3000`, 1, ja)).toEqual({
          type: 'name-keyword',
          keyword,
          text,
          name: '名前 A',
          location: { line: 1, column: 2 },
        });
        expect(classifyLine(`${text}${colon}X`, 1, ja)).toMatchObject({ keyword, name: 'X' });
      }
    }
  });

  it('only treats the keyword colon as special', () => {
    expect(classifyLine('表示：時刻：12:00', 1, ja)).toMatchObject({ name: '時刻：12:00' });
    expect(classifyLine('表示:時刻:12：00', 1, ja)).toMatchObject({ name: '時刻:12：00' });
  });

  it('does not confuse 表示 and 非表示', () => {
    expect(classifyLine('非表示: A', 1, ja)).toMatchObject({ keyword: 'Hide' });
    expect(classifyLine('表示: A', 1, ja)).toMatchObject({ keyword: 'Show' });
  });

  it('returns an empty name for a keyword without a name (E002)', () => {
    expect(classifyLine('条件：　', 1, ja)).toMatchObject({ type: 'name-keyword', name: '' });
  });

  it('classifies bare keywords and bare keywords with an argument (E003)', () => {
    expect(classifyLine('有効', 1, ja)).toMatchObject({
      type: 'bare-keyword',
      keyword: 'Enable',
      text: '有効',
      hasArgument: false,
    });
    expect(classifyLine('無効', 1, ja)).toMatchObject({ keyword: 'Disable', hasArgument: false });
    for (const text of ['有効:', '有効：', '有効: X', '有効：X', '無効 X', '無効　X']) {
      expect(classifyLine(text, 1, ja)).toMatchObject({ type: 'bare-keyword', hasArgument: true });
    }
    expect(classifyLine('有効期限', 1, ja).type).toBe('unknown');
  });

  it('classifies 背景: and かつ条件: as name keywords (v0.2)', () => {
    for (const text of ['背景: A', '背景：A']) {
      expect(classifyLine(text, 1, ja)).toMatchObject({
        type: 'name-keyword',
        keyword: 'Background',
        text: '背景',
        name: 'A',
      });
    }
    expect(classifyLine('背景', 1, ja).type).toBe('unknown');
    // The longest spelling wins: かつ条件 is not かつ followed by a name.
    expect(classifyLine('かつ条件：B', 1, ja)).toMatchObject({ keyword: 'AndWhen', name: 'B' });
    expect(classifyLine('かつ: 条件', 1, ja)).toMatchObject({ keyword: 'And', name: '条件' });
  });

  it('does not recognise English keywords, and English does not recognise Japanese ones', () => {
    for (const text of ['Screen: A', 'Show: A', 'Enable', 'Background: A']) {
      expect(classifyLine(text, 1, ja).type).toBe('unknown');
    }
    for (const text of ['画面: A', '表示: A', '有効', '背景: A']) {
      expect(classifyLine(text, 1).type).toBe('unknown');
    }
  });

  it('does not accept the full-width colon after English keywords', () => {
    expect(classifyLine('Show：A', 1).type).toBe('unknown');
    expect(classifyLine('Enable：', 1).type).toBe('unknown');
  });

  it('classifies comments, tags and blank lines independently of the language', () => {
    expect(tokenize('# language: ja\n\n@タグ\n画面: A', ja).map((t) => t.type)).toEqual([
      'comment',
      'blank',
      'tags',
      'name-keyword',
    ]);
  });
});
