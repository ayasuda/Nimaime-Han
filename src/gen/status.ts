/**
 * Review status of specifications in `nimaime-gen` (docs/review-workflow.md): a spec whose header
 * says `# status: draft` describes what a screen currently does, not what it must do, so it is not
 * generated unless drafts are included (`--include-drafts`, or the config's `includeDrafts`).
 */
import type { ParsedSpec } from './load-specs';

/** Whether a parsed spec is a draft (`# status: draft` in its header). */
export function isDraft(spec: Pick<ParsedSpec, 'document'>): boolean {
  return spec.document.status === 'draft';
}

export interface DraftPartition {
  /** The specs to process: every approved spec, and the drafts when they are included. */
  selected: ParsedSpec[];
  /** The drafts that were left out (empty when drafts are included). */
  skipped: ParsedSpec[];
  /** The drafts that were kept because drafts are included. */
  included: ParsedSpec[];
}

/**
 * Splits `specs` by review status. Skipped drafts are left out entirely: their diagnostics and
 * missing definitions are not reported, since a draft is work in progress.
 */
export function partitionDrafts(
  specs: readonly ParsedSpec[],
  includeDrafts: boolean,
): DraftPartition {
  const result: DraftPartition = { selected: [], skipped: [], included: [] };
  for (const spec of specs) {
    if (!isDraft(spec)) {
      result.selected.push(spec);
    } else if (includeDrafts) {
      result.selected.push(spec);
      result.included.push(spec);
    } else {
      result.skipped.push(spec);
    }
  }
  return result;
}

/** The line printed (to stderr) when drafts were skipped; `undefined` when none were. */
export function skippedDraftsMessage(count: number): string | undefined {
  if (count === 0) return undefined;
  return `nimaime-gen: ${String(count)} draft spec${count === 1 ? '' : 's'} skipped (use --include-drafts).`;
}
