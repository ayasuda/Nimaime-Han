/**
 * Tests of the `.sanmaime` TextMate grammar (editors/vscode-sanmaime), tokenized with the same
 * engine VS Code uses (vscode-textmate + vscode-oniguruma).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadWASM, OnigScanner, OnigString } from 'vscode-oniguruma';
import {
  INITIAL,
  Registry,
  type IGrammar,
  type IRawGrammar,
  type StateStack,
} from 'vscode-textmate';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildGrammar, SCOPE_NAME, SCOPES } from '../../editors/vscode-sanmaime/scripts/grammar';
import { LANGUAGES, SUPPORTED_LANGUAGES } from '../../src/parser';
import { classifyLine, keywordTable, type LineToken } from '../../src/parser/tokens';
import { listFixtures } from '../parser/fixtures';

const EXTENSION_DIR = new URL('../../editors/vscode-sanmaime/', import.meta.url);
const GRAMMAR_FILE = fileURLToPath(new URL('syntaxes/sanmaime.tmLanguage.json', EXTENSION_DIR));

function readJson(url: URL): unknown {
  return JSON.parse(readFileSync(fileURLToPath(url), 'utf8'));
}

let grammar: IGrammar;

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const wasm = readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm'));
  await loadWASM(wasm);
  const registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (patterns) => new OnigScanner(patterns),
      createOnigString: (text) => new OnigString(text),
    }),
    loadGrammar: (scopeName) =>
      Promise.resolve(
        scopeName === SCOPE_NAME
          ? (JSON.parse(readFileSync(GRAMMAR_FILE, 'utf8')) as IRawGrammar)
          : null,
      ),
  });
  const loaded = await registry.loadGrammar(SCOPE_NAME);
  if (!loaded) throw new Error('Grammar not loaded');
  grammar = loaded;
});

interface Token {
  text: string;
  /** Scopes without the root `source.sanmaime`. */
  scopes: string[];
}

/** Tokenize a whole source, line by line, as VS Code does. */
function tokenize(source: string): Token[][] {
  let state: StateStack = INITIAL;
  return source.split(/\r\n|\r|\n/).map((line) => {
    const result = grammar.tokenizeLine(line, state);
    state = result.ruleStack;
    return result.tokens.map((t) => ({
      text: line.slice(t.startIndex, t.endIndex),
      scopes: t.scopes.filter((s) => s !== SCOPE_NAME),
    }));
  });
}

/** `[text, innermost scope]` of every scoped, non-blank token of a line, for compact assertions. */
function brief(tokens: Token[]): [string, string][] {
  return tokens.flatMap((t): [string, string][] => {
    const scope = t.scopes.at(-1);
    return scope === undefined || t.text.trim() === '' ? [] : [[t.text, scope]];
  });
}

function line(source: string, index = 0): [string, string][] {
  const lines = tokenize(source);
  return brief(lines[index] ?? []);
}

describe('sanmaime.tmLanguage.json', () => {
  it('is up to date with the keyword dictionaries (run `npm run build:grammar`)', () => {
    expect(JSON.parse(readFileSync(GRAMMAR_FILE, 'utf8'))).toEqual(buildGrammar(LANGUAGES));
  });

  it('has a directive region and a body for every supported language', () => {
    const { repository } = buildGrammar(LANGUAGES);
    for (const code of SUPPORTED_LANGUAGES) {
      expect(repository).toHaveProperty(`directive-${code}`);
      expect(repository).toHaveProperty(`body-${code}`);
    }
  });

  it('is contributed by the extension manifest', () => {
    const manifest = readJson(new URL('package.json', EXTENSION_DIR)) as {
      contributes: {
        languages: { id: string; extensions: string[]; configuration: string }[];
        grammars: { language: string; scopeName: string; path: string }[];
      };
    };
    expect(manifest.contributes.languages).toEqual([
      expect.objectContaining({
        id: 'sanmaime',
        extensions: ['.sanmaime'],
        configuration: './language-configuration.json',
      }),
    ]);
    expect(manifest.contributes.grammars).toEqual([
      {
        language: 'sanmaime',
        scopeName: SCOPE_NAME,
        path: './syntaxes/sanmaime.tmLanguage.json',
      },
    ]);
    const config = readJson(new URL('language-configuration.json', EXTENSION_DIR)) as {
      comments: { lineComment: string };
      wordPattern: { pattern: string; flags: string };
    };
    expect(config.comments.lineComment).toBe('#');
    const word = new RegExp(config.wordPattern.pattern, config.wordPattern.flags);
    expect('表示: ユーザー名'.match(new RegExp(word, 'gu'))).toEqual(['表示', 'ユーザー名']);
  });
});

describe('English keywords', () => {
  it('scopes structural keywords and their names', () => {
    expect(line('Screen: User Details')).toEqual([
      ['Screen', SCOPES.structure],
      [':', SCOPES.colon],
      ['User Details', SCOPES.section],
    ]);
    expect(line('  Element: User Information  ')).toEqual([
      ['Element', SCOPES.structure],
      [':', SCOPES.colon],
      ['User Information', SCOPES.section],
    ]);
  });

  it('scopes conditions, expectations and states', () => {
    expect(line('    When: Viewing your own profile')).toEqual([
      ['When', SCOPES.condition],
      [':', SCOPES.colon],
      ['Viewing your own profile', SCOPES.conditionName],
    ]);
    for (const keyword of ['Show', 'Hide', 'And']) {
      expect(line(`\t${keyword}: Full name`)).toEqual([
        [keyword, SCOPES.expectation],
        [':', SCOPES.colon],
        ['Full name', SCOPES.target],
      ]);
    }
    expect(line('    Enable')).toEqual([['Enable', SCOPES.state]]);
    expect(line('Disable  ')).toEqual([['Disable', SCOPES.state]]);
  });

  it('scopes Background: and And when: as conditions (v0.2)', () => {
    expect(line('  Background: Logged in')).toEqual([
      ['Background', SCOPES.condition],
      [':', SCOPES.colon],
      ['Logged in', SCOPES.conditionName],
    ]);
    expect(line('    And when: The cart has items')).toEqual([
      ['And when', SCOPES.condition],
      [':', SCOPES.colon],
      ['The cart has items', SCOPES.conditionName],
    ]);
    // `And:` is still an expectation, and `And when` without a colon is not a keyword.
    expect(line('And: when')[0]).toEqual(['And', SCOPES.expectation]);
    expect(line('And when X')).toEqual([]);
  });

  it('keeps colons, # and @ inside names', () => {
    expect(line('Show: Time: 12:00 #1 @home')).toEqual([
      ['Show', SCOPES.expectation],
      [':', SCOPES.colon],
      ['Time: 12:00 #1 @home', SCOPES.target],
    ]);
    expect(line('Show:Username')).toEqual([
      ['Show', SCOPES.expectation],
      [':', SCOPES.colon],
      ['Username', SCOPES.target],
    ]);
  });

  it('flags unknown and malformed keyword lines', () => {
    expect(line('  Given: a user')).toEqual([['Given:', SCOPES.illegal]]);
    expect(line('show: Username')).toEqual([['show:', SCOPES.illegal]]);
    // Not a keyword (whitespace before the colon) and not `Word:` either: left unscoped.
    expect(line('Show :Username')).toEqual([]);
    expect(line('A description line')).toEqual([]);
    expect(line('Enable: Submit')).toEqual([['Enable: Submit', SCOPES.illegal]]);
    expect(line('Disable now')).toEqual([['Disable now', SCOPES.illegal]]);
    expect(line('Show:  ')).toEqual([
      ['Show', SCOPES.expectation],
      [':', SCOPES.colon],
    ]);
    expect(tokenize('Show:')[0]?.[0]?.scopes).toEqual([SCOPES.missingName, SCOPES.expectation]);
  });
});

describe('Japanese keywords', () => {
  it('accepts ASCII and full-width colons', () => {
    expect(line('画面: ログイン')).toEqual([
      ['画面', SCOPES.structure],
      [':', SCOPES.colon],
      ['ログイン', SCOPES.section],
    ]);
    expect(line('　要素：ログインフォーム')).toEqual([
      ['要素', SCOPES.structure],
      ['：', SCOPES.colon],
      ['ログインフォーム', SCOPES.section],
    ]);
    expect(line('条件：入力が正しい')).toEqual([
      ['条件', SCOPES.condition],
      ['：', SCOPES.colon],
      ['入力が正しい', SCOPES.conditionName],
    ]);
    expect(line('表示：時刻：12:00')).toEqual([
      ['表示', SCOPES.expectation],
      ['：', SCOPES.colon],
      ['時刻：12:00', SCOPES.target],
    ]);
    expect(line('非表示: 氏名')[0]).toEqual(['非表示', SCOPES.expectation]);
    expect(line('かつ：パスワード')[0]).toEqual(['かつ', SCOPES.expectation]);
    expect(line('有効')).toEqual([['有効', SCOPES.state]]);
    expect(line('無効')).toEqual([['無効', SCOPES.state]]);
    expect(line('背景：ログイン済み')).toEqual([
      ['背景', SCOPES.condition],
      ['：', SCOPES.colon],
      ['ログイン済み', SCOPES.conditionName],
    ]);
    expect(line('かつ条件: カートに商品がある')[0]).toEqual(['かつ条件', SCOPES.condition]);
    expect(line('有効期限: 30日')).toEqual([['有効期限:', SCOPES.illegal]]);
    expect(line('有効：送信')).toEqual([['有効：送信', SCOPES.illegal]]);
  });

  it('accepts the full-width colon only for Japanese keywords', () => {
    expect(line('Show：Username')).toEqual([['Show：', SCOPES.illegal]]);
  });
});

describe('comments, directive and tags', () => {
  it('scopes comment lines, and only comment lines', () => {
    expect(tokenize('Screen: A\n  # a comment: with colon')[1]).toEqual([
      { text: '  ', scopes: [] },
      { text: '#', scopes: [SCOPES.comment, SCOPES.commentPunctuation] },
      { text: ' a comment: with colon', scopes: [SCOPES.comment] },
    ]);
    // No trailing comments: `#` inside a name is an ordinary character.
    expect(line('Show: Order #1234')[2]).toEqual(['Order #1234', SCOPES.target]);
  });

  it('scopes the language directive in the header', () => {
    expect(line('# language: ja')).toEqual([
      ['#', SCOPES.commentPunctuation],
      ['language', SCOPES.directiveKeyword],
      [':', SCOPES.colon],
      ['ja', SCOPES.directiveValue],
    ]);
    expect(tokenize('# language: ja')[0]?.[0]?.scopes).toEqual([
      SCOPES.directive,
      SCOPES.commentPunctuation,
    ]);
    expect(line('\n# comment\n  #language:en  ', 2)).toEqual([
      ['#', SCOPES.commentPunctuation],
      ['language', SCOPES.directiveKeyword],
      [':', SCOPES.colon],
      ['en', SCOPES.directiveValue],
    ]);
    expect(line('# language: JA')[3]).toEqual(['JA', SCOPES.directiveInvalidValue]);
    expect(line('# language: xx')[3]).toEqual(['xx', SCOPES.directiveInvalidValue]);
  });

  it('considers only the first directive of the header', () => {
    const lines = tokenize('# language: xx\n# language: ja\nScreen: A');
    expect(lines[1]?.[0]?.scopes).toEqual([SCOPES.comment, SCOPES.commentPunctuation]);
    expect(brief(lines[2] ?? [])[0]).toEqual(['Screen', SCOPES.structure]);
    const twice = tokenize('# language: ja\n# language: en\nScreen: A');
    expect(twice[1]?.[0]?.scopes).toEqual([SCOPES.comment, SCOPES.commentPunctuation]);
    expect(brief(twice[2] ?? [])).toEqual([['Screen:', SCOPES.illegal]]);
  });

  it('treats a directive after the header as an ordinary comment', () => {
    expect(tokenize('Screen: A\n# language: ja')[1]?.[0]?.scopes).toEqual([
      SCOPES.comment,
      SCOPES.commentPunctuation,
    ]);
  });

  it('uses only the keywords of the declared language', () => {
    const ja = tokenize('# language: ja\n画面: A\nScreen: B\nShow：X');
    expect(brief(ja[1] ?? [])[0]).toEqual(['画面', SCOPES.structure]);
    expect(brief(ja[2] ?? [])).toEqual([['Screen:', SCOPES.illegal]]);
    const en = tokenize('# language: en\n表示: A\nShow: B');
    expect(brief(en[1] ?? [])).toEqual([['表示:', SCOPES.illegal]]);
    expect(brief(en[2] ?? [])[0]).toEqual(['Show', SCOPES.expectation]);
    // Without a directive the language comes from the project configuration: accept all.
    const any = tokenize('# no directive\n表示: A\nShow: B');
    expect(brief(any[1] ?? [])[0]).toEqual(['表示', SCOPES.expectation]);
    expect(brief(any[2] ?? [])[0]).toEqual(['Show', SCOPES.expectation]);
    // An unsupported directive falls back to the default language as well.
    const unsupported = tokenize('# language: xx\n表示: A\nShow: B');
    expect(brief(unsupported[1] ?? [])[0]).toEqual(['表示', SCOPES.expectation]);
  });

  it('scopes every tag of a tag line', () => {
    expect(line('  @smoke @regression\t@owner:team-profile @日本語タグ')).toEqual([
      ['@', SCOPES.tagPunctuation],
      ['smoke', SCOPES.tag],
      ['@', SCOPES.tagPunctuation],
      ['regression', SCOPES.tag],
      ['@', SCOPES.tagPunctuation],
      ['owner:team-profile', SCOPES.tag],
      ['@', SCOPES.tagPunctuation],
      ['日本語タグ', SCOPES.tag],
    ]);
    expect(line('@smoke not-a-tag @a@b')).toEqual([
      ['@', SCOPES.tagPunctuation],
      ['smoke', SCOPES.tag],
      ['not-a-tag', SCOPES.invalidTag],
      ['@a@b', SCOPES.invalidTag],
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// Cross-check against the parser's lexer on every fixture: each line must get the scope that
// corresponds to how `classifyLine()` classifies it.

const DIRECTIVE = /^#\s*language\s*:\s*(.*)$/;
const LOOKS_LIKE_KEYWORD = /^[^\s#@:：]+[:：]/;

const KEYWORD_SCOPES: Record<string, [string, string]> = {
  Screen: [SCOPES.structure, SCOPES.section],
  Element: [SCOPES.structure, SCOPES.section],
  Background: [SCOPES.condition, SCOPES.conditionName],
  When: [SCOPES.condition, SCOPES.conditionName],
  AndWhen: [SCOPES.condition, SCOPES.conditionName],
  Show: [SCOPES.expectation, SCOPES.target],
  Hide: [SCOPES.expectation, SCOPES.target],
  And: [SCOPES.expectation, SCOPES.target],
};

const PRIORITY: LineToken['type'][] = [
  'blank',
  'comment',
  'tags',
  'invalid-tags',
  'name-keyword',
  'bare-keyword',
  'unknown',
];

/**
 * How the grammar is expected to classify a line: with the keywords of `language`, or (without a
 * valid directive) with those of every language, where keyword lines win over unknown lines.
 */
function expectedToken(raw: string, index: number, language: string | undefined): LineToken {
  const codes = language === undefined ? SUPPORTED_LANGUAGES : [language];
  const tokens = codes.map((code) => classifyLine(raw, index + 1, keywordTable(code)));
  const best = tokens.sort((a, b) => PRIORITY.indexOf(a.type) - PRIORITY.indexOf(b.type))[0];
  if (!best) throw new Error('No language');
  return best;
}

function checkLine(tokens: Token[], expected: LineToken, inHeader: boolean): void {
  // trim() also removes the BOM of the first line.
  const significant = tokens.filter((t) => t.text.trim() !== '');
  const first = significant[0];
  const scopes = first?.scopes ?? [];
  switch (expected.type) {
    case 'blank':
      expect(significant).toEqual([]);
      return;
    case 'comment':
      if (inHeader && DIRECTIVE.test(expected.text)) expect(scopes[0]).toBe(SCOPES.directive);
      else expect(scopes).toEqual([SCOPES.comment, SCOPES.commentPunctuation]);
      return;
    case 'tags':
      expect(significant.filter((t) => t.scopes.at(-1) === SCOPES.tag).map((t) => t.text)).toEqual(
        expected.tags.map((tag) => tag.name.slice(1)),
      );
      expect(significant.some((t) => t.scopes.includes(SCOPES.invalidTag))).toBe(false);
      return;
    case 'invalid-tags':
      expect(significant.some((t) => t.scopes.includes(SCOPES.invalidTag))).toBe(true);
      return;
    case 'name-keyword': {
      const [keywordScope, nameScope] = KEYWORD_SCOPES[expected.keyword] ?? ['', ''];
      expect(first?.text).toBe(expected.text);
      expect(scopes.at(-1)).toBe(keywordScope);
      if (expected.name === '') {
        expect(scopes[0]).toBe(SCOPES.missingName);
      } else {
        const name = significant.find((t) => t.scopes.includes(nameScope));
        expect(name?.text).toBe(expected.name);
      }
      return;
    }
    case 'bare-keyword':
      expect(scopes).toEqual([expected.hasArgument ? SCOPES.illegal : SCOPES.state]);
      return;
    case 'unknown':
      if (LOOKS_LIKE_KEYWORD.test(expected.text)) expect(scopes).toEqual([SCOPES.illegal]);
      else expect(significant.every((t) => t.scopes.length === 0)).toBe(true);
      return;
  }
}

describe.each(['valid', 'invalid'] as const)('%s fixtures', (kind) => {
  const fixtures = listFixtures(kind);

  it.each(fixtures.map((f) => [f.name, f] as const))('%s', (_name, fixture) => {
    const raws = fixture.source.split(/\r\n|\r|\n/);
    const lines = tokenize(fixture.source);
    let language: string | undefined;
    let directiveSeen = false;
    let inHeader = true;
    raws.forEach((raw, index) => {
      const t = raw.trim();
      if (inHeader && t !== '' && !t.startsWith('#')) inHeader = false;
      const directive = inHeader ? DIRECTIVE.exec(t)?.[1]?.trim() : undefined;
      const expected = expectedToken(raw, index, language);
      try {
        checkLine(lines[index] ?? [], expected, inHeader);
      } catch (error) {
        throw new Error(`${fixture.uri}:${String(index + 1)}: ${raw}`, { cause: error });
      }
      // Only the first directive counts; when it is valid, it selects the language.
      if (!directiveSeen && directive !== undefined) {
        directiveSeen = true;
        if (SUPPORTED_LANGUAGES.includes(directive)) language = directive;
      }
    });
    if (kind === 'valid') {
      const invalid = lines.flat().filter((t) => t.scopes.some((s) => s.startsWith('invalid')));
      expect(invalid).toEqual([]);
    }
  });
});
