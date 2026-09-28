/**
 * Reading the Sanmaime header that the runtime puts at the start of the message of a failed
 * expectation (see `formatExpectationFailure` in src/runtime/failure.ts):
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
 *   expect(locator).toBeDisabled() failed …
 * ```
 *
 * Playwright hands reporters only an error's message and stack, so the header text is the
 * contract; parsing it is delegated to the runtime's `parseExpectationFailure`, which owns the
 * format.
 */
import { parseExpectationFailure } from '../runtime/failure';

/** The Sanmaime fields of a failed expectation, as the reporter prints them. */
export interface SanmaimeHeader {
  screen?: string;
  element?: string;
  when?: string;
  expected: string;
  /** The observed state without the timeout (`enabled`, `hidden (not found)`, …). */
  actual?: string;
  /** `file:line` of the `.sanmaime` line. */
  location?: string;
}

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;

/** Removes ANSI colour codes. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI, '');
}

/** The result of `parseSanmaimeHeader`. */
export interface ParsedMessage {
  /** The header, or `undefined` if the message is not a failed Sanmaime expectation. */
  header: SanmaimeHeader | undefined;
  /** Playwright's own message (the `Details:` section), or the whole message without a header. */
  body: string;
}

/** Splits an error message into its Sanmaime header and Playwright's message. */
export function parseSanmaimeHeader(message: string): ParsedMessage {
  const parsed = parseExpectationFailure(message);
  if (!parsed) return { header: undefined, body: stripAnsi(message) };
  const header: SanmaimeHeader = { element: parsed.element, expected: parsed.expected };
  if (parsed.screen !== null) header.screen = parsed.screen;
  if (parsed.condition !== null) header.when = parsed.condition;
  if (parsed.actual !== null) header.actual = parsed.actual;
  if (parsed.file !== null) {
    header.location = parsed.line === null ? parsed.file : `${parsed.file}:${String(parsed.line)}`;
  }
  return { header, body: parsed.details };
}
