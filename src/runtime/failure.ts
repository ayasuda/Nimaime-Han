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

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * The message of a failed expectation: a Sanmaime header block followed by Playwright's original
 * message. Issue #12 (reporting) refines this format; keep all formatting here.
 *
 * ```text
 * Screen: Login
 * Element: Login Button
 * When: Input is invalid
 * Expected: disabled
 * Actual: enabled
 * Location: specs/login.sanmaime:14
 *
 * expect(locator).toBeDisabled() failed …
 * ```
 */
export function formatExpectationFailure(
  ctx: ExpectationFailureContext,
  originalError: unknown,
): string {
  const lines: string[] = [];
  if (ctx.screen !== undefined) lines.push(`Screen: ${ctx.screen}`);
  lines.push(`Element: ${ctx.element}`);
  if (ctx.condition !== undefined) lines.push(`When: ${ctx.condition}`);
  lines.push(`Expected: ${ctx.expected}`);
  lines.push(`Actual: ${ctx.actual ?? 'unknown'}`);
  const at = formatSanmaimeLocation(ctx.file, ctx.location);
  if (at !== undefined) lines.push(`Location: ${at}`);
  return `${lines.join('\n')}\n\n${messageOf(originalError)}`;
}

/**
 * Builds the error thrown for a failed expectation. Its stack keeps the frames of the original
 * error; when the `.sanmaime` line is known it is added as the top frame, so that Playwright
 * reports the failure at (and shows a snippet of) the specification line.
 */
export function createExpectationError(
  ctx: ExpectationFailureContext,
  originalError: unknown,
  frame?: SanmaimeFrame,
): NimaimeExpectationError {
  const error = new NimaimeExpectationError(
    formatExpectationFailure(ctx, originalError),
    ctx,
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
