import { NimaimeDefinitionError } from './errors';
import { registerCondition, registerElement, registerScreen } from './registry';
import { captureSource } from './source';
import type {
  AnyFixtures,
  AnyTestType,
  ConditionFn,
  ConditionOptions,
  DefaultTestType,
  DefineCondition,
  DefineElement,
  DefineScreen,
  ElementTargets,
  FixturesOf,
  LocatorFn,
  NimaimeDefinitions,
  OpenScreenFn,
  ScreenOptions,
} from './types';

/**
 * Creates the definition functions bound to a Playwright `test` — the Nimaime-Han counterpart of
 * playwright-bdd's `createBdd(test)`.
 *
 * Pass a `test` extended with custom fixtures (`base.extend<{ login: ... }>(...)`) to receive those
 * fixtures, fully typed, in every callback. Without `test`, callbacks receive the built-in
 * Playwright fixtures (`page`, `context`, `request`, `baseURL`, ...).
 *
 * ```ts
 * const { defineScreen, defineElement, defineCondition } = createNimaime(test);
 *
 * defineScreen('User Details', { open: ({ page }) => page.goto('/users/me') });
 * defineElement('User Information', {
 *   Username: ({ page }) => page.getByTestId('username'),
 * });
 * defineCondition("Viewing another user's profile", async ({ page }) => {
 *   await page.goto('/users/42');
 * });
 * ```
 */
export function createNimaime<T extends AnyTestType = DefaultTestType>(
  test?: T,
): NimaimeDefinitions<FixturesOf<T>> {
  if (test !== undefined && !isTestType(test)) {
    throw new NimaimeDefinitionError(
      'createNimaime(test): expected a Playwright `test` (from @playwright/test or test.extend()).',
    );
  }
  const base = { test, customTest: test !== undefined };

  const defineScreen: DefineScreen<AnyFixtures> = (name, options?: ScreenOptions<AnyFixtures>) => {
    const source = captureSource(defineScreen);
    checkName('defineScreen', 'screen', name);
    if (options !== undefined && !isPlainObject(options)) {
      throw new NimaimeDefinitionError(
        `defineScreen("${name}"): the second argument must be an object like { open }.`,
      );
    }
    const open: unknown = options?.open;
    if (open !== undefined && typeof open !== 'function') {
      throw new NimaimeDefinitionError(`defineScreen("${name}"): \`open\` must be a function.`);
    }
    registerScreen({ ...base, name, source, open: open as OpenScreenFn<AnyFixtures> | undefined });
  };

  const defineElement = ((
    name: string,
    selfOrTargets: LocatorFn<AnyFixtures> | ElementTargets<AnyFixtures>,
    maybeTargets?: ElementTargets<AnyFixtures>,
  ) => {
    const source = captureSource(defineElement);
    checkName('defineElement', 'element', name);
    let self: LocatorFn<AnyFixtures> | undefined;
    let targets: unknown;
    if (typeof selfOrTargets === 'function') {
      self = selfOrTargets;
      targets = maybeTargets ?? {};
    } else {
      if (maybeTargets !== undefined) {
        throw new NimaimeDefinitionError(
          `defineElement("${name}"): expected (name, targets) or (name, self, targets?).`,
        );
      }
      targets = selfOrTargets;
    }
    const targetMap = toTargetMap(name, targets);
    if (!self && targetMap.size === 0) {
      throw new NimaimeDefinitionError(
        `defineElement("${name}"): define at least one target locator or a locator for the element itself.`,
      );
    }
    registerElement({ ...base, name, source, self, targets: targetMap });
  }) as DefineElement<AnyFixtures>;

  const defineCondition: DefineCondition<AnyFixtures> = (
    name,
    fn: ConditionFn<AnyFixtures>,
    options?: ConditionOptions,
  ) => {
    const source = captureSource(defineCondition);
    checkName('defineCondition', 'condition', name);
    if (typeof fn !== 'function') {
      throw new NimaimeDefinitionError(
        `defineCondition("${name}"): the second argument must be a function.`,
      );
    }
    if (options !== undefined && !isPlainObject(options)) {
      throw new NimaimeDefinitionError(
        `defineCondition("${name}"): the third argument must be an object like { screen }.`,
      );
    }
    const screen = options?.screen;
    if (screen !== undefined) checkName(`defineCondition("${name}")`, 'screen', screen);
    registerCondition({ ...base, name, source, fn, screen });
  };

  const definitions: NimaimeDefinitions<AnyFixtures> = {
    defineScreen,
    defineElement,
    defineCondition,
  };
  // Callbacks are stored with their fixture type erased; the typed view is what users see.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return definitions;
}

function isTestType(value: unknown): boolean {
  return (
    typeof value === 'function' && typeof (value as { extend?: unknown }).extend === 'function'
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkName(fnName: string, what: string, name: unknown): asserts name is string {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new NimaimeDefinitionError(`${fnName}: the ${what} name must be a non-empty string.`);
  }
}

function toTargetMap(element: string, targets: unknown): Map<string, LocatorFn<AnyFixtures>> {
  if (!isPlainObject(targets)) {
    throw new NimaimeDefinitionError(
      `defineElement("${element}"): targets must be an object mapping target names to locator functions.`,
    );
  }
  const map = new Map<string, LocatorFn<AnyFixtures>>();
  for (const [target, fn] of Object.entries(targets)) {
    checkName(`defineElement("${element}")`, 'target', target);
    if (typeof fn !== 'function') {
      throw new NimaimeDefinitionError(
        `defineElement("${element}"): the locator for target "${target}" must be a function.`,
      );
    }
    map.set(target, fn as LocatorFn<AnyFixtures>);
  }
  return map;
}
