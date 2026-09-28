/**
 * Line-based lexer for Sanmaime (docs/sanmaime.md §3).
 *
 * Every physical line is trimmed and classified on its own (§3.8). The lexer never reports
 * diagnostics itself: malformed lines become dedicated token types that the parser turns into
 * diagnostics, so that all messages live in one place.
 */
import type { Location, Tag } from './ast';
import {
  EXPECTATION_KINDS,
  EXPECTATIONS,
  type ExpectationArity,
  type ExpectationKeyword,
  type ExpectationSlot,
  type StateKind,
  type ValueKind,
} from '../runtime/expectations';
import {
  DEFAULT_LANGUAGE,
  type LanguageDefinition,
  type LanguageKeywords,
  getLanguage,
} from './languages';

// Canonical keywords. The parser and the AST speak only in these (English) identifiers; the
// spellings of each language come from the dictionaries in `languages.ts`, and the expectation
// keywords (and what they take) from the vocabulary table in `src/runtime/expectations.ts`.

/** Keywords that structure a file and take a name: `Screen:`, `And when:` (`AndWhen`), … */
export const STRUCTURE_KEYWORDS = ['Screen', 'Element', 'Background', 'When', 'AndWhen'] as const;
export type StructureKeyword = (typeof STRUCTURE_KEYWORDS)[number];

/** Canonical keyword of the state kinds (`Enable`, `Check`, …): bare, or with a target. */
export type StateKeyword = (typeof EXPECTATIONS)[StateKind]['keyword'];
/** Canonical keyword of the value kinds: `Text`, `Contain`, `Count`. */
export type ValueKeyword = (typeof EXPECTATIONS)[ValueKind]['keyword'];

function keywordsOf<K extends ExpectationKeyword>(arity: ExpectationArity): K[] {
  return EXPECTATION_KINDS.filter((kind) => EXPECTATIONS[kind].arity === arity).map(
    (kind) => EXPECTATIONS[kind].keyword as K,
  );
}

/**
 * Keywords that take a name after their colon (`Show: Username`). `AndWhen` is `And when:` and
 * `Background` is `Background:` (both v0.2). Since v0.3 this includes the value keywords
 * (`Text: Title = "Welcome"`) and the state keywords with a target (`Check: Remember me`).
 */
export const NAME_KEYWORDS: readonly NameKeyword[] = [
  ...STRUCTURE_KEYWORDS,
  'And',
  ...EXPECTATION_KINDS.map((kind) => EXPECTATIONS[kind].keyword),
];
export type NameKeyword = StructureKeyword | 'And' | ExpectationKeyword;

/**
 * Keywords that may stand alone on their line, without argument (the element itself): the state
 * keywords `Enable`, `Disable`, `Check`, `Uncheck`, `Focus`, `Editable`, `ReadOnly`, `Empty`.
 */
export const BARE_KEYWORDS: readonly StateKeyword[] = keywordsOf<StateKeyword>('optional-target');
export type BareKeyword = StateKeyword;

export type CanonicalKeyword = NameKeyword | BareKeyword;

/**
 * The dictionary slot of every canonical keyword. (The type also checks that every slot of the
 * vocabulary table, `ExpectationSlot`, is a slot of the language dictionaries.)
 */
export const KEYWORD_SLOTS: Readonly<Record<CanonicalKeyword, keyof LanguageKeywords>> = {
  Screen: 'screen',
  Element: 'element',
  Background: 'background',
  When: 'when',
  AndWhen: 'andWhen',
  And: 'and',
  ...(Object.fromEntries(
    EXPECTATION_KINDS.map((kind) => [EXPECTATIONS[kind].keyword, EXPECTATIONS[kind].slot]),
  ) as Record<ExpectationKeyword, ExpectationSlot>),
};

/** One spelling of a keyword in a language. */
export interface KeywordSpelling<K extends CanonicalKeyword> {
  /** The spelling, without colon. */
  text: string;
  keyword: K;
}

/** A language dictionary compiled for the lexer. */
export interface KeywordTable {
  language: LanguageDefinition;
  /** Colons accepted after name keywords (`:`, and `：` for some languages). */
  colons: readonly string[];
  /** All spellings, longest first, so that a synonym never shadows a longer one. */
  name: readonly KeywordSpelling<NameKeyword>[];
  bare: readonly KeywordSpelling<BareKeyword>[];
  /** The primary (first) spelling of every keyword, used in diagnostics. */
  primary: Readonly<Record<CanonicalKeyword, string>>;
}

function spellings<K extends CanonicalKeyword>(
  language: LanguageDefinition,
  keywords: readonly K[],
): KeywordSpelling<K>[] {
  return keywords
    .flatMap((keyword) =>
      language.keywords[KEYWORD_SLOTS[keyword]].map((text) => ({ text, keyword })),
    )
    .sort((a, b) => b.text.length - a.text.length);
}

/** Compile a language dictionary into the lookup structure used by `classifyLine()`. */
export function compileKeywordTable(language: LanguageDefinition): KeywordTable {
  const primary = {} as Record<CanonicalKeyword, string>;
  for (const [keyword, slot] of Object.entries(KEYWORD_SLOTS) as [
    CanonicalKeyword,
    keyof LanguageKeywords,
  ][]) {
    const first = language.keywords[slot][0];
    if (first === undefined) {
      throw new TypeError(`Language '${language.code}' has no spelling for '${keyword}'.`);
    }
    primary[keyword] = first;
  }
  return {
    language,
    colons: language.colons,
    name: spellings(language, NAME_KEYWORDS),
    bare: spellings(language, BARE_KEYWORDS),
    primary,
  };
}

const tables = new Map<string, KeywordTable>();

/** The compiled table of a supported language. Throws a `TypeError` for an unsupported code. */
export function keywordTable(code: string): KeywordTable {
  let table = tables.get(code);
  if (table === undefined) {
    const language = getLanguage(code);
    if (language === undefined) throw new TypeError(`Unsupported language '${code}'.`);
    table = compileKeywordTable(language);
    tables.set(code, table);
  }
  return table;
}

/** Blank line (§3.2). */
export interface BlankToken {
  type: 'blank';
  location: Location;
}

/** Comment line (§3.3). `directive` is set when the line has the shape of a language directive. */
export interface CommentToken {
  type: 'comment';
  text: string;
  /** Trimmed value of `# language: <value>`; only meaningful in the header (§3.4). */
  directive: string | undefined;
  location: Location;
}

/** Well-formed tag line (§3.7). */
export interface TagsToken {
  type: 'tags';
  tags: Tag[];
  location: Location;
}

/** Tag line with a token that is not a tag (`SANMAIME_E020`). */
export interface InvalidTagsToken {
  type: 'invalid-tags';
  /** The first offending token. */
  token: string;
  location: Location;
}

/**
 * A keyword followed by its colon: `Screen:`, `Element:`, `Background:`, `When:`, `And when:`,
 * `Show:`, `Hide:`, `And:`, a value keyword (`Text:`, whose `name` is the whole argument
 * `Title = "Welcome"`) or a state keyword with a target (`Check: Remember me`). `name` is `""`
 * when missing (E002).
 */
export interface NameKeywordToken {
  type: 'name-keyword';
  /** Canonical keyword. */
  keyword: NameKeyword;
  /** The keyword as written, without its colon (`"Show"`, `"表示"`). */
  text: string;
  name: string;
  location: Location;
}

/**
 * A state keyword alone on its line (`Enable`, `Check`). `hasArgument` is set when an argument
 * follows it without a colon (`Enable X`, E003).
 */
export interface BareKeywordToken {
  type: 'bare-keyword';
  /** Canonical keyword. */
  keyword: BareKeyword;
  /** The keyword as written (`"Enable"`, `"有効"`). */
  text: string;
  hasArgument: boolean;
  /** The argument written after the keyword without a colon (`"X"` for `Enable X`), else `""`. */
  argument: string;
  location: Location;
}

/** Any other line (E001). */
export interface UnknownToken {
  type: 'unknown';
  text: string;
  location: Location;
}

export type LineToken =
  | BlankToken
  | CommentToken
  | TagsToken
  | InvalidTagsToken
  | NameKeywordToken
  | BareKeywordToken
  | UnknownToken;

/** Tokens that are ignored by the syntactic grammar (§3.8). */
export function isInsignificant(token: LineToken): token is BlankToken | CommentToken {
  return token.type === 'blank' || token.type === 'comment';
}

/**
 * Split source text into physical lines. A leading BOM is dropped; LF, CRLF and lone CR are all
 * line breaks. The returned array always has at least one element.
 */
export function splitLines(source: string): string[] {
  const text = source.startsWith('﻿') ? source.slice(1) : source;
  return text.split(/\r\n|\r|\n/);
}

// `\s` in ECMAScript matches exactly the characters removed by String.prototype.trim() (§3.1).
const DIRECTIVE = /^#\s*language\s*:\s*(.*)$/;
const TAG = /^@[^\s@#]+$/;
const WHITESPACE_RUN = /\s+/;

/** Number of Unicode code points in `text`. */
function codePointLength(text: string): number {
  return Array.from(text).length;
}

/** The length of the colon at the start of `rest` if it is one of `colons`, else 0. */
function colonAt(rest: string, colons: readonly string[]): number {
  for (const colon of colons) if (rest.startsWith(colon)) return colon.length;
  return 0;
}

/**
 * Classify one physical line (without its line break) according to §3.8, using the keywords of
 * `table` (English by default).
 */
export function classifyLine(
  raw: string,
  line: number,
  table: KeywordTable = keywordTable(DEFAULT_LANGUAGE),
): LineToken {
  const t = raw.trim();
  // Leading whitespace characters are all in the BMP, so UTF-16 length equals code point count.
  const column = raw.length - raw.trimStart().length + 1;
  const location: Location = { line, column };

  // Rule 1: blank.
  if (t === '') return { type: 'blank', location: { line, column: 1 } };

  // Rule 2: comment (or language directive).
  if (t.startsWith('#')) {
    const match = DIRECTIVE.exec(t);
    return { type: 'comment', text: t, directive: match?.[1]?.trim(), location };
  }

  // Rule 3: tag line.
  if (t.startsWith('@')) return classifyTagLine(t, location);

  // Rule 4: name keyword.
  for (const { text, keyword } of table.name) {
    if (!t.startsWith(text)) continue;
    const colon = colonAt(t.slice(text.length), table.colons);
    if (colon > 0) {
      const name = t.slice(text.length + colon).trim();
      return { type: 'name-keyword', keyword, text, name, location };
    }
  }

  // Rules 5 and 6: a state keyword alone, or followed by whitespace and an argument (no colon:
  // with a colon, rule 4 made it a state keyword with a target).
  for (const { text, keyword } of table.bare) {
    if (t === text) {
      return { type: 'bare-keyword', keyword, text, hasArgument: false, argument: '', location };
    }
    if (t.startsWith(text)) {
      const rest = t.slice(text.length);
      if (/^\s/.test(rest)) {
        const argument = rest.trim();
        return { type: 'bare-keyword', keyword, text, hasArgument: true, argument, location };
      }
    }
  }

  // Rule 7: anything else.
  return { type: 'unknown', text: t, location };
}

function classifyTagLine(t: string, location: Location): TagsToken | InvalidTagsToken {
  const tags: Tag[] = [];
  let rest = t;
  let offset = 0; // code points consumed from `t`
  while (rest !== '') {
    const ws = WHITESPACE_RUN.exec(rest);
    const tokenText = ws ? rest.slice(0, ws.index) : rest;
    if (!TAG.test(tokenText)) return { type: 'invalid-tags', token: tokenText, location };
    tags.push({
      name: tokenText,
      location: { line: location.line, column: location.column + offset },
    });
    if (!ws) break;
    const consumed = rest.slice(0, ws.index + ws[0].length);
    offset += codePointLength(consumed);
    rest = rest.slice(consumed.length);
  }
  return { type: 'tags', tags, location };
}

/**
 * Split and classify a whole source text with one keyword language. Line numbers are 1-based.
 * (The parser classifies line by line instead, because the header's `# language:` directive
 * selects the table for the lines after it.)
 */
export function tokenize(
  source: string,
  table: KeywordTable = keywordTable(DEFAULT_LANGUAGE),
): LineToken[] {
  return splitLines(source).map((raw, index) => classifyLine(raw, index + 1, table));
}
