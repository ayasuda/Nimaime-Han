/**
 * Diagnostics reported by the Sanmaime parser (docs/sanmaime.md §7).
 *
 * Codes and locations are normative; message texts follow the spec's suggestions but may evolve.
 * Messages are in English, but keywords quoted in them are spelled in the file's keyword language.
 */
import {
  EXPECTATION_KINDS,
  EXPECTATIONS,
  type ExpectationValueType,
} from '../runtime/expectations';
import type { Location } from './ast';
import type { CanonicalKeyword } from './tokens';

/** Stable diagnostic codes. Codes are never reused. */
export const DiagnosticCode = {
  /** Unrecognised line: unknown keyword, wrong case, missing colon, free text. */
  UnrecognisedLine: 'SANMAIME_E001',
  /** A name keyword has an empty name. */
  MissingName: 'SANMAIME_E002',
  /** A state keyword (`Enable`, `Check`, …) followed by an argument without a colon. */
  BareKeywordWithArgument: 'SANMAIME_E003',
  /** `Element:` before any `Screen:`. */
  ElementOutsideScreen: 'SANMAIME_E004',
  /** `When:` before any `Element:` of the current screen. */
  WhenOutsideElement: 'SANMAIME_E005',
  /** An expectation before any `Element:` of the current screen. */
  ExpectationOutsideElement: 'SANMAIME_E006',
  /** `And:` with no `Show:`/`Hide:` group to continue in the same block. */
  DanglingAnd: 'SANMAIME_E007',
  /** A `When:` block with no expectations. */
  EmptyConditionBlock: 'SANMAIME_E008',
  /** An `Element:` with no expectations. */
  EmptyElement: 'SANMAIME_E009',
  /** A `Screen:` with no `Element:`. */
  EmptyScreen: 'SANMAIME_E010',
  /** Two screens with the same name in one file. */
  DuplicateScreen: 'SANMAIME_E011',
  /** Two elements with the same name in one screen. */
  DuplicateElement: 'SANMAIME_E012',
  /** Two `When:` blocks with the same name in one element. */
  DuplicateCondition: 'SANMAIME_E013',
  /** The same fact about a target asserted twice in the same block (same target and family). */
  DuplicateTarget: 'SANMAIME_E014',
  /** Two states of the same family of the element itself in one block (`Enable` + `Disable`). */
  DuplicateState: 'SANMAIME_E015',
  /** A condition block re-asserts something the unconditional block already asserts. */
  ConflictsWithUnconditional: 'SANMAIME_E016',
  /** Invalid language directive (unsupported / empty / duplicate). */
  InvalidLanguage: 'SANMAIME_E017',
  /** Tag lines not followed by `Screen:`, `Element:` or `When:`. */
  MisplacedTags: 'SANMAIME_E018',
  /**
   * Use of the reserved keyword `Background:` (v0 and v0.1). Retired in v0.2, where `Background:`
   * became a keyword: no longer reported, kept so that the code is never reused.
   */
  ReservedKeyword: 'SANMAIME_E019',
  /** Malformed tag line. */
  InvalidTag: 'SANMAIME_E020',
  /** An expectation after `Background:`, before the screen's first `Element:` (v0.2). */
  BackgroundWithExpectations: 'SANMAIME_E021',
  /**
   * A condition established twice for one test (v0.2): a repeated `Background:` name, a name
   * repeated in the `When:` / `And when:` lines of one block, or a block condition that the
   * screen's `Background:` already establishes.
   */
  DuplicateConditionInChain: 'SANMAIME_E022',
  /** `And when:` that does not directly follow `When:` or `And when:` (v0.2). */
  MisplacedAndWhen: 'SANMAIME_E023',
  /** Invalid status directive (unknown / empty value / duplicate). */
  InvalidStatus: 'SANMAIME_E024',
  /** `Background:` outside a screen or after the screen's first `Element:` (v0.2). */
  MisplacedBackground: 'SANMAIME_E025',
  /** A value keyword (`Text:`, `Contain:`, `Count:`) without ` = <value>` (v0.3). */
  MissingValue: 'SANMAIME_E026',
  /** A value that is not a valid quoted text / whole number (v0.3). */
  InvalidValue: 'SANMAIME_E027',
} as const;

export type DiagnosticCode = (typeof DiagnosticCode)[keyof typeof DiagnosticCode];

/** All diagnostics are errors; `warning` is reserved for future lint-style checks. */
export type DiagnosticSeverity = 'error' | 'warning';

export interface Diagnostic {
  code: DiagnosticCode;
  severity: DiagnosticSeverity;
  message: string;
  location: Location;
}

/**
 * Render a diagnostic in the editor/problem-matcher friendly form of §7.1:
 * `specs/login.sanmaime:7:5: error SANMAIME_E007: message`.
 * Without a `uri` the location prefix is `line:column`.
 */
export function formatDiagnostic(diagnostic: Diagnostic, uri?: string): string {
  const { line, column } = diagnostic.location;
  const position = `${String(line)}:${String(column)}`;
  const where = uri === undefined || uri === '' ? position : `${uri}:${position}`;
  return `${where}: ${diagnostic.severity} ${diagnostic.code}: ${diagnostic.message}`;
}

/** The spelling of each keyword that messages should quote. */
export type KeywordSpellings = Readonly<Record<CanonicalKeyword, string>>;

/**
 * Message builders, one per code. `k` gives the primary spelling of each keyword in the active
 * language; arguments named `keyword` are keywords as written in the source.
 */
export function createMessages(k: KeywordSpellings) {
  const expectations = expectationKeywordList(k);
  return {
    unrecognisedLine: (text: string, hint: string | undefined): string =>
      `Unrecognised line '${text}'. Expected ${k.Screen}:, ${k.Background}:, ${k.Element}:, ${k.When}:, ${k.AndWhen}:, an expectation (${expectations}), a comment (#) or tags (@).` +
      (hint === undefined ? '' : ` ${hint}`),
    missingName: (keyword: string): string => `'${keyword}:' requires a name.`,
    bareKeywordWithArgument: (keyword: string, argument: string): string =>
      `'${keyword}' takes no argument without a colon. Write '${keyword}' on its own line for the element itself, or '${keyword}: ${argument}' for a target.`,
    missingValue: (keyword: string, target: string, type: ExpectationValueType): string =>
      `'${keyword}:' needs a value after ' = '. Write '${keyword}: ${target === '' ? '<target>' : target} = ${type === 'text' ? '"<text>"' : '<number>'}' (with spaces around '=').`,
    invalidValue: (keyword: string, value: string, type: ExpectationValueType): string =>
      type === 'text'
        ? `Invalid text ${value === '' ? '(nothing)' : `'${value}'`} for '${keyword}:'. Write the text in double quotes, e.g. "Welcome"; inside them write \\" for a quote and \\\\ for a backslash.`
        : `Invalid number ${value === '' ? '(nothing)' : `'${value}'`} for '${keyword}:'. Write a whole number: 0, 1, 2, …`,
    elementOutsideScreen: (): string => `'${k.Element}:' must appear inside a '${k.Screen}:'.`,
    whenOutsideElement: (): string => `'${k.When}:' must appear inside an '${k.Element}:'.`,
    expectationOutsideElement: (keyword: string): string =>
      `'${keyword}' must appear inside an '${k.Element}:'.`,
    danglingAnd: (): string =>
      `'${k.And}:' must follow '${k.Show}:', '${k.Hide}:' or '${k.And}:' in the same block.`,
    emptyConditionBlock: (name: string): string => `Condition '${name}' has no expectations.`,
    emptyElement: (name: string): string => `Element '${name}' has no expectations.`,
    emptyScreen: (name: string): string => `Screen '${name}' has no elements.`,
    duplicateScreen: (name: string, firstLine: number): string =>
      `Duplicate screen '${name}' (first declared on line ${String(firstLine)}).`,
    duplicateElement: (name: string, screen: string, firstLine: number): string =>
      `Duplicate element '${name}' in screen '${screen}' (first declared on line ${String(firstLine)}).`,
    duplicateCondition: (title: string, element: string, firstLine: number): string =>
      `Duplicate condition '${title}' in element '${element}' (first declared on line ${String(firstLine)}). Merge the two blocks.`,
    duplicateTarget: (target: string, firstLine: number): string =>
      `'${target}' is already asserted in this block (line ${String(firstLine)}).`,
    duplicateState: (keyword: string, firstLine: number): string =>
      `This block already declares '${keyword}' (line ${String(firstLine)}).`,
    conflictsWithUnconditional: (target: string, element: string, line: number): string =>
      `'${target}' is already asserted unconditionally for element '${element}' (line ${String(line)}). Unconditional expectations hold in every state.`,
    stateConflictsWithUnconditional: (
      keyword: string,
      unconditionalKeyword: string,
      element: string,
      line: number,
    ): string =>
      `'${keyword}' is not allowed here: element '${element}' already declares '${unconditionalKeyword}' unconditionally (line ${String(line)}). Unconditional expectations hold in every state.`,
    unsupportedLanguage: (code: string, supported: readonly string[]): string =>
      `Unsupported language '${code}'. Supported languages: ${supported.join(', ')}.`,
    duplicateLanguage: (firstLine: number): string =>
      `Duplicate language directive (first on line ${String(firstLine)}).`,
    unknownStatus: (value: string): string =>
      `Unknown status '${value}'. Use 'draft' or 'approved'.`,
    duplicateStatus: (firstLine: number): string =>
      `Duplicate status directive (first on line ${String(firstLine)}).`,
    misplacedTags: (): string =>
      `Tags must be followed by '${k.Screen}:', '${k.Element}:' or '${k.When}:'.`,
    invalidTag: (token: string): string =>
      `Invalid tag '${token}'. A tag is '@' followed by characters other than whitespace, '@' and '#'.`,
    backgroundWithExpectations: (keyword: string): string =>
      `'${keyword}' is not allowed under '${k.Background}:': a background takes no expectations. Put expectations under an '${k.Element}:'.`,
    duplicateBackground: (name: string, screen: string, firstLine: number): string =>
      `Duplicate background condition '${name}' in screen '${screen}' (first on line ${String(firstLine)}).`,
    duplicateBlockCondition: (name: string, firstLine: number): string =>
      `Condition '${name}' is already part of this block (line ${String(firstLine)}).`,
    conditionInBackground: (name: string, firstLine: number): string =>
      `Condition '${name}' is already established by '${k.Background}:' (line ${String(firstLine)}). Background conditions apply to every block of the screen.`,
    misplacedAndWhen: (keyword: string): string =>
      `'${keyword}:' must directly follow '${k.When}:' or '${k.AndWhen}:'.`,
    misplacedBackground: (keyword: string): string =>
      `'${keyword}:' must appear directly under a '${k.Screen}:', before its first '${k.Element}:'.`,
  };
}

export type Messages = ReturnType<typeof createMessages>;

/**
 * The expectation keywords as listed in `E001`, from the vocabulary table: `Show:, Hide:, And:,
 * Enable, Disable, …, Text:, Contain:, Count:`. State keywords are listed bare.
 */
function expectationKeywordList(k: KeywordSpellings): string {
  const list: string[] = [];
  for (const kind of EXPECTATION_KINDS) {
    const { arity, keyword } = EXPECTATIONS[kind];
    list.push(arity === 'optional-target' ? k[keyword] : `${k[keyword]}:`);
    if (kind === 'hide') list.push(`${k.And}:`);
  }
  return list.join(', ');
}
