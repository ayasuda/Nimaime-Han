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

/** Worker-scoped fixtures available to `beforeScreen` / `afterScreen` hooks by default. */
export type DefaultWorkerFixtures = PlaywrightWorkerArgs & PlaywrightWorkerOptions;

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

/** Worker-scoped fixtures of a Playwright `test` type (what `test.beforeAll` may use). */
export type WorkerFixturesOf<T> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends TestType<any, infer WorkerArgs> ? WorkerArgs : never;

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

// ---------------------------------------------------------------------------------------------
// Hooks (docs/hooks.md)
// ---------------------------------------------------------------------------------------------

/** The four hook kinds, in the order of a Screen's life cycle. */
export type HookKind = 'beforeScreen' | 'afterScreen' | 'beforeElement' | 'afterElement';

/** What a hook runs for: the second argument of every hook. */
export interface HookInfo {
  /** The `Screen:` name. */
  screen: string;
  /** The `Element:` name (element hooks only). */
  element?: string;
  /**
   * The `When:` name of the block the test checks (element hooks only); `undefined` for the
   * element's unconditional block.
   */
  condition?: string;
}

/** The second argument of `beforeScreen` / `afterScreen` hooks. */
export interface ScreenHookInfo {
  screen: string;
}

/** The second argument of `beforeElement` / `afterElement` hooks. */
export interface ElementHookInfo {
  screen: string;
  element: string;
  /** The `When:` name of the test's block; `undefined` for the unconditional block. */
  condition?: string;
}

/**
 * A `beforeScreen` / `afterScreen` hook. It runs in `test.beforeAll` / `test.afterAll`, so it
 * receives **worker-scoped** fixtures only (`browser`, custom worker fixtures) — no `page`.
 * A returned promise is awaited; its value is ignored.
 */
export type ScreenHookFn<W = DefaultWorkerFixtures> = (
  fixtures: W,
  info: ScreenHookInfo,
) => unknown;

/**
 * A `beforeElement` / `afterElement` hook. It runs in `test.beforeEach` / `test.afterEach` of the
 * Element's tests, with the test's fixtures (`page`, custom fixtures, …). A returned promise is
 * awaited; its value is ignored.
 */
export type ElementHookFn<F = DefaultFixtures> = (fixtures: F, info: ElementHookInfo) => unknown;

/** Options of `beforeScreen` / `afterScreen`. */
export interface ScreenHookOptions {
  /** Restricts the hook to one screen (its `Screen:` name). Without it the hook is global. */
  screen?: string;
  /**
   * A tag expression restricting the hook (like playwright-bdd's `Before({ tags })`).
   * **Not supported yet:** it is stored but ignored until tag expressions land (#15 / #17).
   */
  tags?: string;
}

/** Options of `beforeElement` / `afterElement`. */
export interface ElementHookOptions extends ScreenHookOptions {
  /** Restricts the hook to one element (its `Element:` name), in every screen unless `screen` is set. */
  element?: string;
}

/** `beforeScreen(fn, { screen?, tags? })` / `afterScreen(fn, …)`. */
export type DefineScreenHook<W = DefaultWorkerFixtures> = (
  fn: ScreenHookFn<W>,
  options?: ScreenHookOptions,
) => void;

/** `beforeElement(fn, { screen?, element?, tags? })` / `afterElement(fn, …)`. */
export type DefineElementHook<F = DefaultFixtures> = (
  fn: ElementHookFn<F>,
  options?: ElementHookOptions,
) => void;

/** The definition functions returned by `createNimaime(test)`. */
export interface NimaimeDefinitions<F = DefaultFixtures, W = DefaultWorkerFixtures> {
  defineScreen: DefineScreen<F>;
  defineElement: DefineElement<F>;
  defineCondition: DefineCondition<F>;
  /** Runs `fn` once per Screen `describe` and worker, before its tests (`test.beforeAll`). */
  beforeScreen: DefineScreenHook<W>;
  /** Runs `fn` once per Screen `describe` and worker, after its tests (`test.afterAll`). */
  afterScreen: DefineScreenHook<W>;
  /** Runs `fn` before every test of an Element (`test.beforeEach`). */
  beforeElement: DefineElementHook<F>;
  /** Runs `fn` after every test of an Element (`test.afterEach`). */
  afterElement: DefineElementHook<F>;
}
