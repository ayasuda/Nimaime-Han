/**
 * The `$tags` fixture: the tags of the running test (docs/runtime.md, "`$tags`"), the counterpart
 * of playwright-bdd's `$tags`. Generated specs put the Sanmaime tags of a test (screen, element and
 * `When:` block, docs/sanmaime.md §5.8) on its `test.describe` / `test` calls, so Playwright's
 * `testInfo.tags` holds them; definitions destructure `$tags` to read them.
 */
import type { Fixtures, TestInfo } from '@playwright/test';

/** The fixture `nimaime-han/runtime` adds next to `$nimaime`. */
export interface NimaimeTagsTestArgs {
  /** Tags of the current test, e.g. `['@smoke', '@login']` (deduplicated, in order). */
  $tags: readonly string[];
}

/**
 * The tags of a test: `testInfo.tags` (Playwright ≥ 1.43) without duplicates, or `[]` when the
 * Playwright version does not expose them.
 */
export function tagsOf(testInfo: Partial<Pick<TestInfo, 'tags'>>): string[] {
  return [...new Set(testInfo.tags ?? [])];
}

/** `{ $tags: [fixture, { scope: 'test', box: true }] }`, part of `nimaimeFixtures`. */
export const tagsFixtures: Fixtures<NimaimeTagsTestArgs> = {
  $tags: [
    // Playwright requires an object destructuring pattern as the first parameter.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, testInfo) => {
      await use(tagsOf(testInfo));
    },
    { scope: 'test', box: true },
  ],
};
