import type { PlaywrightTestArgs, TestInfo, TestType } from '@playwright/test';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { FixturesOf } from '../../src/index';
import {
  fixtureNamesOf,
  nimaimeFixtures,
  tagsFixtures,
  tagsOf,
  type NimaimeTestArgs,
} from '../../src/runtime/index';
import type { DefaultFixtures } from '../../src/runtime/types';

type FixtureTuple = [
  (args: object, use: (value: string[]) => Promise<void>, testInfo: TestInfo) => Promise<void>,
  { scope: string; box: boolean },
];

describe('$tags', () => {
  it('is a boxed test-scoped fixture, part of nimaimeFixtures', () => {
    expect(nimaimeFixtures.$tags).toBe(tagsFixtures.$tags);
    const [fn, options] = tagsFixtures.$tags as unknown as FixtureTuple;
    expect(options).toEqual({ scope: 'test', box: true });
    expect(fixtureNamesOf(fn)).toEqual([]);
  });

  it('provides testInfo.tags without duplicates', async () => {
    const [fn] = tagsFixtures.$tags as unknown as FixtureTuple;
    let provided: string[] | undefined;
    await fn(
      {},
      (value) => {
        provided = value;
        return Promise.resolve();
      },
      { tags: ['@smoke', '@login', '@smoke'] } as unknown as TestInfo,
    );
    expect(provided).toEqual(['@smoke', '@login']);
  });

  it('tagsOf() is empty when Playwright does not expose tags', () => {
    expect(tagsOf({})).toEqual([]);
    expect(tagsOf({ tags: [] })).toEqual([]);
  });

  it('is typed for tests and definitions', () => {
    expectTypeOf<NimaimeTestArgs['$tags']>().toEqualTypeOf<string[]>();
    expectTypeOf<DefaultFixtures['$tags']>().toEqualTypeOf<string[]>();
    type Custom = TestType<PlaywrightTestArgs & { login: string }, object>;
    expectTypeOf<FixturesOf<Custom>['$tags']>().toEqualTypeOf<string[]>();
  });
});
