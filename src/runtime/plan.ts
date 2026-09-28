/** A position in a `.sanmaime` file (1-based). */
export interface SanmaimePosition {
  line: number;
  column: number;
}

/** The kind of a Sanmaime expectation (`And:` is resolved to `show` / `hide` by the parser). */
export type ExpectationKind = 'show' | 'hide' | 'enable' | 'disable';

/** One expectation of a plan: `Show: X` / `Hide: X` (with `target`) or `Enable` / `Disable`. */
export interface NimaimeExpectation {
  kind: ExpectationKind;
  /** The target name, required for `show` / `hide`, ignored for `enable` / `disable`. */
  target?: string;
  /** Position of the expectation line in the `.sanmaime` file. */
  location?: SanmaimePosition;
}

/**
 * What one generated test checks: one Element of one Screen, in the base state (no `condition`)
 * or in the state established by one `When:` condition. Emitted by the generator as a literal.
 */
export interface NimaimePlan {
  /** `Screen:` name. */
  screen: string;
  /** `Element:` name. */
  element: string;
  /** `When:` name; omitted for the element's unconditional block (the base state). */
  condition?: string;
  /** The expectations of the block, in source order. */
  expectations: readonly NimaimeExpectation[];
  /**
   * The `.sanmaime` file. A relative path is resolved against the directory of the running spec
   * file (the generated `.spec.ts`). Used for step locations and failure messages.
   */
  file?: string;
  /** Positions of the `Screen:`, `Element:` and `When:` lines in `file`. */
  locations?: {
    screen?: SanmaimePosition;
    element?: SanmaimePosition;
    condition?: SanmaimePosition;
  };
}

/** Context passed to the low-level `Nimaime` methods (for step locations and failure messages). */
export interface ExpectationContext {
  /** `Screen:` name (used to resolve screen-scoped conditions and in failure messages). */
  screen?: string;
  /** `When:` name, if the expectation belongs to a condition block. */
  condition?: string;
  /** The `.sanmaime` file (see `NimaimePlan.file`). */
  file?: string;
  /** Position of the expectation line. */
  location?: SanmaimePosition;
}

/** Keyword of an expectation kind as written in English Sanmaime (the step title prefix). */
export const EXPECTATION_KEYWORDS: Readonly<Record<ExpectationKind, string>> = {
  show: 'Show',
  hide: 'Hide',
  enable: 'Enable',
  disable: 'Disable',
};

/** Step title of an expectation: `Show: Username`, `Hide: Full name`, `Enable`, `Disable`. */
export function expectationTitle(kind: ExpectationKind, target?: string): string {
  const keyword = EXPECTATION_KEYWORDS[kind];
  return kind === 'show' || kind === 'hide' ? `${keyword}: ${target ?? ''}` : keyword;
}
