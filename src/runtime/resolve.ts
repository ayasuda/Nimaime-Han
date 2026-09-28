import type { Locator } from '@playwright/test';
import { NimaimeRuntimeError } from './errors';
import {
  planConditionLocation,
  planConditions,
  planConditionTitle,
  type ConditionStepKeyword,
  type ExpectationContext,
  type NimaimePlan,
  type SanmaimePosition,
} from './plan';
import {
  findCondition,
  findElement,
  findScreen,
  type ConditionDefinition,
  type ElementDefinition,
  type ScreenDefinition,
} from './registry';
import type { AnyFixtures, LocatorFn } from './types';

/**
 * `file:line` of a Sanmaime position for messages, or `undefined` when the file is unknown. The
 * column is left out on purpose: Playwright parses every `…:line:column` line of an error's stack
 * (message included) as a stack frame.
 */
export function formatSanmaimeLocation(
  file: string | undefined,
  position: SanmaimePosition | undefined,
): string | undefined {
  if (file === undefined) return undefined;
  return position ? `${file}:${String(position.line)}` : file;
}

function runtimeError(message: string, ctx: ExpectationContext): NimaimeRuntimeError {
  const where = formatSanmaimeLocation(ctx.file, ctx.location);
  return new NimaimeRuntimeError(where === undefined ? message : `${message}\nLocation: ${where}`);
}

/** The screen definition, or `undefined` (a screen without a definition is not opened). */
export function resolveScreen(name: string): ScreenDefinition | undefined {
  return findScreen(name);
}

/** The element definition named `element`; throws `NimaimeRuntimeError` if there is none. */
export function resolveElement(element: string, ctx: ExpectationContext = {}): ElementDefinition {
  const def = findElement(element);
  if (!def) {
    const screen = ctx.screen === undefined ? '' : ` (Screen: ${ctx.screen})`;
    throw runtimeError(
      `No element definition for "Element: ${element}"${screen}. ` +
        `Define it with defineElement('${element}', …).`,
      ctx,
    );
  }
  return def;
}

/** The locator function of `target` of `element` (for `Show:` / `Hide:`). */
export function resolveTarget(
  element: string,
  target: string,
  ctx: ExpectationContext = {},
): LocatorFn<AnyFixtures> {
  const def = resolveElement(element, ctx);
  const fn = def.targets.get(target);
  if (!fn) {
    const known = [...def.targets.keys()].map((name) => `"${name}"`).join(', ');
    throw runtimeError(
      `Element "${element}" has no target "${target}". ` +
        (known ? `Defined targets: ${known}.` : 'It defines no targets.'),
      ctx,
    );
  }
  return fn;
}

/** The locator function of the element itself (for `Enable` / `Disable`). */
export function resolveSelf(element: string, ctx: ExpectationContext = {}): LocatorFn<AnyFixtures> {
  const def = resolveElement(element, ctx);
  if (!def.self) {
    throw runtimeError(
      `Element "${element}" has no locator for the element itself, which Enable / Disable need. ` +
        `Define it with defineElement('${element}', ({ page }) => …, { …targets }).`,
      ctx,
    );
  }
  return def.self;
}

/**
 * The condition named `condition` as seen from `ctx.screen`; throws if there is none. `keyword`
 * is how the condition is used (`When`, `And when`, `Background`), for the message.
 */
export function resolveCondition(
  condition: string,
  ctx: ExpectationContext = {},
  keyword: ConditionStepKeyword = 'When',
): ConditionDefinition {
  const def = findCondition(condition, { screen: ctx.screen });
  if (!def) {
    const screen = ctx.screen === undefined ? '' : ` in Screen "${ctx.screen}"`;
    throw runtimeError(
      `No condition definition for "${keyword}: ${condition}"${screen}. ` +
        `Define it with defineCondition('${condition}', async ({ page }) => { … }).`,
      ctx,
    );
  }
  return def;
}

/**
 * Checks that every name used by `plan` resolves (element, targets, `self`, background and block
 * conditions), so that a test fails before it starts driving the browser. Throws
 * `NimaimeRuntimeError`.
 */
export function validatePlan(plan: NimaimePlan): void {
  const base: ExpectationContext = { screen: plan.screen, file: plan.file };
  resolveElement(plan.element, { ...base, location: plan.locations?.element });
  for (const [index, name] of (plan.background ?? []).entries()) {
    resolveCondition(
      name,
      { ...base, location: plan.locations?.background?.[index] },
      'Background',
    );
  }
  for (const [index, name] of planConditions(plan).entries()) {
    resolveCondition(
      name,
      { ...base, location: planConditionLocation(plan, index) },
      index === 0 ? 'When' : 'And when',
    );
  }
  validateExpectations(plan);
}

/**
 * Checks that the element of `plan` and every target / `self` locator its expectations use
 * resolve, without looking at the condition definition (`$nimaime.verify` does not establish the
 * condition). Throws `NimaimeRuntimeError`.
 */
export function validateExpectations(plan: NimaimePlan): void {
  const base: ExpectationContext = { screen: plan.screen, file: plan.file };
  resolveElement(plan.element, { ...base, location: plan.locations?.element });
  const condition = planConditionTitle(plan);
  for (const expectation of plan.expectations) {
    const ctx = { ...base, condition, location: expectation.location };
    if (expectation.kind === 'show' || expectation.kind === 'hide') {
      if (expectation.target === undefined) {
        throw runtimeError(`A "${expectation.kind}" expectation needs a target name.`, ctx);
      }
      resolveTarget(plan.element, expectation.target, ctx);
    } else {
      resolveSelf(plan.element, ctx);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

/**
 * The fixture names a definition callback destructures from its first parameter, like Playwright
 * does for fixtures and tests (`({ page, login }) => …` -> `['page', 'login']`). Returns `[]` for a
 * callback without parameters and `undefined` when the first parameter is not an object
 * destructuring pattern (e.g. `(fixtures) => fixtures.page`), so the names cannot be known.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export function fixtureNamesOf(fn: Function): string[] | undefined {
  const text = stripComments(fn.toString()).trim();
  let params: string;
  // A single-parameter arrow function without parentheses: `f => …`.
  const arrow = /^(?:async\s+)?([\w$]+)\s*=>/.exec(text);
  if (arrow) {
    params = arrow[1] ?? '';
  } else {
    const open = text.indexOf('(');
    if (open === -1) return undefined;
    const end = matchingParen(text, open);
    if (end === -1) return undefined;
    params = text.slice(open + 1, end).trim();
  }
  if (params === '') return [];
  const [first = ''] = splitTopLevel(params);
  if (!first.startsWith('{') || !first.endsWith('}')) return undefined;
  const names: string[] = [];
  for (const prop of splitTopLevel(first.slice(1, -1))) {
    if (prop === '') continue;
    // A rest element (`{ page, ...rest }`) hides which fixtures are used.
    if (prop.startsWith('...')) return undefined;
    const name = /^[\w$]+|^'[^']*'|^"[^"]*"/.exec(prop)?.[0];
    if (name === undefined) return undefined;
    names.push(name.replace(/^['"]|['"]$/g, ''));
  }
  return names;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function matchingParen(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current.trim());
  return parts;
}

/** Result of `collectFixtureNames`. */
export interface PlanFixtures {
  /** Fixture names used by the callbacks the plan runs, sorted, without duplicates. */
  names: string[];
  /**
   * Callbacks whose fixtures could not be determined (first parameter not destructured), e.g.
   * `condition "Logged in"`. The generator should then request a safe default set or report them.
   */
  unknown: string[];
}

/**
 * The fixtures that the definition callbacks run by `plan` destructure (screen `open`, the `fn`
 * of every background and block condition, the element's `self` and target locators). The generated test must request exactly these
 * fixtures (Playwright only sets up the fixtures a test destructures) and pass them to
 * `$nimaime.run(fixtures, plan)`. Unresolvable names are skipped (the runtime reports them).
 */
export function collectFixtureNames(plan: NimaimePlan): PlanFixtures {
  const names = new Set<string>();
  const unknown: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  const add = (label: string, fn: Function | undefined): void => {
    if (!fn) return;
    const found = fixtureNamesOf(fn);
    if (found === undefined) unknown.push(label);
    else for (const name of found) names.add(name);
  };
  add(`screen "${plan.screen}" open`, findScreen(plan.screen)?.open);
  for (const name of [...(plan.background ?? []), ...planConditions(plan)]) {
    add(`condition "${name}"`, findCondition(name, { screen: plan.screen })?.fn);
  }
  const element = findElement(plan.element);
  if (element) {
    for (const expectation of plan.expectations) {
      if (expectation.kind === 'show' || expectation.kind === 'hide') {
        const target = expectation.target ?? '';
        add(`element "${plan.element}" target "${target}"`, element.targets.get(target));
      } else {
        add(`element "${plan.element}" self`, element.self);
      }
    }
  }
  return { names: [...names].sort(), unknown: [...new Set(unknown)] };
}

// Keys that libraries and `await` probe on arbitrary objects; reading them must not throw.
const PROBED_KEYS = new Set(['then', 'toJSON', 'constructor', 'asymmetricMatch', '$$typeof']);

/**
 * Wraps the fixtures object passed to definition callbacks so that reading a fixture the test did
 * not provide throws a `NimaimeRuntimeError` naming the definition, instead of a confusing
 * `undefined` error inside the callback.
 */
export function guardFixtures(fixtures: object, label: string): AnyFixtures {
  return new Proxy(fixtures, {
    get(target, key, receiver) {
      if (typeof key === 'string' && !(key in target) && !PROBED_KEYS.has(key)) {
        throw new NimaimeRuntimeError(
          `${label} uses the fixture "${key}", but the test did not provide it. ` +
            `Regenerate the specs (nimaime-gen) or pass "${key}" to $nimaime.`,
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return Reflect.get(target, key, receiver);
    },
  });
}

/** Calls a locator function with guarded fixtures. */
export function locate(fn: LocatorFn<AnyFixtures>, fixtures: object, label: string): Locator {
  return fn(guardFixtures(fixtures, label));
}
