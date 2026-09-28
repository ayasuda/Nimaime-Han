/**
 * Builds the TextMate grammar of Sanmaime (`syntaxes/sanmaime.tmLanguage.json`) from the keyword
 * dictionaries of the parser (`src/parser/languages.ts`), so that the editor grammar can never
 * drift from the language. Which slots are state keywords (`Enable`, `Check`, …: bare, or with a
 * target) and value keywords (`Text:`, `Count:`, …) follows the vocabulary table of
 * `src/runtime/expectations.ts` (`STATE_SLOTS` / `TEXT_VALUE_SLOTS` / `NUMBER_VALUE_SLOTS` below;
 * `test/editors/grammar.test.ts` checks that they agree). Pure: no I/O. `build-grammar.ts` writes the result to disk and
 * `test/editors/grammar.test.ts` checks that the committed file is up to date.
 *
 * The grammar follows the line classification of docs/sanmaime.md §3.8: every rule is anchored at
 * the start of a line and matches a whole trimmed line. Keywords depend on the file's language:
 *
 * - a valid `# language: <code>` directive in the header (the leading blank and comment lines)
 *   switches the rest of the file to the keywords of `<code>` only;
 * - without a directive, the keyword language is decided by the project configuration, which an
 *   editor grammar cannot see, so the keywords of every language are accepted.
 */
import type { LanguageDefinition, LanguageKeywords } from '../../../src/parser/languages';

/** A TextMate rule, as far as this grammar uses it. */
export interface GrammarRule {
  name?: string;
  match?: string;
  begin?: string;
  end?: string;
  captures?: Record<string, GrammarRule>;
  beginCaptures?: Record<string, GrammarRule>;
  include?: string;
  patterns?: GrammarRule[];
}

export interface Grammar {
  $schema: string;
  name: string;
  scopeName: string;
  fileTypes: string[];
  comment: string;
  patterns: GrammarRule[];
  repository: Record<string, GrammarRule>;
}

export const SCOPE_NAME = 'source.sanmaime';

/** Scope names of the grammar (docs/editors.md lists them for theme authors). */
export const SCOPES = {
  comment: 'comment.line.number-sign.sanmaime',
  commentPunctuation: 'punctuation.definition.comment.sanmaime',
  directive: 'meta.language.sanmaime',
  directiveKeyword: 'keyword.other.language.sanmaime',
  directiveValue: 'constant.language.sanmaime',
  directiveInvalidValue: 'invalid.illegal.language.sanmaime',
  tags: 'meta.tags.sanmaime',
  tag: 'entity.name.tag.sanmaime',
  tagPunctuation: 'punctuation.definition.tag.sanmaime',
  invalidTag: 'invalid.illegal.tag.sanmaime',
  colon: 'punctuation.separator.key-value.sanmaime',
  structure: 'keyword.control.structure.sanmaime',
  section: 'entity.name.section.sanmaime',
  condition: 'keyword.control.condition.sanmaime',
  conditionName: 'entity.name.function.sanmaime',
  expectation: 'keyword.operator.expectation.sanmaime',
  target: 'string.unquoted.target.sanmaime',
  state: 'keyword.operator.state.sanmaime',
  /** The ` = ` between the target and the value of `Text:` / `Contain:` / `Count:` (v0.3). */
  valueSeparator: 'keyword.operator.assignment.sanmaime',
  /** A quoted text value (`"Welcome"`). */
  text: 'string.quoted.double.sanmaime',
  /** A number value (`3`). */
  number: 'constant.numeric.integer.sanmaime',
  /** A value that is not a valid text / number (SANMAIME_E027). */
  invalidValue: 'invalid.illegal.value.sanmaime',
  /** The argument of a value keyword without ` = ` (SANMAIME_E026). */
  missingValue: 'invalid.illegal.missing-value.sanmaime',
  missingName: 'invalid.illegal.missing-name.sanmaime',
  illegal: 'invalid.illegal.sanmaime',
} as const;

/**
 * Whitespace as removed by `String.prototype.trim()` (docs/sanmaime.md §3.1), in Oniguruma
 * syntax: ASCII whitespace, every `Zs` character (U+00A0, U+3000 …) and the BOM.
 */
const WS_CHARS = '\\s\\p{Zs}\\x{FEFF}';
const WS = `[${WS_CHARS}]`;
const NOT_WS = `[^${WS_CHARS}]`;

/** Escape a string for use inside an Oniguruma pattern. */
export function escapeRegExp(text: string): string {
  return text.replace(/[\\^$.*+?()[\]{}|-]/g, (c) => `\\${c}`);
}

/** A character class (or single character) matching any of `chars`. */
function charClass(chars: Iterable<string>): string {
  const unique = [...new Set(chars)].sort();
  const body = unique.map((c) => escapeRegExp(c)).join('');
  return unique.length === 1 ? body : `[${body}]`;
}

/** Slots of the state keywords: alone on a line (the element itself), or with a target. */
export const STATE_SLOTS = [
  'enable',
  'disable',
  'check',
  'uncheck',
  'focus',
  'editable',
  'readOnly',
  'empty',
] as const satisfies readonly (keyof LanguageKeywords)[];

/** Slots of the value keywords whose value is a quoted text. */
export const TEXT_VALUE_SLOTS = [
  'text',
  'contain',
] as const satisfies readonly (keyof LanguageKeywords)[];

/** Slots of the value keywords whose value is a whole number. */
export const NUMBER_VALUE_SLOTS = ['count'] as const satisfies readonly (keyof LanguageKeywords)[];

/** Spellings of one keyword kind, each with the colons its language(s) accept. */
type Spellings = Map<string, Set<string>>;

function collect(
  languages: readonly LanguageDefinition[],
  slots: readonly (keyof LanguageKeywords)[],
): Spellings {
  const spellings: Spellings = new Map();
  for (const language of languages) {
    for (const slot of slots) {
      for (const text of language.keywords[slot]) {
        const colons = spellings.get(text) ?? new Set<string>();
        for (const colon of language.colons) colons.add(colon);
        spellings.set(text, colons);
      }
    }
  }
  return spellings;
}

/** Longest spelling first, so that a synonym never shadows a longer one (§3.8). */
function ordered(spellings: Spellings): [string, Set<string>][] {
  return [...spellings].sort(([a], [b]) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0));
}

/** `Screen(?=:)|画面(?=[:：])`: each spelling followed by one of its own colons. */
function keywordBeforeColon(spellings: Spellings): string {
  return ordered(spellings)
    .map(([text, colons]) => `${escapeRegExp(text)}(?=${charClass(colons)})`)
    .join('|');
}

function allColons(languages: readonly LanguageDefinition[]): string {
  return charClass(languages.flatMap((language) => language.colons));
}

/** Rules for the name keywords of one slot group, with the scopes of the keyword and the name. */
function nameKeywordRules(
  languages: readonly LanguageDefinition[],
  slots: readonly (keyof LanguageKeywords)[],
  keywordScope: string,
  nameScope: string,
): GrammarRule[] {
  const keyword = `((?:${keywordBeforeColon(collect(languages, slots))})(${allColons(languages)}))`;
  const keywordCaptures = { name: keywordScope };
  return [
    {
      // `Show:` without a name (SANMAIME_E002).
      match: `^${WS}*(${keyword})${WS}*$`,
      captures: {
        '1': { name: SCOPES.missingName },
        '2': keywordCaptures,
        '3': { name: SCOPES.colon },
      },
    },
    {
      match: `^${WS}*${keyword}${WS}*(.*?)${WS}*$`,
      captures: {
        '1': keywordCaptures,
        '2': { name: SCOPES.colon },
        '3': { name: nameScope },
      },
    },
  ];
}

/**
 * Rules for `Text: <target> = "<text>"` and `Count: <target> = <n>` (v0.3). The target ends at
 * the first `=` that stands alone (whitespace on both sides), as in the parser; a valid value is
 * scoped as a string or a number, anything else as an invalid value (E027), and an argument
 * without a standalone `=` as a missing value (E026).
 */
function valueKeywordRules(languages: readonly LanguageDefinition[]): GrammarRule[] {
  const colon = `(${allColons(languages)})`;
  const keywordOf = (slots: readonly (keyof LanguageKeywords)[]): string =>
    `((?:${keywordBeforeColon(collect(languages, slots))}))`;
  const all = keywordOf([...TEXT_VALUE_SLOTS, ...NUMBER_VALUE_SLOTS]);
  // The target: no character of it starts a standalone ` = `.
  const target = `((?:(?!${WS}=(?:${WS}|$)).)*?)`;
  const head = (keyword: string): string => `^${WS}*${keyword}${colon}${WS}*${target}${WS}+(=)`;
  const captures = (valueScope: string): Record<string, GrammarRule> => ({
    '1': { name: SCOPES.expectation },
    '2': { name: SCOPES.colon },
    '3': { name: SCOPES.target },
    '4': { name: SCOPES.valueSeparator },
    '5': { name: valueScope },
  });
  return [
    {
      // `Text:` without anything (SANMAIME_E002).
      match: `^${WS}*(${all}${colon})${WS}*$`,
      captures: {
        '1': { name: SCOPES.missingName },
        '2': { name: SCOPES.expectation },
        '3': { name: SCOPES.colon },
      },
    },
    {
      match: `${head(keywordOf(TEXT_VALUE_SLOTS))}${WS}+("(?:[^"\\\\]|\\\\["\\\\])*")${WS}*$`,
      captures: captures(SCOPES.text),
    },
    {
      match: `${head(keywordOf(NUMBER_VALUE_SLOTS))}${WS}+([0-9]+)${WS}*$`,
      captures: captures(SCOPES.number),
    },
    {
      // A value that is not valid for its keyword (SANMAIME_E027).
      match: `${head(all)}(?:${WS}+(.*?))?${WS}*$`,
      captures: captures(SCOPES.invalidValue),
    },
    {
      // No standalone ` = ` (SANMAIME_E026).
      match: `^${WS}*${all}${colon}${WS}*(.*?)${WS}*$`,
      captures: {
        '1': { name: SCOPES.expectation },
        '2': { name: SCOPES.colon },
        '3': { name: SCOPES.missingValue },
      },
    },
  ];
}

/**
 * The rules of the body of a file whose keywords are those of `languages`. `everyColon` holds the
 * colons of every supported language, used to flag `Word:` lines as unknown keywords.
 */
function bodyRules(
  languages: readonly LanguageDefinition[],
  everyColon: readonly string[],
): GrammarRule[] {
  const bare = ordered(collect(languages, STATE_SLOTS));
  const bareExact = bare.map(([text]) => escapeRegExp(text)).join('|');
  const bareWithArgument = bare.map(([text]) => `${escapeRegExp(text)}(?=${WS})`).join('|');
  return [
    { include: '#comment' },
    { include: '#tags' },
    ...nameKeywordRules(languages, ['screen', 'element'], SCOPES.structure, SCOPES.section),
    // `Background:`, `When:` and `And when:` all name a condition (v0.2).
    ...nameKeywordRules(
      languages,
      ['background', 'when', 'andWhen'],
      SCOPES.condition,
      SCOPES.conditionName,
    ),
    ...nameKeywordRules(languages, ['show', 'hide', 'and'], SCOPES.expectation, SCOPES.target),
    ...valueKeywordRules(languages),
    // `Enable: X`, `Check: X`: a state of a target (v0.3).
    ...nameKeywordRules(languages, STATE_SLOTS, SCOPES.state, SCOPES.target),
    {
      // `Enable`, `Check`, …: the whole trimmed line is the keyword (the element itself).
      match: `^${WS}*(${bareExact})${WS}*$`,
      captures: { '1': { name: SCOPES.state } },
    },
    {
      // `Enable X`: an argument without a colon (SANMAIME_E003).
      match: `^${WS}*((?:${bareWithArgument}).*?)${WS}*$`,
      captures: { '1': { name: SCOPES.illegal } },
    },
    {
      // Anything else that looks like `Word:` is an unknown keyword (SANMAIME_E001). This also
      // catches keywords of another language (or `Show：X` in an English file) when the file
      // declares its language.
      match: `^${WS}*([^${WS_CHARS}#@${everyColon.map(escapeRegExp).join('')}]+${charClass(everyColon)})`,
      captures: { '1': { name: SCOPES.illegal } },
    },
  ];
}

/** `# language: <value>`, capturing `#`, `language`, `:` and the value. */
function directive(value: string): string {
  return `^${WS}*(#)${WS}*(language)${WS}*(:)${WS}*(${value})${WS}*$`;
}

function directiveCaptures(valueScope: string): Record<string, GrammarRule> {
  return {
    '0': { name: SCOPES.directive },
    '1': { name: SCOPES.commentPunctuation },
    '2': { name: SCOPES.directiveKeyword },
    '3': { name: SCOPES.colon },
    '4': { name: valueScope },
  };
}

/** Build the grammar for the given keyword languages (normally `LANGUAGES` of the parser). */
export function buildGrammar(languages: Readonly<Record<string, LanguageDefinition>>): Grammar {
  const list = Object.values(languages);
  const everyColon = [...new Set(list.flatMap((language) => language.colons))];
  const repository: Record<string, GrammarRule> = {
    header: {
      // The header: blank and comment lines before the first significant line (§3.4). Entered
      // only when the file starts with such a line; ends before the first significant line.
      begin: `\\A(?=${WS}*(?:#|$))`,
      end: `^(?=${WS}*[^${WS_CHARS}#])`,
      patterns: [
        ...list.map((language) => ({ include: `#directive-${language.code}` })),
        { include: '#directive-unsupported' },
        { include: '#comment' },
      ],
    },
    'directive-unsupported': {
      // An unsupported or empty value (SANMAIME_E017): the default language stays in effect, and
      // a later directive is not considered (only the first one counts).
      begin: directive('.*?'),
      beginCaptures: directiveCaptures(SCOPES.directiveInvalidValue),
      end: '(?!)',
      patterns: [{ include: '#body-any' }],
    },
    comment: {
      match: `^${WS}*((#).*)$`,
      captures: {
        '1': { name: SCOPES.comment },
        '2': { name: SCOPES.commentPunctuation },
      },
    },
    tags: {
      match: `^${WS}*(@.*?)${WS}*$`,
      captures: {
        '1': {
          name: SCOPES.tags,
          patterns: [
            {
              match: `(?<!${NOT_WS})((@)[^${WS_CHARS}@#]+)(?!${NOT_WS})`,
              captures: {
                '1': { name: SCOPES.tag },
                '2': { name: SCOPES.tagPunctuation },
              },
            },
            // Any other token on a tag line (SANMAIME_E020).
            { match: `${NOT_WS}+`, name: SCOPES.invalidTag },
          ],
        },
      },
    },
    'body-any': { patterns: bodyRules(list, everyColon) },
  };
  for (const language of list) {
    // A valid directive selects the keywords of its language for the rest of the file. `(?!)`
    // never matches, so the region lasts until the end of the file.
    repository[`directive-${language.code}`] = {
      begin: directive(escapeRegExp(language.code)),
      beginCaptures: directiveCaptures(SCOPES.directiveValue),
      end: '(?!)',
      patterns: [{ include: `#body-${language.code}` }],
    };
    repository[`body-${language.code}`] = { patterns: bodyRules([language], everyColon) };
  }
  return {
    $schema: 'https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json',
    name: 'Sanmaime',
    scopeName: SCOPE_NAME,
    fileTypes: ['sanmaime'],
    comment:
      'Generated by editors/vscode-sanmaime/scripts/build-grammar.ts from src/parser/languages.ts. Do not edit; run `npm run build:grammar`.',
    patterns: [{ include: '#header' }, { include: '#body-any' }],
    repository,
  };
}
