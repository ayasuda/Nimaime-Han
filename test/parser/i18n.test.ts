import { describe, expect, it } from 'vitest';
import { parse } from '../../src/parser';
import { readFixture } from './fixtures';

const lines = (...ls: string[]): string => ls.join('\n');

/** Compact `code@line:col` form of diagnostics. */
function codes(result: ReturnType<typeof parse>): string[] {
  return result.diagnostics.map(
    (d) => `${d.code}@${String(d.location.line)}:${String(d.location.column)}`,
  );
}

const jaBody = lines('画面: S', '要素: E', '表示: A');
const enBody = lines('Screen: S', 'Element: E', 'Show: A');

describe('parse: # language: ja', () => {
  it('parses Japanese keywords into the same AST as English ones', () => {
    const en = parse(readFixture('valid', 'readme-user-details').source);
    const ja = parse(readFixture('valid', 'ja-english-names').source);
    expect(ja.diagnostics).toEqual([]);
    expect(ja.document.language).toBe('ja');
    expect(ja.document.languageDirective).toEqual({
      value: 'ja',
      location: { line: 1, column: 1 },
    });
    // Same layout, same names: only the keyword spellings differ, and the AST keeps canonical keywords.
    expect(ja.document.screens).toEqual(en.document.screens);
  });

  it('keeps canonical English keywords in expectations', () => {
    const { document, diagnostics } = parse(
      lines(
        '# language: ja',
        '画面: S',
        '要素: E',
        '表示: A',
        'かつ: B',
        '非表示: C',
        '条件: X',
        '無効',
      ),
    );
    expect(diagnostics).toEqual([]);
    const element = document.screens[0]?.elements[0];
    expect(element?.unconditional.map((e) => [e.kind, e.keyword])).toEqual([
      ['show', 'Show'],
      ['show', 'And'],
      ['hide', 'Hide'],
    ]);
    expect(element?.conditions[0]?.expectations).toEqual([
      { kind: 'disable', keyword: 'Disable', location: { line: 8, column: 1 } },
    ]);
  });

  it('accepts full-width colons and mixed colons', () => {
    const { document, diagnostics } = parse(
      lines('# language: ja', '画面：S', '要素:E', '条件：C', '表示：時刻：12:00', 'かつ: B'),
    );
    expect(diagnostics).toEqual([]);
    expect(document.screens[0]?.name).toBe('S');
    expect(document.screens[0]?.elements[0]?.conditions[0]?.expectations).toMatchObject([
      { target: '時刻：12:00' },
      { target: 'B', viaAnd: true },
    ]);
  });

  it('reports English keywords in a ja file as E001 with a hint', () => {
    const result = parse(
      lines('# language: ja', '画面: S', '要素: E', '表示: A', 'Hide: B', 'Enable'),
    );
    expect(codes(result)).toEqual(['SANMAIME_E001@5:1', 'SANMAIME_E001@6:1']);
    expect(result.diagnostics.map((d) => d.message)).toEqual([
      `Unrecognised line 'Hide: B'. Expected 画面:, 背景:, 要素:, 条件:, かつ条件:, 表示:, 非表示:, かつ:, 有効, 無効, a comment (#) or tags (@). 'Hide:' is a keyword of English (en), but this file uses Japanese (ja) keywords. Did you mean '非表示:'?`,
      `Unrecognised line 'Enable'. Expected 画面:, 背景:, 要素:, 条件:, かつ条件:, 表示:, 非表示:, かつ:, 有効, 無効, a comment (#) or tags (@). 'Enable' is a keyword of English (en), but this file uses Japanese (ja) keywords. Did you mean '有効'?`,
    ]);
  });

  it('suggests the directive for Japanese keywords in a file without one', () => {
    const result = parse(lines('Screen: S', 'Element: E', 'Show: A', '非表示: B'));
    expect(codes(result)).toEqual(['SANMAIME_E001@4:1']);
    expect(result.diagnostics[0]?.message).toMatch(
      /'非表示:' is a keyword of Japanese \(ja\), but this file uses English \(en\) keywords\. Did you mean 'Hide:'\? Or add '# language: ja' to the file header\.$/,
    );
  });

  it('hints at the colon for Japanese keywords', () => {
    const result = parse(
      lines('# language: ja', '画面: S', '要素: E', '有効', '表示 A', '表示 ： B'),
    );
    expect(result.diagnostics.map((d) => d.message)).toEqual([
      expect.stringMatching(/Did you mean '表示: A'\?$/),
      expect.stringMatching(/Did you mean '表示: B'\?$/),
    ]);
  });

  it('hints at the ASCII colon for a full-width colon in an English file', () => {
    const result = parse(lines('Screen: S', 'Element: E', 'Enable', 'Show：A'));
    expect(result.diagnostics.map((d) => d.message)).toEqual([
      expect.stringMatching(/Did you mean 'Show: A'\?$/),
    ]);
  });

  it('quotes keywords of the active language in messages', () => {
    const messages = parse(
      lines(
        '# language: ja',
        '要素: X', // E004
        '画面: S',
        '条件: C', // E005
        '画面: T',
        '表示：', // E006
        '画面: U',
        '要素: E',
        'かつ: A', // E007
        '表示: B',
        '有効：Z', // E003
        '条件: C',
        '無効', // E016
        '無効', // E015
        '背景：x', // E025
        'かつ条件：Y', // E023
        '@t',
        '表示: D', // E018
      ),
    ).diagnostics.map((d) => [d.code, d.message]);
    expect(messages).toEqual([
      ['SANMAIME_E004', `'要素:' must appear inside a '画面:'.`],
      ['SANMAIME_E010', `Screen 'S' has no elements.`],
      ['SANMAIME_E005', `'条件:' must appear inside an '要素:'.`],
      ['SANMAIME_E010', `Screen 'T' has no elements.`],
      ['SANMAIME_E002', `'表示:' requires a name.`],
      ['SANMAIME_E006', `'表示:' must appear inside an '要素:'.`],
      ['SANMAIME_E007', `'かつ:' must follow '表示:', '非表示:' or 'かつ:' in the same block.`],
      ['SANMAIME_E003', `'有効' takes no argument. Write '有効' on its own line.`],
      [
        'SANMAIME_E016',
        `'無効' is not allowed here: element 'E' already declares '有効' unconditionally (line 11). Unconditional expectations hold in every state.`,
      ],
      ['SANMAIME_E015', `This block already declares '無効' (line 13).`],
      ['SANMAIME_E025', `'背景:' must appear directly under a '画面:', before its first '要素:'.`],
      ['SANMAIME_E023', `'かつ条件:' must directly follow '条件:' or 'かつ条件:'.`],
      ['SANMAIME_E018', `Tags must be followed by '画面:', '要素:' or '条件:'.`],
    ]);
  });

  it('keeps English messages unchanged in English files', () => {
    const { diagnostics } = parse(lines('Show: A'));
    expect(diagnostics[0]?.message).toBe(`'Show:' must appear inside an 'Element:'.`);
  });

  it('applies the directive only to lines after it; the header is language-neutral', () => {
    const result = parse(lines('# title', '', '#language:ja', '# 説明', jaBody));
    expect(result.diagnostics).toEqual([]);
    expect(result.document.language).toBe('ja');
  });
});

describe('parse: language option', () => {
  it('defaults to en', () => {
    expect(parse(enBody).document.language).toBe('en');
    expect(parse(enBody, { language: undefined }).diagnostics).toEqual([]);
  });

  it('sets the language of a file without a directive', () => {
    const result = parse(jaBody, { language: 'ja' });
    expect(result.diagnostics).toEqual([]);
    expect(result.document.language).toBe('ja');
    expect(result.document.languageDirective).toBeUndefined();
    expect(codes(parse(enBody, { language: 'ja' }))).toEqual([
      'SANMAIME_E001@1:1',
      'SANMAIME_E001@2:1',
      'SANMAIME_E001@3:1',
    ]);
  });

  it('is overridden by the directive', () => {
    const en = parse(lines('# language: en', enBody), { language: 'ja' });
    expect(en.diagnostics).toEqual([]);
    expect(en.document.language).toBe('en');

    const ja = parse(lines('# language: ja', jaBody), { language: 'en' });
    expect(ja.diagnostics).toEqual([]);
    expect(ja.document.language).toBe('ja');
  });

  it('is used after an invalid directive (E017)', () => {
    const result = parse(lines('# language: xx', jaBody), { language: 'ja' });
    expect(codes(result)).toEqual(['SANMAIME_E017@1:1']);
    expect(result.diagnostics[0]?.message).toBe(
      `Unsupported language 'xx'. Supported languages: en, ja.`,
    );
    expect(result.document.language).toBe('ja');
    expect(result.document.languageDirective?.value).toBe('xx');
  });

  it('keeps the first directive when a second one follows (E017)', () => {
    const result = parse(lines('# language: ja', '# language: en', jaBody));
    expect(codes(result)).toEqual(['SANMAIME_E017@2:1']);
    expect(result.document.language).toBe('ja');
  });

  it('rejects Object.prototype keys as language codes', () => {
    expect(codes(parse(lines('# language: constructor', enBody)))).toEqual(['SANMAIME_E017@1:1']);
  });

  it('throws a TypeError for an unsupported option value', () => {
    expect(() => parse(enBody, { language: 'xx' })).toThrow(TypeError);
    expect(() => parse(enBody, { language: 'xx' })).toThrow(
      `parse(): unsupported language option 'xx'. Supported languages: en, ja.`,
    );
    expect(() => parse(enBody, { language: 'JA' })).toThrow(TypeError);
    expect(() => parse(enBody, { language: '' })).toThrow(TypeError);
    expect(() => parse(enBody, { language: 'toString' })).toThrow(TypeError);
    expect(() => parse(enBody, { language: 42 as unknown as string })).toThrow(TypeError);
  });
});
