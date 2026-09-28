/**
 * Human-readable reports of `nimaime-gen`: parser diagnostics, missing definitions (with definition
 * snippets, like playwright-bdd's missing step snippets) and unused definitions.
 *
 * Two formats (docs/cli.md, "Output and exit codes"):
 *
 * - `pretty` (the CLI default): a counted block per kind of problem, one indented entry per
 *   problem (`  file:line:column` + the message), then the definition snippets;
 * - `compact`: one problem-matcher friendly line per problem, `file:line:column: severity: message`.
 */
import path from 'node:path';
import type { QuoteStyle } from '../config/types';
import { formatDiagnostic, type Diagnostic } from '../parser';
import type { SourceLocation } from '../runtime/source';
import type { MissingDefinition, ResolvedDocument, UnusedDefinition } from './match';
import { generateSnippets } from './snippets';

/** `pretty`: blocks with snippets (the CLI default); `compact`: one line per problem. */
export type ReportFormat = 'pretty' | 'compact';

export interface ReportOptions {
  /** Paths are shown relative to this directory (normally the current directory). */
  cwd: string;
  /** Also report `info` entries (a screen without `defineScreen`). Default: `false`. */
  includeInfo?: boolean | undefined;
}

export interface MissingReportOptions extends ReportOptions {
  /** Default: `'pretty'`. */
  format?: ReportFormat | undefined;
  /**
   * Report missing definitions as warnings (`--allow-missing`): the `compact` lines say `warning:`
   * instead of `error:` and the `pretty` header says so. Default: `false`.
   */
  asWarnings?: boolean | undefined;
  /** Quote style of the snippets (`config.quotes`). Default: `'single'`. */
  quotes?: QuoteStyle | undefined;
  /** The resolved documents, so that snippets of undefined elements list their targets. */
  documents?: readonly ResolvedDocument[] | undefined;
}

/** `file` relative to `cwd` with `/` separators, or absolute when it lies outside `cwd`. */
export function displayPath(file: string, cwd: string): string {
  const relative = path.relative(cwd, file);
  if (relative === '') return '.';
  if (relative.startsWith('..') || path.isAbsolute(relative)) return file;
  return relative.split(path.sep).join('/');
}

interface Positioned {
  file: string;
  location: { line: number; column: number };
}

function where(entry: Positioned, cwd: string): string {
  const { line, column } = entry.location;
  return `${displayPath(entry.file, cwd)}:${String(line)}:${String(column)}`;
}

/** Sorted by file, then line, then column (stable). */
function byPosition<T extends Positioned>(entries: readonly T[]): T[] {
  return [...entries].sort(
    (a, b) =>
      (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) ||
      a.location.line - b.location.line ||
      a.location.column - b.location.column,
  );
}

/** `Title: N`, a blank line, then `  where` + `    message` per entry, each followed by a blank line. */
function prettyBlock(
  title: string,
  entries: readonly { where: string; message: string }[],
): string[] {
  const lines = [`${title}: ${String(entries.length)}`, ''];
  for (const entry of entries) lines.push(`  ${entry.where}`, `    ${entry.message}`, '');
  return lines;
}

/** A parser diagnostic of one spec file. */
export interface FileDiagnostic extends Diagnostic {
  /** Absolute path of the `.sanmaime` file. */
  file: string;
}

/**
 * Parser diagnostics. `compact`: `formatDiagnostic()`'s lines
 * (`specs/login.sanmaime:7:5: error SANMAIME_E007: message`), in the given order. `pretty`:
 * `Syntax errors: N` and an entry per diagnostic (`SANMAIME_E007: message`; warnings, which v0
 * does not have, are prefixed with `warning`), sorted by file and position. No lines for no
 * diagnostics.
 */
export function formatDiagnostics(
  diagnostics: readonly FileDiagnostic[],
  options: { cwd: string; format?: ReportFormat | undefined },
): string[] {
  if (diagnostics.length === 0) return [];
  if (options.format === 'compact') {
    return diagnostics.map((d) => formatDiagnostic(d, displayPath(d.file, options.cwd)));
  }
  return prettyBlock(
    'Syntax errors',
    byPosition(diagnostics).map((d) => ({
      where: where(d, options.cwd),
      message: `${d.severity === 'error' ? '' : `${d.severity} `}${d.code}: ${d.message}`,
    })),
  );
}

function describeMissingCompact(entry: MissingDefinition): string {
  switch (entry.kind) {
    case 'screen':
      return `Screen "${entry.name}" has no definition (defineScreen); it will not be opened.`;
    case 'element':
      return `Element "${entry.name}" of Screen "${entry.screen}" has no definition (defineElement).`;
    case 'target':
      return `Element "${entry.element ?? ''}" has no definition for target "${entry.name}".`;
    case 'self':
      return (
        `Element "${entry.name}" has no locator for the element itself, which Enable / Disable ` +
        'need (defineElement(name, self, targets)).'
      );
    case 'condition':
      return (
        `Condition "When: ${entry.name}" (Screen "${entry.screen}", Element ` +
        `"${entry.element ?? ''}") has no definition (defineCondition).`
      );
  }
}

function describeMissingPretty(entry: MissingDefinition): string {
  switch (entry.kind) {
    case 'screen':
      return `Screen "${entry.name}" is not defined (optional: without defineScreen it is not opened)`;
    case 'element':
      return `Element "${entry.name}" is not defined`;
    case 'target':
      return `Element "${entry.element ?? ''}" has no definition for "${entry.name}"`;
    case 'self':
      return `Element "${entry.name}" has no self locator (needed by Enable/Disable)`;
    case 'condition':
      return `Condition "${entry.name}" is not defined`;
  }
}

/**
 * The missing-definition report; `info` entries are left out unless `includeInfo` is set.
 *
 * - `pretty` (default): `Missing definitions: N`, an entry per missing definition sorted by file
 *   and position (`  specs/user-details.sanmaime:5:5` + `    Element "User Information" has no
 *   definition for "Full name"`), then `Snippets:` and the definitions to paste
 *   (`generateSnippets()`; `defineScreen` only with `includeInfo`).
 * - `compact`: one line per missing definition, in the problem-matcher friendly form of parser
 *   diagnostics: `specs/login.sanmaime:8:3: error: Element "Login Button" of Screen "Login" has no
 *   definition (defineElement).`
 *
 * No lines when nothing is reported.
 */
export function formatMissing(
  missing: readonly MissingDefinition[],
  options: MissingReportOptions,
): string[] {
  const shown = missing.filter(
    (entry) => entry.severity === 'error' || options.includeInfo === true,
  );
  if (shown.length === 0) return [];
  if (options.format === 'compact') {
    return shown.map((entry) => {
      const severity =
        entry.severity === 'error' && options.asWarnings === true ? 'warning' : entry.severity;
      return `${where(entry, options.cwd)}: ${severity}: ${describeMissingCompact(entry)}`;
    });
  }
  const title =
    options.asWarnings === true
      ? 'Missing definitions (allowed by --allow-missing)'
      : 'Missing definitions';
  const lines = prettyBlock(
    title,
    byPosition(shown).map((entry) => ({
      where: where(entry, options.cwd),
      message: describeMissingPretty(entry),
    })),
  );
  const snippets = generateSnippets(shown, {
    quotes: options.quotes ?? 'single',
    documents: options.documents,
    includeScreens: options.includeInfo === true,
  });
  if (snippets !== '') lines.push('Snippets:', '', ...snippets.split('\n'));
  return lines;
}

function formatSource(source: SourceLocation | undefined, cwd: string): string {
  if (!source) return 'unknown location';
  return `${displayPath(source.file, cwd)}:${String(source.line)}:${String(source.column)}`;
}

/** One warning line per unused definition (printed in verbose mode). */
export function formatUnused(
  unused: readonly UnusedDefinition[],
  options: ReportOptions,
): string[] {
  return unused.map((entry) => {
    let what: string;
    switch (entry.kind) {
      case 'screen':
        what = `Screen "${entry.name}"`;
        break;
      case 'element':
        what = `Element "${entry.name}"`;
        break;
      case 'target':
        what = `target "${entry.name}" of Element "${entry.element ?? ''}"`;
        break;
      case 'condition':
        what =
          entry.screen === undefined
            ? `condition "${entry.name}"`
            : `condition "${entry.name}" (Screen "${entry.screen}")`;
        break;
    }
    return `${formatSource(entry.source, options.cwd)}: warning: unused definition: ${what} is not used by any spec.`;
  });
}
