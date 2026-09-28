import {
  expect,
  test as base,
  type Fixtures,
  type Locator,
  type TestInfo,
  type TestType,
} from '@playwright/test';
import { probeActual } from './failure';
import { createNimaimeRuntime, type Nimaime, type NimaimeDriver } from './nimaime';
import type { ExpectationKind } from './plan';
import { tagsFixtures, type NimaimeTagsTestArgs } from './tags';
import type { AnyTestType } from './types';

/** The fixtures `nimaime-han/runtime` adds to a Playwright `test` (`$nimaime` and `$tags`). */
export interface NimaimeTestArgs extends NimaimeTagsTestArgs {
  /** Executes Sanmaime (screens, conditions, expectations); one instance per test. */
  $nimaime: Nimaime;
}

/** A `test` type extended with `$nimaime`. */
export type NimaimeTestType<T extends AnyTestType> =
  T extends TestType<infer TestArgs, infer WorkerArgs>
    ? TestType<TestArgs & NimaimeTestArgs, WorkerArgs>
    : never;

async function assertLocator(kind: ExpectationKind, locator: Locator): Promise<void> {
  switch (kind) {
    case 'show':
      await expect(locator).toBeVisible();
      return;
    case 'hide':
      await expect(locator).toBeHidden();
      return;
    case 'enable':
      await expect(locator).toBeEnabled();
      return;
    case 'disable':
      await expect(locator).toBeDisabled();
      return;
  }
}

/** The Playwright driver of the runtime (`test.step` + web-first assertions). */
export function playwrightDriver(testInfo: Pick<TestInfo, 'file'> | undefined): NimaimeDriver {
  return {
    async step(title, body, location) {
      await base.step(title, body, location ? { location } : {});
    },
    assert: assertLocator,
    probe: probeActual,
    specFile: testInfo?.file,
  };
}

/**
 * The fixtures to add to any `test` with `test.extend(nimaimeFixtures)`:
 * `{ $nimaime: [fixture, { scope: 'test', box: true }] }`.
 */
export const nimaimeFixtures: Fixtures<NimaimeTestArgs, object, NimaimeTagsTestArgs> = {
  $nimaime: [
    // Playwright requires an object destructuring pattern as the first parameter.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, testInfo) => {
      await use(createNimaimeRuntime(playwrightDriver(testInfo)));
    },
    { scope: 'test', box: true },
  ],
  ...tagsFixtures,
};

/**
 * Adds `$nimaime` to `base` — typically the custom `test` of the `importTestFrom` option, so that
 * its fixtures reach the definitions. Generated specs do `createNimaimeTest(customTest)`.
 */
export function createNimaimeTest<T extends AnyTestType>(base: T): NimaimeTestType<T> {
  return base.extend<NimaimeTestArgs>(nimaimeFixtures) as NimaimeTestType<T>;
}

/** `@playwright/test`'s `test` with the `$nimaime` fixture. */
export const test = base.extend<NimaimeTestArgs>(nimaimeFixtures);

export { expect };
