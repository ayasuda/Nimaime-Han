import { dirname, isAbsolute, relative, resolve } from 'node:path';
import type { Locator } from '@playwright/test';
import { NimaimeRuntimeError } from './errors';
import { createExpectationError, describeExpected } from './failure';
import {
  EXPECTATION_KEYWORDS,
  expectationTitle,
  type ExpectationContext,
  type ExpectationKind,
  type NimaimeExpectation,
  type NimaimePlan,
  type SanmaimePosition,
} from './plan';
import {
  guardFixtures,
  locate,
  resolveCondition,
  resolveScreen,
  resolveSelf,
  resolveTarget,
  validatePlan,
} from './resolve';

/**
 * The fixtures object a generated test passes to `$nimaime`: the fixtures it destructured
 * (`{ page, login }`). Playwright only sets up the fixtures a test destructures, so the generated
 * test must request every fixture that the definitions it runs use (see `collectFixtureNames`).
 */
export type NimaimeFixtures = object;

/**
 * The `$nimaime` fixture: executes Sanmaime at run time. The counterpart of playwright-bdd's
 * `$bddContext` & friends. Every method takes the test's fixtures as its first argument and passes
 * them to the definition callbacks.
 *
 * Each action is wrapped in `test.step()` titled like the Sanmaime line (`Screen: User Details`,
 * `When: Viewing your own profile`, `Show: Username`, `Enable`), located at that line when the
 * `.sanmaime` file and position are known, so traces and reports show the specification.
 */
export interface Nimaime {
  /**
   * Runs a whole plan: validates it, opens the screen (once per test), establishes the condition
   * (if any, once per test) and checks each expectation in order. Stops at the first failure.
   */
  run(fixtures: NimaimeFixtures, plan: NimaimePlan): Promise<void>;
  /** Opens `screen` with its definition's `open`, once per test. No definition / no `open`: no-op. */
  screen(fixtures: NimaimeFixtures, screen: string, ctx?: ExpectationContext): Promise<void>;
  /**
   * Establishes `condition` (screen-scoped definition of `ctx.screen` first, then global), once
   * per test. Throws `NimaimeRuntimeError` if it is not defined.
   */
  condition(fixtures: NimaimeFixtures, condition: string, ctx?: ExpectationContext): Promise<void>;
  /** `Show: target` — the target of `element` is visible. */
  expectShow(
    fixtures: NimaimeFixtures,
    element: string,
    target: string,
    ctx?: ExpectationContext,
  ): Promise<void>;
  /** `Hide: target` — the target of `element` is hidden or absent. */
  expectHide(
    fixtures: NimaimeFixtures,
    element: string,
    target: string,
    ctx?: ExpectationContext,
  ): Promise<void>;
  /** `Enable` — the element itself (its `self` locator) is enabled. */
  expectEnable(fixtures: NimaimeFixtures, element: string, ctx?: ExpectationContext): Promise<void>;
  /** `Disable` — the element itself (its `self` locator) is disabled. */
  expectDisable(
    fixtures: NimaimeFixtures,
    element: string,
    ctx?: ExpectationContext,
  ): Promise<void>;
  /** Checks one expectation of `element` (dispatches to the four methods above). */
  check(
    fixtures: NimaimeFixtures,
    element: string,
    expectation: NimaimeExpectation,
    ctx?: ExpectationContext,
  ): Promise<void>;
}

/** A Playwright step location. */
export interface StepLocation {
  file: string;
  line: number;
  column: number;
}

/** What the runtime needs from Playwright (injected so the orchestration can be unit-tested). */
export interface NimaimeDriver {
  /** `test.step(title, body, { box, location })`. */
  step(title: string, body: () => Promise<void>, location: StepLocation | undefined): Promise<void>;
  /** The web-first assertion of `kind` (`toBeVisible` / `toBeHidden` / `toBeEnabled` / `toBeDisabled`). */
  assert(kind: ExpectationKind, locator: Locator): Promise<void>;
  /** Observes the actual state after a failure (see `probeActual`). */
  probe(kind: ExpectationKind, locator: Locator): Promise<string | undefined>;
  /** The running spec file; relative `.sanmaime` paths are resolved against its directory. */
  specFile: string | undefined;
  /** Directory that `.sanmaime` paths are displayed relative to (default: `process.cwd()`). */
  cwd?: string;
}

/** Creates the `$nimaime` object of one test. */
export function createNimaimeRuntime(driver: NimaimeDriver): Nimaime {
  const openedScreens = new Set<string>();
  const establishedConditions = new Set<string>();

  const absoluteFile = (file: string): string => {
    if (isAbsolute(file) || driver.specFile === undefined) return file;
    return resolve(dirname(driver.specFile), file);
  };

  const displayFile = (file: string | undefined): string | undefined => {
    if (file === undefined) return undefined;
    const abs = absoluteFile(file);
    if (!isAbsolute(abs)) return abs;
    const rel = relative(driver.cwd ?? process.cwd(), abs);
    return rel === '' || rel.startsWith('..') || isAbsolute(rel) ? abs : rel;
  };

  const stepLocation = (
    file: string | undefined,
    position: SanmaimePosition | undefined,
  ): StepLocation | undefined =>
    file === undefined || position === undefined
      ? undefined
      : { file: absoluteFile(file), line: position.line, column: position.column };

  const checkLocator = async (
    kind: ExpectationKind,
    element: string,
    target: string | undefined,
    locator: Locator,
    ctx: ExpectationContext,
  ): Promise<void> => {
    const location = stepLocation(ctx.file, ctx.location);
    try {
      await driver.assert(kind, locator);
    } catch (error) {
      const actual = await driver.probe(kind, locator);
      throw createExpectationError(
        {
          screen: ctx.screen,
          element,
          condition: ctx.condition,
          kind,
          target,
          file: displayFile(ctx.file),
          location: ctx.location,
          expected: describeExpected(kind, target),
          actual,
        },
        error,
        location && { ...location, title: expectationTitle(kind, target) },
      );
    }
  };

  const expectTarget = async (
    kind: 'show' | 'hide',
    fixtures: NimaimeFixtures,
    element: string,
    target: string,
    ctx: ExpectationContext = {},
  ): Promise<void> => {
    const fn = resolveTarget(element, target, ctx);
    await driver.step(
      expectationTitle(kind, target),
      async () => {
        const locator = locate(fn, fixtures, `Element "${element}" target "${target}"`);
        await checkLocator(kind, element, target, locator, ctx);
      },
      stepLocation(ctx.file, ctx.location),
    );
  };

  const expectSelf = async (
    kind: 'enable' | 'disable',
    fixtures: NimaimeFixtures,
    element: string,
    ctx: ExpectationContext = {},
  ): Promise<void> => {
    const fn = resolveSelf(element, ctx);
    await driver.step(
      expectationTitle(kind),
      async () => {
        const locator = locate(fn, fixtures, `Element "${element}"`);
        await checkLocator(kind, element, undefined, locator, ctx);
      },
      stepLocation(ctx.file, ctx.location),
    );
  };

  const nimaime: Nimaime = {
    async run(fixtures, plan) {
      validatePlan(plan);
      const base: ExpectationContext = { screen: plan.screen, file: plan.file };
      await nimaime.screen(fixtures, plan.screen, { ...base, location: plan.locations?.screen });
      if (plan.condition !== undefined) {
        await nimaime.condition(fixtures, plan.condition, {
          ...base,
          location: plan.locations?.condition,
        });
      }
      for (const expectation of plan.expectations) {
        await nimaime.check(fixtures, plan.element, expectation, {
          ...base,
          condition: plan.condition,
          location: expectation.location,
        });
      }
    },

    async screen(fixtures, screen, ctx = {}) {
      if (openedScreens.has(screen)) return;
      openedScreens.add(screen);
      const open = resolveScreen(screen)?.open;
      if (!open) return;
      await driver.step(
        `Screen: ${screen}`,
        async () => {
          await open(guardFixtures(fixtures, `Screen "${screen}" open`));
        },
        stepLocation(ctx.file, ctx.location),
      );
    },

    async condition(fixtures, condition, ctx = {}) {
      const def = resolveCondition(condition, ctx);
      const key = `${ctx.screen ?? ''}\u0000${condition}`;
      if (establishedConditions.has(key)) return;
      establishedConditions.add(key);
      await driver.step(
        `When: ${condition}`,
        async () => {
          await def.fn(guardFixtures(fixtures, `Condition "${condition}"`));
        },
        stepLocation(ctx.file, ctx.location),
      );
    },

    expectShow: (fixtures, element, target, ctx) =>
      expectTarget('show', fixtures, element, target, ctx),
    expectHide: (fixtures, element, target, ctx) =>
      expectTarget('hide', fixtures, element, target, ctx),
    expectEnable: (fixtures, element, ctx) => expectSelf('enable', fixtures, element, ctx),
    expectDisable: (fixtures, element, ctx) => expectSelf('disable', fixtures, element, ctx),

    async check(fixtures, element, expectation, ctx = {}) {
      const full = { ...ctx, location: expectation.location ?? ctx.location };
      switch (expectation.kind) {
        case 'show':
        case 'hide':
          if (expectation.target === undefined) {
            throw new NimaimeRuntimeError(
              `"${EXPECTATION_KEYWORDS[expectation.kind]}:" of element "${element}" needs a target name.`,
            );
          }
          await expectTarget(expectation.kind, fixtures, element, expectation.target, full);
          return;
        case 'enable':
        case 'disable':
          await expectSelf(expectation.kind, fixtures, element, full);
          return;
      }
    },
  };
  return nimaime;
}
