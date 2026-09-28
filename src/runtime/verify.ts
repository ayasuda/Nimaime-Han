/**
 * What `$nimaime.verify(fixtures, screen, { when, elements })` checks, resolved from the spec
 * registry (pure: no browser, no definitions called).
 */
import { NimaimeRuntimeError } from './errors';
import type { NimaimePlan, SanmaimePosition } from './plan';
import { formatSanmaimeLocation } from './resolve';
import { findScreenSpec, listScreenSpecs, type ScreenSpec } from './spec-registry';

/** Options of `$nimaime.verify()`. */
export interface VerifyOptions {
  /**
   * The `When:` condition(s) the page is currently in. For each name, the matching `When:` block of
   * every (selected) element is checked. The condition itself is **not** established: the caller
   * (e.g. the preceding Gherkin steps) has already put the page in that state. Without `when`,
   * only the unconditional expectations (the screen's invariants) are checked.
   */
  when?: string | readonly string[];
  /** Restricts the check to these `Element:` names. Default: every element of the screen. */
  elements?: string | readonly string[];
}

/** The checks of one element: its unconditional block and/or the selected `When:` blocks. */
export interface VerifyElementPlan {
  element: string;
  location?: SanmaimePosition;
  /**
   * One plan per block, in source order: the unconditional block first (no `condition`), then
   * the selected `When:` blocks (with `condition` and `locations.condition`). Never empty.
   */
  blocks: NimaimePlan[];
}

/** Everything `$nimaime.verify()` checks for one call. */
export interface VerifyPlan {
  screen: string;
  file?: string;
  location?: SanmaimePosition;
  /** Elements with at least one expectation to check, in source order. Never empty. */
  elements: VerifyElementPlan[];
}

const quoteList = (names: readonly string[]): string =>
  names.length === 0 ? '(none)' : names.map((name) => `"${name}"`).join(', ');

const toList = (value: string | readonly string[] | undefined): string[] =>
  value === undefined ? [] : [...new Set((typeof value === 'string' ? [value] : value).map(trim))];

const trim = (name: string): string => name.trim();

function specError(message: string, spec: ScreenSpec): NimaimeRuntimeError {
  const where = formatSanmaimeLocation(spec.file, spec.location);
  return new NimaimeRuntimeError(where === undefined ? message : `${message}\nLocation: ${where}`);
}

/**
 * Resolves a `verify` call against the spec registry. Throws `NimaimeRuntimeError` for an unknown
 * screen, element or condition name (listing the known names), or when the selection contains no
 * expectation at all (so that a typo cannot make a check pass silently).
 */
export function planVerify(screen: string, options: VerifyOptions = {}): VerifyPlan {
  const spec = findScreenSpec(screen);
  if (!spec) {
    const known = listScreenSpecs().map((s) => s.screen);
    throw new NimaimeRuntimeError(
      known.length === 0
        ? `No Sanmaime spec for "Screen: ${screen.trim()}": no .sanmaime file is loaded. ` +
            `Load them once, e.g. await loadSanmaimeSpecs('specs/**/*.sanmaime'), before verifying.`
        : `No Sanmaime spec for "Screen: ${screen.trim()}". Loaded screens: ${quoteList(known)}.`,
    );
  }

  const wanted = toList(options.elements);
  const allElements = spec.elements.map((e) => e.element);
  const unknownElements = wanted.filter((name) => !allElements.includes(name));
  if (unknownElements.length > 0) {
    throw specError(
      `Screen "${spec.screen}" has no element ${quoteList(unknownElements)}. ` +
        `Elements: ${quoteList(allElements)}.`,
      spec,
    );
  }
  const selected =
    wanted.length === 0 ? spec.elements : spec.elements.filter((e) => wanted.includes(e.element));

  const when = toList(options.when);
  const knownConditions = [...new Set(selected.flatMap((e) => e.conditions.map((c) => c.name)))];
  const unknownConditions = when.filter((name) => !knownConditions.includes(name));
  if (unknownConditions.length > 0) {
    const scope =
      wanted.length === 0
        ? `Screen "${spec.screen}" has`
        : `The selected elements (${quoteList(wanted)}) of Screen "${spec.screen}" have`;
    throw specError(
      `${scope} no ` +
        `${unknownConditions.map((name) => `"When: ${name}"`).join(', ')} block. ` +
        `Conditions: ${quoteList(knownConditions)}.`,
      spec,
    );
  }

  const elements: VerifyElementPlan[] = [];
  for (const element of selected) {
    const base = {
      screen: spec.screen,
      element: element.element,
      ...(spec.file === undefined ? {} : { file: spec.file }),
    };
    const locations = { screen: spec.location, element: element.location };
    const blocks: NimaimePlan[] = [];
    if (element.unconditional.length > 0) {
      blocks.push({ ...base, expectations: element.unconditional, locations });
    }
    for (const block of element.conditions) {
      if (!when.includes(block.name) || block.expectations.length === 0) continue;
      blocks.push({
        ...base,
        condition: block.name,
        expectations: block.expectations,
        locations: { ...locations, condition: block.location },
      });
    }
    if (blocks.length > 0) {
      elements.push({ element: element.element, location: element.location, blocks });
    }
  }
  if (elements.length === 0) {
    throw specError(
      `Nothing to verify in Screen "${spec.screen}": the selected elements have no ` +
        `unconditional expectations${when.length === 0 ? '' : ' and no matching When: blocks'}. ` +
        `Pass the current state with { when: … }. Conditions: ${quoteList(knownConditions)}.`,
      spec,
    );
  }
  return {
    screen: spec.screen,
    ...(spec.file === undefined ? {} : { file: spec.file }),
    location: spec.location,
    elements,
  };
}
