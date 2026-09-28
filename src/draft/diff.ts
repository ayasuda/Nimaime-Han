/**
 * `nimaime diff` (docs/review-workflow.md): compares an approved specification with a draft of the
 * same screen — re-observed from the running application, or saved earlier — in Sanmaime terms.
 *
 * Only what one observation can tell is compared: the expectations an element states outside
 * `When:` blocks. Screens and elements are matched by name (exactly), targets by name within an
 * element; `Enable` / `Disable` are compared when both sides state one. `When:` blocks cannot be
 * observed; they are listed as "not compared", and a target that one side states only inside a
 * `When:` block is not reported as missing on the other side. A draft only proposes what is
 * visible, so a `Hide:` of the spec agrees with a target the draft does not mention.
 */
import { LANGUAGES } from '../parser';
import type { Element, Expectation, SanmaimeDocument, Screen } from '../parser';

export type ExpectationKind = Expectation['kind'];

/**
 * `same`: on both sides; `removed`: in the spec only; `added`: in the other document only;
 * `changed`: on both sides with another kind (e.g. `Disable` / `Enable`, `Hide:` / `Show:`).
 */
export type ExpectationChange = 'same' | 'removed' | 'added' | 'changed';

export interface ExpectationDiff {
  change: ExpectationChange;
  /** The kind in the spec (in the other document for `added`). */
  kind: ExpectationKind;
  /** The target of `show` / `hide`. */
  target?: string;
  /** For `changed`: the kind in the other document. */
  otherKind?: ExpectationKind;
}

/** `matched`: on both sides; `removed`: in the spec only; `added`: in the other document only. */
export type NodeChange = 'matched' | 'removed' | 'added';

export interface ElementDiff {
  name: string;
  change: NodeChange;
  /** Expectations outside `When:` blocks, compared (for `matched`) or listed. */
  expectations: ExpectationDiff[];
}

/** A `When:` block (or an element with nothing but `When:` blocks) that was not compared. */
export interface NotCompared {
  /** `spec` or `other`: which document it is in. */
  side: 'spec' | 'other';
  element: string;
  condition: string;
}

export interface ScreenDiff {
  name: string;
  change: NodeChange;
  elements: ElementDiff[];
  notCompared: NotCompared[];
}

export interface DiffCounts {
  /** Screens in one document only. */
  screens: number;
  /** Elements in one document only (of matched screens). */
  elements: number;
  /** Expectations that differ (of matched elements). */
  expectations: number;
}

export interface SanmaimeDiff {
  /** `true` when nothing that was compared differs. */
  identical: boolean;
  counts: DiffCounts;
  screens: ScreenDiff[];
}

interface Side {
  /** Target -> kind, of the expectations outside `When:` blocks. */
  targets: Map<string, 'show' | 'hide'>;
  /** Targets used inside `When:` blocks. */
  conditional: Set<string>;
  state: 'enable' | 'disable' | undefined;
}

function sideOf(element: Element | undefined): Side {
  const side: Side = { targets: new Map(), conditional: new Set(), state: undefined };
  if (!element) return side;
  for (const e of element.unconditional) {
    if (e.kind === 'show' || e.kind === 'hide') side.targets.set(e.target.trim(), e.kind);
    else side.state = e.kind;
  }
  for (const block of element.conditions) {
    for (const e of block.expectations) {
      if (e.kind === 'show' || e.kind === 'hide') side.conditional.add(e.target.trim());
    }
  }
  return side;
}

function listed(element: Element, change: 'removed' | 'added'): ExpectationDiff[] {
  return element.unconditional.map((e) =>
    e.kind === 'show' || e.kind === 'hide'
      ? { change, kind: e.kind, target: e.target.trim() }
      : { change, kind: e.kind },
  );
}

function compareElements(spec: Element, other: Element): ExpectationDiff[] {
  const a = sideOf(spec);
  const b = sideOf(other);
  const result: ExpectationDiff[] = [];
  for (const [target, kind] of a.targets) {
    const otherKind = b.targets.get(target);
    if (otherKind === kind) result.push({ change: 'same', kind, target });
    else if (otherKind !== undefined) result.push({ change: 'changed', kind, target, otherKind });
    else if (b.conditional.has(target)) continue;
    else if (kind === 'hide') result.push({ change: 'same', kind, target });
    else result.push({ change: 'removed', kind, target });
  }
  if (a.state !== undefined && b.state !== undefined) {
    result.push(
      a.state === b.state
        ? { change: 'same', kind: a.state }
        : { change: 'changed', kind: a.state, otherKind: b.state },
    );
  }
  for (const [target, kind] of b.targets) {
    if (a.targets.has(target) || a.conditional.has(target)) continue;
    result.push({ change: 'added', kind, target });
  }
  return result;
}

function notComparedOf(element: Element, side: 'spec' | 'other'): NotCompared[] {
  return element.conditions.map((c) => ({ side, element: element.name, condition: c.name }));
}

const byName = <T extends { name: string }>(items: readonly T[]): Map<string, T> =>
  new Map(items.map((item) => [item.name.trim(), item] as const));

function diffScreen(spec: Screen, other: Screen): { diff: ScreenDiff; counts: DiffCounts } {
  const counts: DiffCounts = { screens: 0, elements: 0, expectations: 0 };
  const diff: ScreenDiff = { name: spec.name, change: 'matched', elements: [], notCompared: [] };
  const others = byName(other.elements);
  const specs = byName(spec.elements);
  for (const element of spec.elements) {
    diff.notCompared.push(...notComparedOf(element, 'spec'));
    const match = others.get(element.name.trim());
    if (match) {
      const expectations = compareElements(element, match);
      if (element.unconditional.length === 0 && expectations.length === 0) continue;
      counts.expectations += expectations.filter((e) => e.change !== 'same').length;
      diff.elements.push({ name: element.name, change: 'matched', expectations });
    } else if (element.unconditional.length > 0) {
      counts.elements++;
      diff.elements.push({
        name: element.name,
        change: 'removed',
        expectations: listed(element, 'removed'),
      });
    }
  }
  for (const element of other.elements) {
    diff.notCompared.push(...notComparedOf(element, 'other'));
    if (specs.has(element.name.trim()) || element.unconditional.length === 0) continue;
    counts.elements++;
    diff.elements.push({
      name: element.name,
      change: 'added',
      expectations: listed(element, 'added'),
    });
  }
  return { diff, counts };
}

function oneSided(screen: Screen, change: 'removed' | 'added'): ScreenDiff {
  const side = change === 'removed' ? 'spec' : 'other';
  return {
    name: screen.name,
    change,
    elements: screen.elements
      .filter((e) => e.unconditional.length > 0)
      .map((e) => ({ name: e.name, change, expectations: listed(e, change) })),
    notCompared: screen.elements.flatMap((e) => notComparedOf(e, side)),
  };
}

/**
 * Compares the screens of `spec` with those of `other` (see the module comment). Both documents
 * should be free of parser errors.
 */
export function diffDocuments(spec: SanmaimeDocument, other: SanmaimeDocument): SanmaimeDiff {
  const counts: DiffCounts = { screens: 0, elements: 0, expectations: 0 };
  const screens: ScreenDiff[] = [];
  const others = byName(other.screens);
  const specs = byName(spec.screens);
  for (const screen of spec.screens) {
    const match = others.get(screen.name.trim());
    if (match) {
      const result = diffScreen(screen, match);
      counts.elements += result.counts.elements;
      counts.expectations += result.counts.expectations;
      screens.push(result.diff);
    } else {
      counts.screens++;
      screens.push(oneSided(screen, 'removed'));
    }
  }
  for (const screen of other.screens) {
    if (specs.has(screen.name.trim())) continue;
    counts.screens++;
    screens.push(oneSided(screen, 'added'));
  }
  const identical = counts.screens + counts.elements + counts.expectations === 0;
  return { identical, counts, screens };
}

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------

export interface FormatDiffOptions {
  /** How the spec is named in the header, e.g. `specs/login.sanmaime`. */
  spec: string;
  /** How the other document is named in the header: a URL or a file. */
  other: string;
  /**
   * The word for the other side in annotations: `observed` (a re-observed screen, the default) or
   * e.g. `draft` (a saved file).
   */
  otherWord?: string;
  /** Keyword language of the report (the spec's). Default: `en`. */
  language?: string;
}

const MARKS: Readonly<Record<ExpectationChange, string>> = {
  same: '=',
  removed: '-',
  added: '+',
  changed: '!',
};

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? '' : 's'}`;
}

/** The summary line: `1 element and 2 expectations differ.` / `No differences.` */
export function diffSummary(counts: DiffCounts): string {
  const parts = [
    counts.screens > 0 ? plural(counts.screens, 'screen') : '',
    counts.elements > 0 ? plural(counts.elements, 'element') : '',
    counts.expectations > 0 ? plural(counts.expectations, 'expectation') : '',
  ].filter((part) => part !== '');
  if (parts.length === 0) return 'No differences.';
  const total = counts.screens + counts.elements + counts.expectations;
  const list =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${String(parts.at(-1))}`;
  return `${String(list)} ${total === 1 ? 'differs' : 'differ'}.`;
}

/** Renders a diff as text (see docs/review-workflow.md for the format). Ends with a newline. */
export function formatDiff(diff: SanmaimeDiff, options: FormatDiffOptions): string {
  const table = LANGUAGES[options.language ?? 'en'] ?? LANGUAGES.en;
  if (!table) throw new Error('unreachable: no keyword table');
  const k = table.keywords;
  const kw = (slot: keyof typeof k): string => k[slot][0] ?? '';
  const word = options.otherWord ?? 'observed';
  const inOther = word === 'observed' ? 'observed' : `in ${word}`;
  const notInOther = word === 'observed' ? 'not observed' : `not in ${word}`;
  const annotation = {
    removed: `in spec, ${notInOther}`,
    added: `${inOther}, not in spec`,
  };
  const expectationText = (kind: ExpectationKind, target: string | undefined): string =>
    target === undefined ? kw(kind) : `${kw(kind)}: ${target}`;

  // Annotations of elements and expectations are aligned in one column; the screen line's is not.
  interface Row {
    text: string;
    note?: string | undefined;
    align?: boolean;
  }
  const rows: Row[] = [];
  for (const [index, screen] of diff.screens.entries()) {
    if (index > 0) rows.push({ text: '' });
    rows.push({
      text: `${kw('screen')}: ${screen.name}`,
      note:
        screen.change === 'matched'
          ? `${options.spec} vs ${options.other}`
          : annotation[screen.change],
      align: false,
    });
    for (const element of screen.elements) {
      rows.push({ text: '' });
      rows.push({
        text: `  ${kw('element')}: ${element.name}`,
        note:
          element.change === 'matched' || screen.change !== 'matched'
            ? undefined
            : annotation[element.change],
      });
      for (const e of element.expectations) {
        const text = `    ${MARKS[e.change]} ${expectationText(e.kind, e.target)}`;
        let note: string | undefined;
        if (e.change === 'changed' && e.otherKind !== undefined) {
          note = `in spec; ${word}: ${kw(e.otherKind)}`;
        } else if (element.change === 'matched' && e.change !== 'same') {
          note = annotation[e.change === 'added' ? 'added' : 'removed'];
        }
        rows.push({ text, note });
      }
    }
    if (screen.notCompared.length > 0) {
      rows.push({ text: '' });
      rows.push({
        text: `  Not compared (only expectations outside ${kw('when')}: blocks are compared):`,
      });
      for (const n of screen.notCompared) {
        rows.push({
          text: `    ${kw('element')}: ${n.element} > ${kw('when')}: ${n.condition}`,
          note: n.side === 'spec' ? undefined : inOther,
        });
      }
    }
  }
  const width = Math.max(
    0,
    ...rows.filter((r) => r.note !== undefined && r.align !== false).map((r) => r.text.length),
  );
  const lines = rows.map(({ text, note, align }) =>
    note === undefined ? text : `${align === false ? text : text.padEnd(width)}  (${note})`,
  );
  if (diff.screens.length > 0) lines.push('');
  lines.push(diffSummary(diff.counts));
  return `${lines.join('\n')}\n`;
}
