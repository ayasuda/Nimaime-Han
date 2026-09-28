import type { Locator } from '@playwright/test';
import { formatSanmaimeLocation } from './resolve';
import type { ExpectationKind, SanmaimePosition } from './plan';

/** Everything known about a failed Sanmaime expectation (data for failure messages / reporters). */
export interface ExpectationFailureContext {
  screen: string | undefined;
  element: string;
  /** `When:` name; `undefined` for the base state (unconditional block). */
  condition: string | undefined;
  kind: ExpectationKind;
  /** Target name for `show` / `hide`. */
  target: string | undefined;
  /** The `.sanmaime` file, for display (relative to the working directory when possible). */
  file: string | undefined;
  location: SanmaimePosition | undefined;
  /** What was expected, e.g. `Username is shown`, `disabled`. */
  expected: string;
  /** What was observed after the assertion failed, e.g. `hidden`; `undefined` if unknown. */
  actual: string | undefined;
  /**
   * How long the assertion waited (ms) when it failed by timing out; `undefined` when it failed
   * for another reason (e.g. a strict mode violation) or the timeout is unknown.
   * `createExpectationError` reads it from Playwright's message when not set.
   */
  timeout?: number | undefined;
  /** Playwright's description of the locator (`getByTestId('email')`), if known. */
  locator?: string | undefined;
}

/**
 * The JSON form of a failed expectation (`NimaimeExpectationError#toJSON()`, and what
 * `parseExpectationFailure()` recovers from a message). Absent values are `null`.
 */
export interface ExpectationFailureJSON {
  name: 'NimaimeExpectationError';
  screen: string | null;
  element: string;
  condition: string | null;
  expectation: { kind: ExpectationKind; target: string | null };
  /** `Username is shown` / `Username is hidden` / `enabled` / `disabled`. */
  expected: string;
  /** The observed state without the timeout (`hidden`, `hidden (not found)`, …). */
  actual: string | null;
  timeout: number | null;
  locator: string | null;
  file: string | null;
  line: number | null;
  column: number | null;
  /** The Sanmaime header block (`Screen: …` … `Location: …`). */
  header: string;
  /** Playwright's original message (not indented). */
  details: string;
  /** The whole error message (header, blank line, `Details:` section). */
  message: string;
}

/**
 * Thrown when a Sanmaime expectation fails. Its message already contains Playwright's message, so
 * the original error is kept as `original` rather than `cause` (reporters print `cause` again).
 */
export class NimaimeExpectationError extends Error {
  override name = 'NimaimeExpectationError';
  readonly sanmaime: ExpectationFailureContext;
  /** The error thrown by Playwright's assertion. */
  readonly original: unknown;

  constructor(message: string, sanmaime: ExpectationFailureContext, original: unknown) {
    super(message);
    this.sanmaime = sanmaime;
    this.original = original;
  }

  /** Structured data for reporters (see `ExpectationFailureJSON`). */
  toJSON(): ExpectationFailureJSON {
    const ctx = this.sanmaime;
    return {
      name: 'NimaimeExpectationError',
      screen: ctx.screen ?? null,
      element: ctx.element,
      condition: ctx.condition ?? null,
      expectation: { kind: ctx.kind, target: ctx.target ?? null },
      expected: ctx.expected,
      actual: ctx.actual ?? null,
      timeout: ctx.timeout ?? null,
      locator: ctx.locator ?? null,
      file: ctx.file ?? null,
      line: ctx.location?.line ?? null,
      column: ctx.location?.column ?? null,
      header: formatFailureHeader(ctx),
      details: formatFailureDetails(ctx, this.original),
      message: this.message,
    };
  }
}

/** The `.sanmaime` line of a failed expectation, as an absolute position. */
export interface SanmaimeFrame {
  /** The step title, e.g. `Show: Username`. */
  title: string;
  /** Absolute path of the `.sanmaime` file. */
  file: string;
  line: number;
  column: number;
}

/** `Username is shown` / `Full name is hidden` / `enabled` / `disabled`. */
export function describeExpected(kind: ExpectationKind, target: string | undefined): string {
  switch (kind) {
    case 'show':
      return `${target ?? ''} is shown`;
    case 'hide':
      return `${target ?? ''} is hidden`;
    case 'enable':
      return 'enabled';
    case 'disable':
      return 'disabled';
  }
}

/**
 * Observes the state the failed assertion was about, without waiting (a cheap, best-effort probe
 * made after the failure; the page may have changed meanwhile). Never throws.
 */
export async function probeActual(
  kind: ExpectationKind,
  locator: Locator,
): Promise<string | undefined> {
  try {
    const count = await locator.count();
    if (count === 0) return kind === 'show' || kind === 'hide' ? 'hidden (not found)' : 'not found';
    if (count > 1) return `${String(count)} matching elements (expected exactly one)`;
    if (kind === 'show' || kind === 'hide') return (await locator.isVisible()) ? 'shown' : 'hidden';
    return (await locator.isEnabled({ timeout: 1000 })) ? 'enabled' : 'disabled';
  } catch {
    return undefined;
  }
}

/**
 * Playwright's description of a locator (`getByTestId('email')`), or `undefined` when it has
 * none (a fake, or an object without a meaningful `toString()`). Never throws.
 */
export function describeLocator(locator: unknown): string | undefined {
  try {
    const text = String(locator);
    return text === '' || text.startsWith('[object ') || text.startsWith('Locator@')
      ? undefined
      : text;
  } catch {
    return undefined;
  }
}

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

function stripAnsi(text: string): string {
  return text.replace(ANSI, '');
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * The timeout (ms) of a web-first assertion that failed by timing out, read from Playwright's
 * message: `Timeout: 5000ms` (Playwright >= 1.50) or `Timed out 5000ms waiting for expect(…)`
 * (older). `undefined` for other failures, e.g. a strict mode violation, which fails at once.
 */
export function detectTimeout(error: unknown): number | undefined {
  const text = stripAnsi(messageOf(error));
  const match =
    /^\s*Timeout:\s*(\d+)\s*ms\s*$/m.exec(text) ??
    /Timed out (\d+)\s*ms waiting for expect/.exec(text);
  return match ? Number(match[1]) : undefined;
}

/**
 * The `Actual:` value: the probed state, followed by the timeout when the assertion timed out —
 * `hidden (after 5000ms)`, `hidden (not found, after 5000ms)`. `unknown` if not probed.
 */
export function formatActual(actual: string | undefined, timeout: number | undefined): string {
  if (actual === undefined) return 'unknown';
  if (timeout === undefined) return actual;
  const after = `after ${String(timeout)}ms`;
  const note = /^(.*) \(([^()]*)\)$/.exec(actual);
  return note ? `${note[1] ?? ''} (${note[2] ?? ''}, ${after})` : `${actual} (${after})`;
}

/**
 * The Sanmaime header of a failure, one `Key: value` line each; `Screen` / `When` / `Location`
 * are left out when unknown (no `When` for the base state):
 *
 * ```text
 * Screen: Login
 * Element: Login Button
 * When: Input is invalid
 * Expected: disabled
 * Actual: enabled (after 5000ms)
 * Location: specs/login.sanmaime:14
 * ```
 */
export function formatFailureHeader(ctx: ExpectationFailureContext): string {
  const lines: string[] = [];
  if (ctx.screen !== undefined) lines.push(`Screen: ${ctx.screen}`);
  lines.push(`Element: ${ctx.element}`);
  if (ctx.condition !== undefined) lines.push(`When: ${ctx.condition}`);
  lines.push(`Expected: ${ctx.expected}`);
  lines.push(`Actual: ${formatActual(ctx.actual, ctx.timeout)}`);
  const at = formatSanmaimeLocation(ctx.file, ctx.location);
  if (at !== undefined) lines.push(`Location: ${at}`);
  return lines.join('\n');
}

/**
 * Playwright's original message, plus `Locator: …` when the message does not name the locator
 * itself (web-first assertion messages always do).
 */
export function formatFailureDetails(
  ctx: ExpectationFailureContext,
  originalError: unknown,
): string {
  const message = messageOf(originalError);
  if (ctx.locator === undefined || /^\s*Locator:/m.test(stripAnsi(message))) return message;
  return `${message}\n\nLocator: ${ctx.locator}`;
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => (line === '' ? line : `  ${line}`))
    .join('\n');
}

/**
 * The message of a failed expectation: the Sanmaime header, a blank line, then Playwright's
 * original message (with the locator, timeout and call log) indented under `Details:`.
 *
 * ```text
 * Screen: Login
 * Element: Login Button
 * When: Input is invalid
 * Expected: disabled
 * Actual: enabled (after 5000ms)
 * Location: specs/login.sanmaime:14
 *
 * Details:
 *   expect(locator).toBeDisabled() failed
 *
 *   Locator:  getByTestId('login-button')
 *   …
 * ```
 *
 * The location has no column on purpose: Playwright parses every `…:line:column` line of an
 * error's stack, message included, as a stack frame.
 */
export function formatExpectationFailure(
  ctx: ExpectationFailureContext,
  originalError: unknown,
): string {
  const details = formatFailureDetails(ctx, originalError);
  return `${formatFailureHeader(ctx)}\n\nDetails:\n${indent(details)}`;
}

/**
 * Builds the error thrown for a failed expectation. `ctx.timeout` is read from Playwright's
 * message when not given. Its stack keeps the frames of the original error; when the `.sanmaime`
 * line is known it is added as the top frame, so that Playwright reports the failure at (and
 * shows a snippet of) the specification line.
 */
export function createExpectationError(
  ctx: ExpectationFailureContext,
  originalError: unknown,
  frame?: SanmaimeFrame,
): NimaimeExpectationError {
  const full: ExpectationFailureContext = {
    ...ctx,
    timeout: ctx.timeout ?? detectTimeout(originalError),
  };
  const error = new NimaimeExpectationError(
    formatExpectationFailure(full, originalError),
    full,
    originalError,
  );
  const frames = [
    frame && `    at ${frame.title} (${frame.file}:${String(frame.line)}:${String(frame.column)})`,
    stackFrames(originalError),
  ].filter((part) => part !== undefined && part !== '');
  if (frames.length > 0) error.stack = `${error.name}: ${error.message}\n${frames.join('\n')}`;
  return error;
}

function stackFrames(error: unknown): string | undefined {
  if (!(error instanceof Error) || error.stack === undefined) return undefined;
  const index = error.stack.search(/\n\s+at /);
  return index === -1 ? undefined : error.stack.slice(index + 1);
}

const HEADER_KEYS = new Set(['Screen', 'Element', 'When', 'Expected', 'Actual', 'Location']);

/**
 * Recovers the structured failure from a `NimaimeExpectationError` message — for reporters, which
 * only receive an error's message and stack (Playwright does not transfer custom properties from
 * the worker). Accepts the `NimaimeExpectationError: ` prefix Playwright adds and ANSI colors.
 * Returns `undefined` for any other message. `column` and `locator` are always `null`.
 */
export function parseExpectationFailure(message: string): ExpectationFailureJSON | undefined {
  const text = stripAnsi(message).replace(/^\s*NimaimeExpectationError: /, '');
  const split = text.indexOf('\n\n');
  const header = split === -1 ? text : text.slice(0, split);
  const rest = split === -1 ? '' : text.slice(split + 2);

  const fields = new Map<string, string>();
  for (const line of header.split('\n')) {
    const match = /^(\w+): (.*)$/.exec(line);
    if (!match?.[1] || match[2] === undefined || !HEADER_KEYS.has(match[1])) return undefined;
    if (fields.has(match[1])) return undefined;
    fields.set(match[1], match[2]);
  }
  const element = fields.get('Element');
  const expected = fields.get('Expected');
  const actualText = fields.get('Actual');
  if (element === undefined || expected === undefined || actualText === undefined) return undefined;

  const expectation = parseExpected(expected);
  if (!expectation) return undefined;
  const { actual, timeout } = parseActual(actualText);
  const location = fields.get('Location');
  const at = location === undefined ? undefined : /^(.*):(\d+)$/.exec(location);
  const details = rest.startsWith('Details:\n')
    ? rest
        .slice('Details:\n'.length)
        .split('\n')
        .map((line) => line.replace(/^ {2}/, ''))
        .join('\n')
    : rest;

  return {
    name: 'NimaimeExpectationError',
    screen: fields.get('Screen') ?? null,
    element,
    condition: fields.get('When') ?? null,
    expectation,
    expected,
    actual,
    timeout,
    locator: null,
    file: at ? (at[1] ?? null) : (location ?? null),
    line: at ? Number(at[2]) : null,
    column: null,
    header,
    details,
    message: text,
  };
}

function parseExpected(expected: string): ExpectationFailureJSON['expectation'] | undefined {
  if (expected === 'enabled') return { kind: 'enable', target: null };
  if (expected === 'disabled') return { kind: 'disable', target: null };
  const match = /^(.*) is (shown|hidden)$/.exec(expected);
  if (!match) return undefined;
  return { kind: match[2] === 'shown' ? 'show' : 'hide', target: match[1] ?? '' };
}

function parseActual(text: string): { actual: string | null; timeout: number | null } {
  if (text === 'unknown') return { actual: null, timeout: null };
  const match = /^(.*) \((?:([^()]*), )?after (\d+)ms\)$/.exec(text);
  if (!match) return { actual: text, timeout: null };
  const state = match[1] ?? '';
  return {
    actual: match[2] === undefined ? state : `${state} (${match[2]})`,
    timeout: Number(match[3]),
  };
}
