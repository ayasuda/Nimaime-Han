/**
 * The proposal phase of `nimaime draft` (docs/draft.md, "What the rules do"): a rule-based
 * proposer, no LLM, that turns a `ScreenObservation` into a Sanmaime draft and a definitions draft.
 *
 * - One `Element:` per region (landmark) that has visible, nameable elements, named after the
 *   region (label, heading, id, …; see names.ts); `groupBy: 'flat'` puts everything in one element.
 * - One `Show:` / `And:` per visible element, named after its accessible name or test id, deduplicated
 *   within the element. `Hide:` is not proposed (a draft describes what is there).
 * - `Enable` / `Disable` when the element contains exactly one control (so that the element itself
 *   is that control). In an element with several controls, each disabled control gets an element of
 *   its own with `Disable`, since a disabled control is usually a state that matters.
 *
 * The draft is parsed before it is returned; lines the parser rejects are dropped (and reported in
 * `dropped`), so the result is always valid Sanmaime.
 */
import { LANGUAGES, parse } from '../parser';
import type { Diagnostic } from '../parser';
import { renderDefinitions, type LocatorSpec } from './definitions';
import { cleanName, regionName, targetName, uniqueName, type DraftLanguage } from './names';
import type { ObservedElement, ObservedRegion, ScreenObservation } from './types';

export type { DraftLanguage } from './names';
export type { LocatorSpec } from './definitions';

export interface ProposeOptions {
  /** The screen name (`Screen:`). */
  screen: string;
  /** Keyword language of the draft. Default: `en`. */
  language?: DraftLanguage;
  /** One element per region (default), or all targets in one element. */
  groupBy?: 'region' | 'flat';
  /** Quote style of the definitions draft. Default: `single`. */
  quotes?: 'single' | 'double';
  /** Write the `# Draft …` comment at the top of the Sanmaime draft. Default: `true`. */
  header?: boolean;
}

/** A proposed `Show:` target. */
export interface ProposedTarget {
  name: string;
  locator: LocatorSpec;
  /** The observed element it stands for. */
  observed: ObservedElement;
}

/** A proposed `Element:`. */
export interface ProposedElement {
  name: string;
  /** Id of the observed region it comes from (`*` for `groupBy: 'flat'`). */
  region: string;
  targets: ProposedTarget[];
  /** `Enable` / `Disable` of the element itself (whose locator is `self`). */
  state?: 'enable' | 'disable';
  self?: LocatorSpec;
}

/** A line the parser rejected, and which was therefore left out of the draft. */
export interface DroppedLine {
  element: string;
  /** The target, or `Enable` / `Disable`; `undefined` when the whole element was dropped. */
  item: string | undefined;
  diagnostic: Diagnostic;
}

export interface Proposal {
  screen: string;
  language: DraftLanguage;
  /** The Sanmaime draft (valid; ends with a newline). */
  sanmaime: string;
  /** The definitions draft (TypeScript; ends with a newline). */
  definitions: string;
  elements: ProposedElement[];
  dropped: DroppedLine[];
}

/** The observation cannot be turned into a draft (e.g. nothing visible to specify). */
export class DraftError extends Error {
  override name = 'DraftError';
}

// ---------------------------------------------------------------------------------------------
// Locators
// ---------------------------------------------------------------------------------------------

/** Roles `page.getByRole()` finds by name (password inputs, for example, have no role). */
function isRoleLocatable(element: ObservedElement): boolean {
  return element.role !== undefined && element.role !== 'presentation' && element.role !== 'none';
}

/** Another visible element whose name contains this one (so a substring match is ambiguous). */
function hasLongerNamesake(
  element: ObservedElement,
  all: readonly ObservedElement[],
  same: (other: ObservedElement) => boolean,
  value: (other: ObservedElement) => string | undefined,
): boolean {
  const mine = (value(element) ?? '').toLowerCase();
  return all.some((other) => {
    if (other === element || !other.visible || !same(other)) return false;
    const theirs = (value(other) ?? '').toLowerCase();
    return theirs !== mine && theirs.includes(mine);
  });
}

/** The locator of an observed element, without the check for other matches. */
function baseLocator(
  element: ObservedElement,
  all: readonly ObservedElement[],
): LocatorSpec | undefined {
  if (element.testId !== undefined && element.testId !== '') {
    return { method: 'getByTestId', value: element.testId };
  }
  const name = element.name;
  if (name !== undefined && name !== '') {
    if (isRoleLocatable(element) && element.role !== undefined) {
      const role = element.role;
      const exact = hasLongerNamesake(
        element,
        all,
        (o) => o.role === role,
        (o) => o.name,
      );
      return { method: 'getByRole', role, name, ...(exact ? { exact } : {}) };
    }
    const byName = (method: 'getByLabel' | 'getByPlaceholder' | 'getByAltText' | 'getByTitle') => {
      const exact = hasLongerNamesake(
        element,
        all,
        () => true,
        (o) => o.name,
      );
      return { method, value: name, ...(exact ? { exact } : {}) } as LocatorSpec;
    };
    switch (element.nameSource) {
      case 'label':
      case 'aria-label':
      case 'aria-labelledby':
        return byName('getByLabel');
      case 'placeholder':
        return byName('getByPlaceholder');
      case 'alt':
        return byName('getByAltText');
      case 'title':
        return byName('getByTitle');
      default:
        break;
    }
  }
  const text = element.text;
  if (text !== undefined && text !== '' && !text.endsWith('…')) {
    const exact = hasLongerNamesake(
      element,
      all,
      () => true,
      (o) => o.text,
    );
    return { method: 'getByText', value: text, ...(exact ? { exact } : {}) };
  }
  return undefined;
}

/** What a locator matches, for comparing locators of different elements. */
function locatorKey(locator: LocatorSpec): string {
  const value = locator.method === 'getByRole' ? `${locator.role}|${locator.name}` : locator.value;
  // Test ids are matched exactly; names and texts ignore case (Playwright's default matching).
  return `${locator.method}|${locator.method === 'getByTestId' ? value : value.toLowerCase()}`;
}

/**
 * The locators of observed elements: test id > role + name > label > placeholder > alt text >
 * title > text. `exact: true` when another element's name contains this one; `first: true` when
 * another element has the same test id, or role and name (e.g. a link repeated in a menu), so that
 * the locator does not break Playwright's strict mode. `undefined` for an element that cannot be
 * located.
 */
export function locatorsFor(
  all: readonly ObservedElement[],
): Map<ObservedElement, LocatorSpec | undefined> {
  const base = new Map(all.map((element) => [element, baseLocator(element, all)] as const));
  const counts = new Map<string, { visible: number; total: number }>();
  for (const [element, locator] of base) {
    if (locator === undefined) continue;
    const key = locatorKey(locator);
    const count = counts.get(key) ?? { visible: 0, total: 0 };
    count.total++;
    if (element.visible) count.visible++;
    counts.set(key, count);
  }
  const result = new Map<ObservedElement, LocatorSpec | undefined>();
  for (const [element, locator] of base) {
    if (locator === undefined) {
      result.set(element, undefined);
      continue;
    }
    const count = counts.get(locatorKey(locator)) ?? { visible: 0, total: 0 };
    // getByRole() skips hidden elements; the other locators do not.
    const matches = locator.method === 'getByRole' ? count.visible : count.total;
    result.set(element, matches > 1 ? { ...locator, first: true } : locator);
  }
  return result;
}

/** The locator of one observed element (see `locatorsFor`). */
export function locatorFor(
  element: ObservedElement,
  all: readonly ObservedElement[],
): LocatorSpec | undefined {
  return locatorsFor(all).get(element);
}

// ---------------------------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------------------------

interface Group {
  region: ObservedRegion | undefined;
  elements: ObservedElement[];
  /** Document position of the first element, for ordering. */
  first: number;
}

function groupsOf(observation: ScreenObservation, groupBy: 'region' | 'flat'): Group[] {
  const visible = observation.elements.filter((e) => e.visible);
  if (groupBy === 'flat') {
    return visible.length > 0 ? [{ region: undefined, elements: visible, first: 0 }] : [];
  }
  const byRegion = new Map<string, Group>();
  observation.elements.forEach((element, index) => {
    if (!element.visible) return;
    let group = byRegion.get(element.region);
    if (!group) {
      const region = observation.regions.find((r) => r.id === element.region);
      group = { region, elements: [], first: index };
      byRegion.set(element.region, group);
    }
    group.elements.push(element);
  });
  return [...byRegion.values()].sort((a, b) => a.first - b.first);
}

/** The name of a flat (single) element: the first visible h1, else the default page name. */
function flatName(
  elements: readonly ObservedElement[],
  language: DraftLanguage,
): { name: string; fromHeading?: ObservedElement } {
  const page: ObservedRegion = { id: '*', kind: 'page', tag: 'body' };
  const h1 = elements.filter((e) => e.role === 'heading' && e.level === 1);
  return regionName(page, h1, language);
}

/** The proposed elements of an observation, before validation. */
export function proposeElements(
  observation: ScreenObservation,
  options: { language?: DraftLanguage; groupBy?: 'region' | 'flat' } = {},
): ProposedElement[] {
  const language = options.language ?? 'en';
  const groupBy = options.groupBy ?? 'region';
  const locators = locatorsFor(observation.elements);
  const takenElements = new Set<string>();
  const result: ProposedElement[] = [];

  for (const group of groupsOf(observation, groupBy)) {
    const region = group.region ?? {
      id: group.elements[0]?.region ?? 'page',
      kind: 'page',
      tag: 'body',
    };
    const naming =
      groupBy === 'flat'
        ? flatName(group.elements, language)
        : regionName(region, group.elements, language);

    const targets: ProposedTarget[] = [];
    const takenTargets = new Set<string>();
    for (const observed of group.elements) {
      const name = targetName(observed, language);
      const locator = locators.get(observed);
      if (name === '' || locator === undefined || takenTargets.has(name)) continue;
      takenTargets.add(name);
      targets.push({ name, locator, observed });
    }
    // The heading an element is named after would only repeat its name, unless it is all there is.
    const isNameHeading = (t: ProposedTarget): boolean =>
      t.observed === naming.fromHeading ||
      (t.observed.role === 'heading' && cleanName(t.observed.name) === naming.name);
    const withoutHeading = targets.filter((t) => !isNameHeading(t));
    const kept = withoutHeading.length > 0 ? withoutHeading : targets;
    if (kept.length === 0) continue;

    const element: ProposedElement = {
      name: uniqueName(naming.name, takenElements),
      region: groupBy === 'flat' ? '*' : region.id,
      targets: kept,
    };
    const controls = targets.filter((t) => t.observed.disabled !== undefined);
    const extra: ProposedElement[] = [];
    const only = controls.length === 1 ? controls[0] : undefined;
    if (only) {
      element.state = only.observed.disabled === true ? 'disable' : 'enable';
      element.self = only.locator;
    } else {
      for (const control of controls) {
        if (control.observed.disabled !== true) continue;
        extra.push({
          name: uniqueName(control.name, takenElements),
          region: element.region,
          targets: [],
          state: 'disable',
          self: control.locator,
        });
      }
    }
    result.push(element, ...extra);
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// Rendering and validation
// ---------------------------------------------------------------------------------------------

/** What produced a line of the rendered draft. */
type LineOrigin =
  | { kind: 'element'; element: number }
  | { kind: 'target'; element: number; target: number }
  | { kind: 'state'; element: number };

interface Rendered {
  text: string;
  origins: Map<number, LineOrigin>;
}

/** The header comment of a draft. */
function headerComment(url: string, language: DraftLanguage): string {
  return language === 'ja'
    ? `# nimaime draft が ${url} から提案した下書きです。レビューしてからコミットしてください。`
    : `# Draft proposed by nimaime draft from ${url}. Review it before committing.`;
}

function render(
  screen: string,
  elements: readonly ProposedElement[],
  language: DraftLanguage,
  header: string | undefined,
): Rendered {
  const k = LANGUAGES[language]?.keywords ?? LANGUAGES.en?.keywords;
  if (!k) throw new Error('unreachable: no keyword table');
  const kw = (slot: keyof typeof k): string => k[slot][0] ?? '';
  const lines: string[] = [];
  const origins = new Map<number, LineOrigin>();
  if (language !== 'en') lines.push(`# language: ${language}`);
  if (header !== undefined) lines.push(header);
  if (lines.length > 0) lines.push('');
  lines.push(`${kw('screen')}: ${screen}`);
  elements.forEach((element, e) => {
    lines.push('');
    lines.push(`  ${kw('element')}: ${element.name}`);
    origins.set(lines.length, { kind: 'element', element: e });
    element.targets.forEach((target, t) => {
      lines.push(`    ${t === 0 ? kw('show') : kw('and')}: ${target.name}`);
      origins.set(lines.length, { kind: 'target', element: e, target: t });
    });
    if (element.state !== undefined) {
      lines.push(`    ${element.state === 'enable' ? kw('enable') : kw('disable')}`);
      origins.set(lines.length, { kind: 'state', element: e });
    }
  });
  return { text: `${lines.join('\n')}\n`, origins };
}

/**
 * Renders `elements` as Sanmaime and parses it; while the parser reports errors, drops the lines
 * they point at (a target, a state, or a whole element) and tries again. Never returns invalid
 * Sanmaime. @throws DraftError when nothing valid is left.
 */
export function validateDraft(
  screen: string,
  proposed: readonly ProposedElement[],
  language: DraftLanguage,
  header?: string,
): { sanmaime: string; elements: ProposedElement[]; dropped: DroppedLine[] } {
  let elements = proposed.map((e) => ({ ...e, targets: [...e.targets] }));
  const dropped: DroppedLine[] = [];
  for (;;) {
    const elementsBefore = elements;
    // Elements without expectations are always invalid (E009): drop them up front.
    elements = elements.filter((e) => e.targets.length > 0 || e.state !== undefined);
    if (elements.length === 0) {
      throw new DraftError(
        proposed.length === 0
          ? 'Nothing to propose: the page has no visible element with a test id or an accessible name.'
          : 'Nothing to propose: every proposed line was rejected by the parser.',
      );
    }
    if (elements.length !== elementsBefore.length) continue;
    const { text, origins } = render(screen, elements, language, header);
    const errors = parse(text, { language }).diagnostics.filter((d) => d.severity === 'error');
    if (errors.length === 0) return { sanmaime: text, elements, dropped };

    const dropTargets = new Map<number, Set<number>>();
    const dropStates = new Set<number>();
    const dropElements = new Set<number>();
    for (const diagnostic of errors) {
      const origin = origins.get(diagnostic.location.line);
      if (!origin) {
        throw new DraftError(
          `The draft of Screen "${screen}" is invalid: ${diagnostic.code} ${diagnostic.message}`,
        );
      }
      const element = elements[origin.element];
      if (!element) continue;
      if (origin.kind === 'target') {
        const set = dropTargets.get(origin.element) ?? new Set<number>();
        set.add(origin.target);
        dropTargets.set(origin.element, set);
        dropped.push({
          element: element.name,
          item: element.targets[origin.target]?.name,
          diagnostic,
        });
      } else if (origin.kind === 'state') {
        dropStates.add(origin.element);
        dropped.push({ element: element.name, item: element.state, diagnostic });
      } else {
        dropElements.add(origin.element);
        dropped.push({ element: element.name, item: undefined, diagnostic });
      }
    }
    elements = elements
      .map((element, index) => {
        const targets = dropTargets.get(index);
        const next = {
          ...element,
          targets: element.targets.filter((_, t) => !targets?.has(t)),
        };
        if (dropStates.has(index)) {
          delete next.state;
          delete next.self;
        }
        return next;
      })
      .filter((_, index) => !dropElements.has(index));
  }
}

/**
 * Proposes a Sanmaime draft and a definitions draft for an observed screen (see the module
 * comment). @throws DraftError
 */
export function proposeSanmaime(observation: ScreenObservation, options: ProposeOptions): Proposal {
  const screen = cleanName(options.screen);
  if (screen === '') throw new DraftError('The screen name must not be empty.');
  const language = options.language ?? 'en';
  const header = options.header === false ? undefined : headerComment(observation.url, language);
  const proposed = proposeElements(observation, { language, groupBy: options.groupBy ?? 'region' });
  const { sanmaime, elements, dropped } = validateDraft(screen, proposed, language, header);
  const definitions = renderDefinitions({
    screen,
    url: observation.url,
    quotes: options.quotes ?? 'single',
    elements: elements.map((e) => ({
      name: e.name,
      self: e.state !== undefined ? e.self : undefined,
      targets: e.targets.map((t) => ({ name: t.name, locator: t.locator })),
    })),
  });
  return { screen, language, sanmaime, definitions, elements, dropped };
}
