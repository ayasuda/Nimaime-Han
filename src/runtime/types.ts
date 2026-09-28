import type {
  Locator,
  PlaywrightTestArgs,
  PlaywrightTestOptions,
  PlaywrightWorkerArgs,
  PlaywrightWorkerOptions,
  TestType,
} from '@playwright/test';

/** Fixtures available to definitions when `createNimaime()` is called without a custom `test`. */
export type DefaultFixtures = PlaywrightTestArgs &
  PlaywrightTestOptions &
  PlaywrightWorkerArgs &
  PlaywrightWorkerOptions;

/** The type of `test` exported by `@playwright/test`. */
export type DefaultTestType = TestType<
  PlaywrightTestArgs & PlaywrightTestOptions,
  PlaywrightWorkerArgs & PlaywrightWorkerOptions
>;

/** Any Playwright `test` (the constraint of `createNimaime`, as in playwright-bdd's `createBdd`). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTestType = TestType<any, any>;

/** Test-scoped and worker-scoped fixtures of a Playwright `test` type. */
export type FixturesOf<T> =
  T extends TestType<infer TestArgs, infer WorkerArgs> ? TestArgs & WorkerArgs : never;

/**
 * Fixture type used where definitions are stored with their fixture type erased (the registry).
 * Callers of stored callbacks pass the real fixtures object of the running test.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFixtures = any;

/** Locates a Sanmaime target (or the Element itself) from the test's fixtures. */
export type LocatorFn<F = DefaultFixtures> = (fixtures: F) => Locator;

/**
 * Establishes the state named by a Sanmaime `When:` condition. It may return a promise, which is
 * awaited; its value is ignored (so `({ page }) => page.click('…')` is fine).
 */
export type ConditionFn<F = DefaultFixtures> = (fixtures: F) => unknown;

/**
 * Navigates to a screen (reaches its base state). It may return a promise, which is awaited; its
 * value is ignored (so `({ page }) => page.goto('/users/me')` is fine).
 */
export type OpenScreenFn<F = DefaultFixtures> = (fixtures: F) => unknown;

/** Options of `defineScreen`. */
export interface ScreenOptions<F = DefaultFixtures> {
  /** Navigates to the screen, e.g. `({ page }) => page.goto('/users/me')`. */
  open?: OpenScreenFn<F>;
}

/** Maps Sanmaime target names (the names used in `Show:` / `Hide:` / `And:`) to locators. */
export type ElementTargets<F = DefaultFixtures> = Record<string, LocatorFn<F>>;

/** Options of `defineCondition`. */
export interface ConditionOptions {
  /**
   * Restricts the condition to one screen (by its `Screen:` name). Without it the condition is
   * global. At run time a screen-scoped condition wins over a global one of the same name.
   */
  screen?: string;
}

/** `defineScreen(name, { open })`. */
export type DefineScreen<F = DefaultFixtures> = (name: string, options?: ScreenOptions<F>) => void;

/** `defineElement(name, targets)` or `defineElement(name, self, targets?)`. */
export interface DefineElement<F = DefaultFixtures> {
  /** Defines an Element by the locators of its targets (the names used in `Show:` / `Hide:`). */
  (name: string, targets: ElementTargets<F>): void;
  /**
   * Defines an Element with a locator for the Element itself (used by `Enable` / `Disable`) and,
   * optionally, the locators of its targets.
   */
  (name: string, self: LocatorFn<F>, targets?: ElementTargets<F>): void;
}

/** `defineCondition(name, fn, { screen? })`. */
export type DefineCondition<F = DefaultFixtures> = (
  name: string,
  fn: ConditionFn<F>,
  options?: ConditionOptions,
) => void;

/** The definition functions returned by `createNimaime(test)`. */
export interface NimaimeDefinitions<F = DefaultFixtures> {
  defineScreen: DefineScreen<F>;
  defineElement: DefineElement<F>;
  defineCondition: DefineCondition<F>;
}
