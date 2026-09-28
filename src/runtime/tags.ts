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
  // Mutable `string[]` (not readonly) so it can override playwright-bdd's own `$tags` fixture.
  $tags: string[];
}

/**
 * The tags of a test: `testInfo.tags` (Playwright ≥ 1.43) without duplicates, or `[]` when the
 * Playwright version does not expose them.
 */
export function tagsOf(testInfo: Partial<Pick<TestInfo, 'tags'>>): string[] {
  return [...new Set(testInfo.tags ?? [])];
}

/**
 * `{ $tags: [fixture, { scope: 'test', box: true }] }`, part of `nimaimeFixtures`.
 *
 * `$tags` is declared as an *override* of a parent that already has `$tags` (third type argument).
 * Playwright's `Fixtures<T>` widens a new fixture's options to `{ scope?: 'test' }`, but a test that
 * already has `$tags` (playwright-bdd's `test`) requires `{ scope: 'test' }`; the override form has
 * the required `scope`, which is assignable in both positions.
 */
export const tagsFixtures: Fixtures<NimaimeTagsTestArgs, object, NimaimeTagsTestArgs> = {
  $tags: [
    // Playwright requires an object destructuring pattern as the first parameter.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, testInfo) => {
      await use(tagsOf(testInfo));
    },
    { scope: 'test', box: true },
  ],
};
