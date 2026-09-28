import { loadSanmaimeSpecs, nimaimeFixtures } from 'nimaime-han/runtime';
import { createBdd, test as base } from 'playwright-bdd';

// $nimaime.verify() looks the expectations up by screen name: load the Sanmaime specs once per
// worker (paths relative to this file).
await loadSanmaimeSpecs('specs/**/*.sanmaime', { cwd: import.meta.dirname });

/** playwright-bdd's `test` with the `$nimaime` fixture (same as `createNimaimeTest(base)`). */
export const test = base.extend(nimaimeFixtures);

export const { Given, When, Then } = createBdd(test);
