/**
 * Human-readable reports of `nimaime-gen`: missing and unused definitions.
 *
 * Kept separate from the orchestration so that the missing-definition report can be extended
 * (issue #11 adds definition snippets, like playwright-bdd's missing step snippets).
 */
import path from 'node:path';
import type { SourceLocation } from '../runtime/source';
import type { MissingDefinition, UnusedDefinition } from './match';

export interface ReportOptions {
  /** Paths are shown relative to this directory (normally the current directory). */
  cwd: string;
  /** Also report `info` entries (a screen without `defineScreen`). Default: `false`. */
  includeInfo?: boolean;
}

/** `file` relative to `cwd` with `/` separators, or absolute when it lies outside `cwd`. */
export function displayPath(file: string, cwd: string): string {
  const relative = path.relative(cwd, file);
  if (relative === '') return '.';
  if (relative.startsWith('..') || path.isAbsolute(relative)) return file;
  return relative.split(path.sep).join('/');
}

function describeMissing(entry: MissingDefinition): string {
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

/**
 * One line per missing definition, in the problem-matcher friendly form of parser diagnostics:
 * `specs/login.sanmaime:8:3: error: Element "Login Button" of Screen "Login" has no definition …`.
 * `info` entries are left out unless `includeInfo` is set.
 */
export function formatMissing(
  missing: readonly MissingDefinition[],
  options: ReportOptions,
): string[] {
  return missing
    .filter((entry) => entry.severity === 'error' || options.includeInfo === true)
    .map((entry) => {
      const { line, column } = entry.location;
      const where = `${displayPath(entry.file, options.cwd)}:${String(line)}:${String(column)}`;
      return `${where}: ${entry.severity}: ${describeMissing(entry)}`;
    });
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
