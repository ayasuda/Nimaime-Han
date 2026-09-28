import {
  test as base,
  type PlaywrightTestArgs,
  type TestInfo,
  type TestType,
} from '@playwright/test';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  createNimaimeTest,
  expect as runtimeExpect,
  fixtureNamesOf,
  nimaimeFixtures,
  playwrightDriver,
  test,
  type Nimaime,
  type NimaimeTestArgs,
  type NimaimeTestType,
} from '../../src/runtime/index';

type FixtureTuple = [
  (args: object, use: (value: Nimaime) => Promise<void>, testInfo: TestInfo) => Promise<void>,
  { scope: string; box: boolean },
];

describe('nimaimeFixtures', () => {
  it('declares a boxed test-scoped $nimaime fixture', () => {
    const [fn, options] = nimaimeFixtures.$nimaime as unknown as FixtureTuple;
    expect(options).toEqual({ scope: 'test', box: true });
    // Playwright requires an object destructuring pattern as the first parameter.
    expect(fixtureNamesOf(fn)).toEqual([]);
    expect(fn.toString()).toMatch(/^async\s*\(\s*\{\s*\}\s*,/);
  });

  it('provides a Nimaime object to the test', async () => {
    const [fn] = nimaimeFixtures.$nimaime as unknown as FixtureTuple;
    let provided: Nimaime | undefined;
    await fn(
      {},
      (value) => {
        provided = value;
        return Promise.resolve();
      },
      { file: '/app/x.spec.ts' } as TestInfo,
    );
    expect(Object.keys(provided ?? {}).sort()).toEqual(
      [
        'check',
        'condition',
        'expectDisable',
        'expectEnable',
        'expectHide',
        'expectShow',
        'run',
        'screen',
        'verify',
      ].sort(),
    );
  });
});

describe('test / createNimaimeTest', () => {
  it('extends a Playwright test with $nimaime', () => {
    expect(test).toBeTypeOf('function');
    expect(typeof test.extend).toBe('function');
    expect(runtimeExpect).toBeTypeOf('function');
    const custom = base.extend<{ login: string }>({ login: 'alice' });
    const extended = createNimaimeTest(custom);
    expect(typeof extended.extend).toBe('function');
    expectTypeOf(extended).toHaveProperty('step');
  });

  it('keeps the custom fixtures in the type', () => {
    type Custom = TestType<PlaywrightTestArgs & { login: string }, object>;
    type Extended = NimaimeTestType<Custom>;
    type Args = Extended extends TestType<infer TestArgs, object> ? TestArgs : never;
    expectTypeOf<Args>().toHaveProperty('login');
    expectTypeOf<Args>().toHaveProperty('page');
    expectTypeOf<Args['$nimaime']>().toEqualTypeOf<NimaimeTestArgs['$nimaime']>();
  });

  it('builds a driver bound to the spec file', () => {
    expect(playwrightDriver({ file: '/app/x.spec.ts' }).specFile).toBe('/app/x.spec.ts');
    expect(playwrightDriver(undefined).specFile).toBeUndefined();
  });
});
