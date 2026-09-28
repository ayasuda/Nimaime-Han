/**
 * Diagnostics reported by the Sanmaime parser (docs/sanmaime.md §7).
 *
 * Codes and locations are normative; message texts follow the spec's suggestions but may evolve.
 * Messages are in English, but keywords quoted in them are spelled in the file's keyword language.
 */
import type { Location } from './ast';
import type { CanonicalKeyword } from './tokens';

/** Stable diagnostic codes. Codes are never reused. */
export const DiagnosticCode = {
  /** Unrecognised line: unknown keyword, wrong case, missing colon, free text. */
  UnrecognisedLine: 'SANMAIME_E001',
  /** A name keyword has an empty name. */
  MissingName: 'SANMAIME_E002',
  /** `Enable` / `Disable` followed by a colon or an argument. */
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
  /** A target asserted twice in the same block. */
  DuplicateTarget: 'SANMAIME_E014',
  /** More than one `Enable`/`Disable` in the same block. */
  DuplicateState: 'SANMAIME_E015',
  /** A condition block re-asserts something the unconditional block already asserts. */
  ConflictsWithUnconditional: 'SANMAIME_E016',
  /** Invalid language directive (unsupported / empty / duplicate). */
  InvalidLanguage: 'SANMAIME_E017',
  /** Tag lines not followed by `Screen:`, `Element:` or `When:`. */
  MisplacedTags: 'SANMAIME_E018',
  /** Use of the reserved keyword `Background:`. */
  ReservedKeyword: 'SANMAIME_E019',
  /** Malformed tag line. */
  InvalidTag: 'SANMAIME_E020',
} as const;

export type DiagnosticCode = (typeof DiagnosticCode)[keyof typeof DiagnosticCode];

/** All v0 diagnostics are errors; `warning` is reserved for future lint-style checks. */
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
  return {
    unrecognisedLine: (text: string, hint: string | undefined): string =>
      `Unrecognised line '${text}'. Expected ${k.Screen}:, ${k.Element}:, ${k.When}:, ${k.Show}:, ${k.Hide}:, ${k.And}:, ${k.Enable}, ${k.Disable}, a comment (#) or tags (@).` +
      (hint === undefined ? '' : ` ${hint}`),
    missingName: (keyword: string): string => `'${keyword}:' requires a name.`,
    bareKeywordWithArgument: (keyword: string): string =>
      `'${keyword}' takes no argument. Write '${keyword}' on its own line.`,
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
    duplicateCondition: (name: string, element: string, firstLine: number): string =>
      `Duplicate condition '${name}' in element '${element}' (first declared on line ${String(firstLine)}). Merge the two blocks.`,
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
    misplacedTags: (): string =>
      `Tags must be followed by '${k.Screen}:', '${k.Element}:' or '${k.When}:'.`,
    reservedKeyword: (keyword: string): string =>
      `'${keyword}:' is reserved for a future version of Sanmaime and is not supported in v0.`,
    invalidTag: (token: string): string =>
      `Invalid tag '${token}'. A tag is '@' followed by characters other than whitespace, '@' and '#'.`,
  };
}

export type Messages = ReturnType<typeof createMessages>;
