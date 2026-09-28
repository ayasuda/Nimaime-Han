/**
 * AST of a Sanmaime document (docs/sanmaime.md §10).
 *
 * Every node carries a 1-based `location` pointing at the first non-whitespace character of the
 * line that introduced it. Columns count Unicode code points; a tab counts as one column.
 */

/** A 1-based source position. */
export interface Location {
  line: number;
  column: number;
}

/** The root node: one parsed `.sanmaime` file. */
export interface SanmaimeDocument {
  /** The `uri` passed to `parse()`, if any (a file path or URL; used for diagnostics rendering). */
  uri: string | undefined;
  /**
   * Effective keyword language (`"en"`, `"ja"`): the header directive if valid, else the `language`
   * option of `parse()`, else `"en"`.
   */
  language: string;
  /** The first `# language:` directive of the header, as written, or `undefined` if none. */
  languageDirective: LanguageDirective | undefined;
  screens: Screen[];
}

/** A `# language: <value>` comment in the file header (§3.4). */
export interface LanguageDirective {
  /** The trimmed value after the colon (may be unsupported or empty; see `SANMAIME_E017`). */
  value: string;
  location: Location;
}

/**
 * A tag from an `@tag` line (§3.7), attached to the `Screen:`, `Element:` or `When:` that follows.
 * The tags of a test are the union of its screen's, element's and block's tags (§5.8).
 */
export interface Tag {
  /** The tag including its leading `@`, e.g. `"@smoke"`. */
  name: string;
  location: Location;
}

/** `Screen: <name>` */
export interface Screen {
  name: string;
  tags: Tag[];
  location: Location;
  elements: Element[];
}

/** `Element: <name>` */
export interface Element {
  name: string;
  tags: Tag[];
  location: Location;
  /** Expectations written before the first `When:` (invariants of the screen, §5.4). */
  unconditional: Expectation[];
  /** `When:` blocks in source order. */
  conditions: ConditionBlock[];
}

/** `When: <name>` and the expectations that follow it. */
export interface ConditionBlock {
  /** The condition name (the text after `When:`). */
  name: string;
  /** Tags written before `When:` (block-level tags). */
  tags: Tag[];
  location: Location;
  expectations: Expectation[];
}

/**
 * `Show:` / `Hide:` / `And:` — a visibility expectation about a named target of the element.
 * `And:` is already resolved to the kind of the group it continues (§5.6).
 */
export interface VisibilityExpectation {
  kind: 'show' | 'hide';
  target: string;
  /** The keyword used, in its canonical (English) form whatever the file's language. */
  keyword: 'Show' | 'Hide' | 'And';
  /** `true` when written as `And:` (then `kind` is inherited from the preceding `Show:`/`Hide:`). */
  viaAnd: boolean;
  location: Location;
}

/** `Enable` / `Disable` — a state expectation about the element itself. */
export interface StateExpectation {
  kind: 'enable' | 'disable';
  /** Canonical (English) keyword, whatever the file's language. */
  keyword: 'Enable' | 'Disable';
  location: Location;
}

export type Expectation = VisibilityExpectation | StateExpectation;
