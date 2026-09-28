/**
 * Runs the hooks registered with `beforeScreen` / `afterScreen` / `beforeElement` /
 * `afterElement` (docs/hooks.md). Generated specs call `runHooks` from `test.beforeAll` /
 * `test.afterAll` (screen hooks) and `test.beforeEach` / `test.afterEach` (element hooks).
 */
import { test as base } from '@playwright/test';
import { NimaimeHookError, NimaimeRuntimeError } from './errors';
import type { StepLocation } from './nimaime';
import { findHooks, type HookDefinition } from './registry';
import { guardFixtures } from './resolve';
import { formatSource } from './source';
import type { HookInfo, HookKind } from './types';

/** Step and error titles of the hook kinds (`BeforeScreen: Login`). */
export const HOOK_TITLES: Readonly<Record<HookKind, string>> = {
  beforeScreen: 'BeforeScreen',
  afterScreen: 'AfterScreen',
  beforeElement: 'BeforeElement',
  afterElement: 'AfterElement',
};

/** The prefix of the test title of a condition block (`When: Input is valid`). */
const WHEN_PREFIX = 'When: ';

/** What the hook runner needs from Playwright (injected so it can be unit-tested). */
export interface HookDriver {
  /** `test.step(title, body, { location })`. */
  step(title: string, body: () => Promise<void>, location: StepLocation | undefined): Promise<void>;
  /**
   * Title of the running test, if any. Element hooks take `info.condition` from a `When: C` title
   * when the caller does not pass it.
   */
  testTitle?(): string | undefined;
}

/** `runHooks(kind, fixtures, info)`. */
export type RunHooks = (kind: HookKind, fixtures: object, info: HookInfo) => Promise<void>;

function isElementKind(kind: HookKind): boolean {
  return kind === 'beforeElement' || kind === 'afterElement';
}

/** `BeforeElement hook for Element "Login Form"` / `BeforeScreen hook for Screen "Login"`. */
function hookLabel(kind: HookKind, info: HookInfo): string {
  return isElementKind(kind)
    ? `${HOOK_TITLES[kind]} hook for Element "${info.element ?? ''}"`
    : `${HOOK_TITLES[kind]} hook for Screen "${info.screen}"`;
}

function hookError(label: string, hook: HookDefinition, error: unknown): NimaimeHookError {
  const original = error instanceof Error ? error : new Error(String(error));
  const wrapped = new NimaimeHookError(`${label} failed: ${original.message}`, { cause: error });
  // Keep the frames of the original error: they point at the hook's code.
  const frames = (original.stack ?? '').split('\n').filter((line) => /^\s+at /.test(line));
  // Without frames (a thrown non-Error), point at where the hook was defined.
  if (frames.length === 0 && hook.source) frames.push(`    at ${formatSource(hook.source)}`);
  wrapped.stack = [`${wrapped.name}: ${wrapped.message}`, ...frames].join('\n');
  return wrapped;
}

function checkInfo(kind: HookKind, info: HookInfo): void {
  if (typeof info !== 'object' || typeof info.screen !== 'string') {
    throw new NimaimeRuntimeError(`runHooks('${kind}'): info.screen must be a Screen name.`);
  }
  if (isElementKind(kind) && typeof info.element !== 'string') {
    throw new NimaimeRuntimeError(`runHooks('${kind}'): info.element must be an Element name.`);
  }
}

/**
 * Creates `runHooks` for `driver`. `runHooks(kind, fixtures, info)` runs the hooks of `kind` that
 * apply to `info.screen` (and `info.element`) in execution order (see `findHooks`), each in a step
 * titled `BeforeScreen: <screen>` / `AfterScreen: <screen>` / `BeforeElement: <element>` /
 * `AfterElement: <element>` located at the hook's definition.
 *
 * Every hook receives a guarded view of `fixtures` and an info object: `{ screen }` for screen
 * hooks, `{ screen, element, condition? }` for element hooks. A throwing hook fails with a
 * `NimaimeHookError` (`BeforeElement hook for Element "X" failed: …`). `before*` hooks stop at the
 * first failure; `after*` hooks all run (they clean up), and the first failure is thrown at the end.
 */
export function createHookRunner(driver: HookDriver): RunHooks {
  return async (kind, fixtures, info) => {
    checkInfo(kind, info);
    const hooks = findHooks(kind, { screen: info.screen, element: info.element });
    if (hooks.length === 0) return;

    let hookInfo: HookInfo;
    if (isElementKind(kind)) {
      let condition = info.condition;
      if (!('condition' in info)) {
        const title = driver.testTitle?.();
        if (title?.startsWith(WHEN_PREFIX)) condition = title.slice(WHEN_PREFIX.length);
      }
      hookInfo = {
        screen: info.screen,
        element: info.element ?? '',
        ...(condition === undefined ? {} : { condition }),
      };
    } else {
      hookInfo = { screen: info.screen };
    }

    const label = hookLabel(kind, info);
    const title = `${HOOK_TITLES[kind]}: ${isElementKind(kind) ? (info.element ?? '') : info.screen}`;
    const cleanup = kind.startsWith('after');
    let firstError: unknown;
    let failed = false;
    for (const hook of hooks) {
      try {
        await driver.step(
          title,
          async () => {
            try {
              await hook.fn(guardFixtures(fixtures, 'The hook'), { ...hookInfo });
            } catch (error) {
              throw hookError(label, hook, error);
            }
          },
          hook.source,
        );
      } catch (error) {
        if (!cleanup) throw error;
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    }
    if (failed) throw firstError;
  };
}

/** The Playwright driver of the hook runner (`test.step`, `test.info().title`). */
export const playwrightHookDriver: HookDriver = {
  async step(title, body, location) {
    await base.step(title, body, location ? { location } : {});
  },
  testTitle() {
    try {
      return base.info().title;
    } catch {
      return undefined;
    }
  },
};

/**
 * Runs the hooks of `kind` for `info` (see `createHookRunner`). Generated specs call it from
 * `test.beforeAll` / `test.afterAll` (`beforeScreen` / `afterScreen`, worker-scoped fixtures) and
 * `test.beforeEach` / `test.afterEach` (`beforeElement` / `afterElement`, test fixtures):
 *
 * ```ts
 * test.beforeEach(async ({ page }) => {
 *   await runHooks('beforeElement', { page }, { screen: 'Login', element: 'Login Form' });
 * });
 * ```
 */
export const runHooks: RunHooks = createHookRunner(playwrightHookDriver);
