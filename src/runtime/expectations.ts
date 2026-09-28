/**
 * The expectation vocabulary of Sanmaime: **the one place** that maps each expectation keyword to
 * its syntax, its Playwright matcher, and how it is described in step titles and failure messages
 * (docs/expectations.md).
 *
 * | Kind       | Keyword    | Form                          | Playwright                    |
 * | ---------- | ---------- | ----------------------------- | ----------------------------- |
 * | `show`     | `Show`     | `Show: <target>`              | `toBeVisible()`               |
 * | `hide`     | `Hide`     | `Hide: <target>`              | `toBeHidden()`                |
 * | `enable`   | `Enable`   | `Enable` / `Enable: <target>` | `toBeEnabled()`               |
 * | `disable`  | `Disable`  | idem                          | `toBeDisabled()`              |
 * | `check`    | `Check`    | idem                          | `toBeChecked()`               |
 * | `uncheck`  | `Uncheck`  | idem                          | `not.toBeChecked()`           |
 * | `focus`    | `Focus`    | idem                          | `toBeFocused()`               |
 * | `editable` | `Editable` | idem                          | `toBeEditable()`              |
 * | `readonly` | `ReadOnly` | idem                          | `not.toBeEditable()`          |
 * | `empty`    | `Empty`    | idem                          | `toBeEmpty()`                 |
 * | `text`     | `Text`     | `Text: <target> = "<text>"`   | `toHaveText(text)`            |
 * | `contain`  | `Contain`  | `Contain: <target> = "<text>"`| `toContainText(text)`         |
 * | `count`    | `Count`    | `Count: <target> = <n>`       | `toHaveCount(n)`              |
 *
 * Adding a keyword means adding an entry to `EXPECTATIONS` (and its spellings to
 * `src/parser/languages.ts`); the parser, the generator, the runtime, the reporter and the editor
 * grammar are all driven by this table.
 *
 * This module is pure (no Playwright import at run time: matchers receive `expect`), so the parser
 * and the reporter can use it too.
 */
import type { expect as playwrightExpect, Locator } from '@playwright/test';

/** Playwright's `expect`, as passed to the matchers. */
export type PlaywrightExpect = typeof playwrightExpect;

/**
 * What an expectation keyword takes:
 *
 * - `target`: a target name (`Show: Username`).
 * - `optional-target`: nothing (the element itself, its `self` locator: `Enable`) or a target
 *   name after a colon (`Enable: Login button`).
 * - `target-value`: a target name, ` = ` and a value (`Text: Title = "Welcome"`).
 */
export type ExpectationArity = 'target' | 'optional-target' | 'target-value';

/** The type of the value of a `target-value` keyword: a quoted text or a whole number. */
export type ExpectationValueType = 'text' | 'int';

/** The value of an expectation (`Text:` / `Contain:`: a string, `Count:`: a number). */
export type ExpectationValue = string | number;

/**
 * The language slot of each expectation keyword (`LanguageKeywords` in src/parser/languages.ts).
 * Kept here as literal types so that this module has no imports.
 */
export type ExpectationSlot =
  | 'show'
  | 'hide'
  | 'enable'
  | 'disable'
  | 'check'
  | 'uncheck'
  | 'focus'
  | 'editable'
  | 'readOnly'
  | 'empty'
  | 'text'
  | 'contain'
  | 'count';

/** One entry of the vocabulary table. */
export interface ExpectationSpec<
  K extends string = string,
  W extends string = string,
  A extends ExpectationArity = ExpectationArity,
> {
  kind: K;
  /** The canonical (English) keyword: step titles and the AST use it in every language. */
  keyword: W;
  /** The keyword's slot in the language dictionaries (`LanguageKeywords`). */
  slot: ExpectationSlot;
  arity: A;
  /** For `target-value` keywords: the type of the value. */
  valueType?: ExpectationValueType;
  /**
   * What the expectation is about, for the one-fact-per-block rules (docs/sanmaime.md §6): two
   * expectations of one family about the same subject (the same target, or the element itself)
   * in one block are a duplicate or a contradiction (`Show: X` + `Hide: X`, `Check` + `Uncheck`).
   * `contain` is the exception: its value is part of the fact (`Contain: X = "a"` and
   * `Contain: X = "b"` are two facts).
   */
  family: string;
  /** The Playwright assertion, for documentation (`toBeVisible()`, `not.toBeChecked()`). */
  playwright: string;
  /** Runs the web-first assertion. `value` is set for `target-value` keywords. */
  matcher: (
    expect: PlaywrightExpect,
    locator: Locator,
    value: ExpectationValue | undefined,
  ) => Promise<void>;
  /**
   * The `Expected:` line of a failure and the reporter's line: `Username is shown`, `enabled`
   * (the element itself), `Remember me is checked`, `Title has text "Welcome"`,
   * `Count of Items is 3`.
   */
  describeExpected: (target: string | undefined, value: ExpectationValue | undefined) => string;
  /**
   * Recovers the target and value from a `describeExpected()` text; `undefined` when `text` is not
   * one of this kind's phrasings.
   */
  parseExpected: (
    text: string,
  ) => { target: string | undefined; value?: ExpectationValue } | undefined;
  /**
   * Observes the actual state after a failure, without waiting (best effort; `undefined` when it
   * cannot be observed). Never throws.
   */
  probeActual: (locator: Locator) => Promise<string | undefined>;
}

// ---------------------------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------------------------

/** A text value as written in Sanmaime and in step titles: `"Say \"hi\""`. */
export function formatTextLiteral(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Parses a double-quoted text value (`"Welcome"`): `\"` is a quote and `\\` a backslash; any other
 * backslash, or a quote that is not escaped, makes it invalid (`undefined`).
 */
export function parseTextLiteral(literal: string): string | undefined {
  const match = /^"((?:[^"\\]|\\["\\])*)"$/.exec(literal);
  return match ? (match[1] ?? '').replace(/\\(["\\])/g, '$1') : undefined;
}

/** Parses a whole number (ASCII digits, `0` or more); `undefined` when invalid. */
export function parseIntLiteral(literal: string): number | undefined {
  if (!/^[0-9]+$/.test(literal)) return undefined;
  const value = Number(literal);
  return Number.isSafeInteger(value) ? value : undefined;
}

/** Parses a value of `type`; `undefined` when invalid. */
export function parseValue(
  type: ExpectationValueType,
  literal: string,
): ExpectationValue | undefined {
  return type === 'text' ? parseTextLiteral(literal) : parseIntLiteral(literal);
}

/** A value as written in Sanmaime: a quoted text or a number. */
export function formatValue(value: ExpectationValue): string {
  return typeof value === 'number' ? String(value) : formatTextLiteral(value);
}

/**
 * Splits the argument of a `target-value` keyword (`Title = "Welcome"`) at its **first** `=` that
 * stands alone: preceded by whitespace (or the start) and followed by whitespace (or the end).
 * Targets therefore cannot contain ` = `; values can. Returns `undefined` when there is no such
 * `=` (E026). Both parts are trimmed and may be empty.
 */
export function splitTargetValue(argument: string): { target: string; value: string } | undefined {
  const match = /(?:^|\s)=(?:\s|$)/.exec(argument);
  if (!match) return undefined;
  const equals = match.index + match[0].indexOf('=');
  return { target: argument.slice(0, equals).trim(), value: argument.slice(equals + 1).trim() };
}

// ---------------------------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------------------------

const PROBE = { timeout: 1000 };
const MAX_TEXT = 80;

/** A text for `Actual:`, quoted, whitespace collapsed and truncated: `text "Hello"`. */
function actualText(text: string | null): string {
  const normalized = (text ?? '').replace(/\s+/g, ' ').trim();
  const short = normalized.length > MAX_TEXT ? `${normalized.slice(0, MAX_TEXT - 1)}…` : normalized;
  return `text ${formatTextLiteral(short)}`;
}

/** Probes one element: `notFound` when none matches, a note when several match. Never throws. */
async function probeOne(
  locator: Locator,
  read: () => Promise<string>,
  notFound = 'not found',
): Promise<string | undefined> {
  try {
    const count = await locator.count();
    if (count === 0) return notFound;
    if (count > 1) return `${String(count)} matching elements (expected exactly one)`;
    return await read();
  } catch {
    return undefined;
  }
}

const EMPTY_VALUE =
  '(el) => (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) ? el.value : (el.textContent ?? "")';

// ---------------------------------------------------------------------------------------------
// Entry builders
// ---------------------------------------------------------------------------------------------

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface StateOptions<K extends string, W extends string> {
  kind: K;
  keyword: W;
  slot: ExpectationSlot;
  family: string;
  playwright: string;
  /** `enabled`, `not checked`: the element itself, or `<target> is <phrase>`. */
  phrase: string;
  matcher: (expect: PlaywrightExpect, locator: Locator) => Promise<void>;
  probe: (locator: Locator) => Promise<string | undefined>;
}

/** A keyword about a state: `Enable` (the element itself) / `Enable: X` (a target). */
function state<const K extends string, const W extends string>(
  options: StateOptions<K, W>,
): ExpectationSpec<K, W, 'optional-target'> {
  return stateSpec(options, 'optional-target');
}

/** `Show:` / `Hide:`: a state keyword that always takes a target. */
function visibility<const K extends string, const W extends string>(
  options: StateOptions<K, W>,
): ExpectationSpec<K, W, 'target'> {
  return stateSpec(options, 'target');
}

function stateSpec<K extends string, W extends string, A extends 'target' | 'optional-target'>(
  options: StateOptions<K, W>,
  arity: A,
): ExpectationSpec<K, W, A> {
  const withTarget = new RegExp(`^(.*) is ${escapeRegExp(options.phrase)}$`);
  return {
    kind: options.kind,
    keyword: options.keyword,
    slot: options.slot,
    arity,
    family: options.family,
    playwright: options.playwright,
    matcher: (expect, locator) => options.matcher(expect, locator),
    describeExpected: (target) =>
      target === undefined ? options.phrase : `${target} is ${options.phrase}`,
    parseExpected: (text) => {
      if (arity === 'optional-target' && text === options.phrase) return { target: undefined };
      const match = withTarget.exec(text);
      return match ? { target: match[1] ?? '' } : undefined;
    },
    probeActual: options.probe,
  };
}

/** `(<target>) has text "<text>"`, with the literal captured last. */
const TEXT_LITERAL = '("(?:[^"\\\\]|\\\\["\\\\])*")';

// ---------------------------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------------------------

const visibilityProbe =
  (fallback: (visible: boolean) => string) =>
  (locator: Locator): Promise<string | undefined> =>
    probeOne(locator, async () => fallback(await locator.isVisible()), 'hidden (not found)');

const shown = (visible: boolean): string => (visible ? 'shown' : 'hidden');
const enabledProbe = (locator: Locator): Promise<string | undefined> =>
  probeOne(locator, async () => ((await locator.isEnabled(PROBE)) ? 'enabled' : 'disabled'));
const checkedProbe = (locator: Locator): Promise<string | undefined> =>
  probeOne(locator, async () => ((await locator.isChecked(PROBE)) ? 'checked' : 'not checked'));
const editableProbe = (locator: Locator): Promise<string | undefined> =>
  probeOne(locator, async () => ((await locator.isEditable(PROBE)) ? 'editable' : 'read-only'));
const focusedProbe = (locator: Locator): Promise<string | undefined> =>
  probeOne(locator, async () =>
    (await locator.evaluate('(el) => el === el.ownerDocument.activeElement', undefined, PROBE)) ===
    true
      ? 'focused'
      : 'not focused',
  );
const emptyProbe = (locator: Locator): Promise<string | undefined> =>
  probeOne(locator, async () => {
    const value = await locator.evaluate(EMPTY_VALUE, undefined, PROBE);
    const text = typeof value === 'string' ? value : '';
    return text.trim() === '' ? 'empty' : actualText(text);
  });
const textProbe = (locator: Locator): Promise<string | undefined> =>
  probeOne(locator, async () => actualText(await locator.textContent(PROBE)));

/** Every expectation kind, keyed by kind, in keyword-table order. */
export const EXPECTATIONS = {
  show: visibility({
    kind: 'show',
    keyword: 'Show',
    slot: 'show',
    family: 'visibility',
    playwright: 'toBeVisible()',
    phrase: 'shown',
    matcher: (expect, locator) => expect(locator).toBeVisible(),
    probe: visibilityProbe(shown),
  }),
  hide: visibility({
    kind: 'hide',
    keyword: 'Hide',
    slot: 'hide',
    family: 'visibility',
    playwright: 'toBeHidden()',
    phrase: 'hidden',
    matcher: (expect, locator) => expect(locator).toBeHidden(),
    probe: visibilityProbe(shown),
  }),
  enable: state({
    kind: 'enable',
    keyword: 'Enable',
    slot: 'enable',
    family: 'enabled',
    playwright: 'toBeEnabled()',
    phrase: 'enabled',
    matcher: (expect, locator) => expect(locator).toBeEnabled(),
    probe: enabledProbe,
  }),
  disable: state({
    kind: 'disable',
    keyword: 'Disable',
    slot: 'disable',
    family: 'enabled',
    playwright: 'toBeDisabled()',
    phrase: 'disabled',
    matcher: (expect, locator) => expect(locator).toBeDisabled(),
    probe: enabledProbe,
  }),
  check: state({
    kind: 'check',
    keyword: 'Check',
    slot: 'check',
    family: 'checked',
    playwright: 'toBeChecked()',
    phrase: 'checked',
    matcher: (expect, locator) => expect(locator).toBeChecked(),
    probe: checkedProbe,
  }),
  uncheck: state({
    kind: 'uncheck',
    keyword: 'Uncheck',
    slot: 'uncheck',
    family: 'checked',
    playwright: 'not.toBeChecked()',
    phrase: 'not checked',
    matcher: (expect, locator) => expect(locator).not.toBeChecked(),
    probe: checkedProbe,
  }),
  focus: state({
    kind: 'focus',
    keyword: 'Focus',
    slot: 'focus',
    family: 'focus',
    playwright: 'toBeFocused()',
    phrase: 'focused',
    matcher: (expect, locator) => expect(locator).toBeFocused(),
    probe: focusedProbe,
  }),
  editable: state({
    kind: 'editable',
    keyword: 'Editable',
    slot: 'editable',
    family: 'editable',
    playwright: 'toBeEditable()',
    phrase: 'editable',
    matcher: (expect, locator) => expect(locator).toBeEditable(),
    probe: editableProbe,
  }),
  readonly: state({
    kind: 'readonly',
    keyword: 'ReadOnly',
    slot: 'readOnly',
    family: 'editable',
    playwright: 'not.toBeEditable()',
    phrase: 'read-only',
    matcher: (expect, locator) => expect(locator).not.toBeEditable(),
    probe: editableProbe,
  }),
  empty: state({
    kind: 'empty',
    keyword: 'Empty',
    slot: 'empty',
    family: 'empty',
    playwright: 'toBeEmpty()',
    phrase: 'empty',
    matcher: (expect, locator) => expect(locator).toBeEmpty(),
    probe: emptyProbe,
  }),
  text: textValue({
    kind: 'text',
    keyword: 'Text',
    slot: 'text',
    playwright: 'toHaveText(text)',
    verb: 'has text',
    matcher: (expect, locator, text) => expect(locator).toHaveText(text),
  }),
  contain: textValue({
    kind: 'contain',
    keyword: 'Contain',
    slot: 'contain',
    playwright: 'toContainText(text)',
    verb: 'contains text',
    matcher: (expect, locator, text) => expect(locator).toContainText(text),
  }),
  count: {
    kind: 'count',
    keyword: 'Count',
    slot: 'count',
    arity: 'target-value',
    valueType: 'int',
    family: 'count',
    playwright: 'toHaveCount(n)',
    matcher: (expect, locator, value) => expect(locator).toHaveCount(Number(value)),
    describeExpected: (target, value) => `Count of ${target ?? ''} is ${String(value ?? '')}`,
    parseExpected: (text) => {
      const match = /^Count of (.*) is ([0-9]+)$/.exec(text);
      return match ? { target: match[1] ?? '', value: Number(match[2]) } : undefined;
    },
    probeActual: async (locator) => {
      try {
        return String(await locator.count());
      } catch {
        return undefined;
      }
    },
  },
} as const satisfies Record<string, ExpectationSpec>;

interface TextValueOptions<K extends string, W extends string> {
  kind: K;
  keyword: W;
  slot: ExpectationSlot;
  playwright: string;
  /** `has text`: `<target> has text "<text>"`. */
  verb: string;
  matcher: (expect: PlaywrightExpect, locator: Locator, text: string) => Promise<void>;
}

/** `Text: <target> = "<text>"` / `Contain: <target> = "<text>"`. */
function textValue<const K extends string, const W extends string>(
  options: TextValueOptions<K, W>,
): ExpectationSpec<K, W, 'target-value'> {
  const pattern = new RegExp(`^(.*) ${escapeRegExp(options.verb)} ${TEXT_LITERAL}$`);
  return {
    kind: options.kind,
    keyword: options.keyword,
    slot: options.slot,
    arity: 'target-value',
    valueType: 'text',
    family: options.kind,
    playwright: options.playwright,
    matcher: (expect, locator, value) => options.matcher(expect, locator, String(value ?? '')),
    describeExpected: (target, value) =>
      `${target ?? ''} ${options.verb} ${formatTextLiteral(String(value ?? ''))}`,
    parseExpected: (text) => {
      const match = pattern.exec(text);
      const value = match ? parseTextLiteral(match[2] ?? '') : undefined;
      return match && value !== undefined ? { target: match[1] ?? '', value } : undefined;
    },
    probeActual: textProbe,
  };
}

/** The kind of a Sanmaime expectation (`And:` is resolved to `show` / `hide` by the parser). */
export type ExpectationKind = keyof typeof EXPECTATIONS;

/** The canonical (English) keyword of an expectation kind: `Show`, `ReadOnly`, `Text`, … */
export type ExpectationKeyword = (typeof EXPECTATIONS)[ExpectationKind]['keyword'];

/** Kinds whose keyword takes a target, or nothing (the element itself): `Enable`, `Check`, … */
export type StateKind = {
  [K in ExpectationKind]: (typeof EXPECTATIONS)[K]['arity'] extends 'optional-target' ? K : never;
}[ExpectationKind];

/** Kinds whose keyword takes a target and a value: `Text`, `Contain`, `Count`. */
export type ValueKind = {
  [K in ExpectationKind]: (typeof EXPECTATIONS)[K]['arity'] extends 'target-value' ? K : never;
}[ExpectationKind];

/** Every expectation kind, in table order. */
export const EXPECTATION_KINDS = Object.keys(EXPECTATIONS) as ExpectationKind[];

/** Whether `kind` is an expectation kind of this version of Sanmaime. */
export function isExpectationKind(kind: unknown): kind is ExpectationKind {
  return typeof kind === 'string' && Object.hasOwn(EXPECTATIONS, kind);
}

/** The table entry of `kind`. */
export function expectationSpec(kind: ExpectationKind): ExpectationSpec<ExpectationKind> {
  return EXPECTATIONS[kind];
}

/** The kind of a canonical keyword (`ReadOnly` -> `readonly`), or `undefined`. */
export function kindOfKeyword(keyword: string): ExpectationKind | undefined {
  return EXPECTATION_KINDS.find((kind) => EXPECTATIONS[kind].keyword === keyword);
}

/**
 * The text of an expectation line in English Sanmaime, which is also its step title: `Show:
 * Username`, `Enable`, `Check: Remember me`, `Text: Title = "Welcome"`, `Count: Items = 3`.
 */
export function expectationTitle(
  kind: ExpectationKind,
  target?: string,
  value?: ExpectationValue,
): string {
  const spec = expectationSpec(kind);
  if (spec.arity === 'optional-target' && target === undefined) return spec.keyword;
  const head = `${spec.keyword}: ${target ?? ''}`;
  return spec.arity === 'target-value' && value !== undefined
    ? `${head} = ${formatValue(value)}`
    : head;
}

/** A parsed expectation title or `Expected:` text. */
export interface ParsedExpectation {
  kind: ExpectationKind;
  target: string | undefined;
  value?: ExpectationValue;
}

/** Parses an `expectationTitle()` (a step title); `undefined` for other titles. */
export function parseExpectationTitle(title: string): ParsedExpectation | undefined {
  for (const kind of EXPECTATION_KINDS) {
    const spec = expectationSpec(kind);
    if (title === spec.keyword) {
      return spec.arity === 'optional-target' ? { kind, target: undefined } : undefined;
    }
    const prefix = `${spec.keyword}: `;
    if (!title.startsWith(prefix)) continue;
    const argument = title.slice(prefix.length);
    if (spec.arity !== 'target-value' || spec.valueType === undefined) {
      return { kind, target: argument };
    }
    const split = splitTargetValue(argument);
    const value = split ? parseValue(spec.valueType, split.value) : undefined;
    return split && value !== undefined ? { kind, target: split.target, value } : undefined;
  }
  return undefined;
}

/** `describeExpected` of `kind` (see `ExpectationSpec`). */
export function describeExpectation(
  kind: ExpectationKind,
  target?: string,
  value?: ExpectationValue,
): string {
  return expectationSpec(kind).describeExpected(target, value);
}

/** Recovers the expectation from an `Expected:` text; `undefined` if no kind phrases it so. */
export function parseExpectedText(text: string): ParsedExpectation | undefined {
  // Value phrasings first: they are the most specific (`… has text "…"`, `Count of …`).
  const order = [...EXPECTATION_KINDS].sort(
    (a, b) =>
      Number(expectationSpec(b).arity === 'target-value') -
      Number(expectationSpec(a).arity === 'target-value'),
  );
  for (const kind of order) {
    const parsed = expectationSpec(kind).parseExpected(text);
    if (parsed) return { kind, ...parsed };
  }
  return undefined;
}
