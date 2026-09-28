# Example: with playwright-bdd

**Gherkin tests the journey. Sanmaime verifies the stops along the way.**

This example runs the Gherkin scenario of the main README's
[Relationship with Gherkin](../../README.md#relationship-with-gherkin) section with
[playwright-bdd](https://github.com/vitalets/playwright-bdd). Its `Then` step does not list what
the screen must show; it verifies the screen against its Sanmaime specification with
`$nimaime.verify()`.

```gherkin
Scenario: User views their own profile
  Given the user is logged in
  When the user opens their profile
  Then the user details screen is displayed
```

```ts
Then('the user details screen is displayed', async ({ $nimaime, page }) => {
  await $nimaime.verify({ page }, 'User Details', { when: 'Viewing your own profile' });
});
```

## Division of labour

| File                                                             | Says                                                   | Written in |
| ---------------------------------------------------------------- | ------------------------------------------------------ | ---------- |
| [`features/user-details.feature`](features/user-details.feature) | the journey: how the user reaches the screen           | Gherkin    |
| [`steps/user-details.steps.ts`](steps/user-details.steps.ts)     | how to perform each step; `Then` calls `verify()`      | TypeScript |
| [`specs/user-details.sanmaime`](specs/user-details.sanmaime)     | what the screen shows in each state (`When:` blocks)   | Sanmaime   |
| [`definitions/user-details.ts`](definitions/user-details.ts)     | where each Sanmaime name is on the page (locators)     | TypeScript |
| [`fixtures.ts`](fixtures.ts)                                     | playwright-bdd's `test` + `$nimaime`; loads the specs  | TypeScript |
| [`app/index.html`](app/index.html)                               | the app under test (a fake single page, no web server) | HTML       |

- The `Given` / `When` steps bring the page to a state. `verify()` does **not** open the screen
  and does **not** run condition definitions: the `when` option only names the state the page is
  already in, so that the matching `When:` blocks are checked (plus the element's unconditional
  expectations, which hold in every state).
- The Sanmaime file is loaded at run time (`loadSanmaimeSpecs()` in `fixtures.ts`), so this
  example does not use `nimaime-gen`. The same specs and element definitions can still be used to
  generate standalone screen tests with `nimaime-gen` (see [examples/basic](../basic)); that also
  needs `defineScreen` / `defineCondition`, which `verify()` does not use.
- A failure reads like any Sanmaime failure, under the Gherkin step:

  ```text
  › Then the user details screen of another user is displayed › Screen: User Details
    › Element: User Information › When: Viewing another user's profile › Hide: Email address

  NimaimeExpectationError: Screen: User Details
  Element: User Information
  When: Viewing another user's profile
  Expected: Email address is hidden
  Actual: shown (after 5000ms)
  Location: specs/user-details.sanmaime:14
  ```

## Combining the two `test`s

playwright-bdd's `createBdd(test)` needs a `test` extended from playwright-bdd's; Nimaime-Han adds
one fixture, `$nimaime`. Extend playwright-bdd's `test` with it (either form):

```ts
import { createNimaimeTest, nimaimeFixtures } from 'nimaime-han/runtime';
import { createBdd, test as base } from 'playwright-bdd';

export const test = base.extend(nimaimeFixtures);
// or, keeping your own fixtures typed: export const test = createNimaimeTest(base.extend<…>({ … }));

export const { Given, When, Then } = createBdd(test);
```

## Run it

Requirements: Node.js 22+.

1. **Build Nimaime-Han** (from the repository root):

   ```bash
   npm ci
   npm run build
   ```

2. **Install the example** (from `examples/with-playwright-bdd/`), and a browser for Playwright:

   ```bash
   cd examples/with-playwright-bdd
   npm ci
   npx playwright install chromium
   ```

   `.npmrc` sets `install-links=true`, so `nimaime-han` is installed as a copy of the package
   rather than a symlink to the repository (through a symlink it would load the repository's own
   `@playwright/test`, and Playwright refuses to run with two copies of itself). Run `npm ci` again
   after rebuilding Nimaime-Han. This is only needed because the example installs Nimaime-Han from
   this repository (`file:../..`); a project that installs `nimaime-han` from npm needs neither
   `.npmrc` nor the build step.

3. **Test**: `npm test` runs `bddgen` (features → `.features-gen/`) and `playwright test`.

   ```text
   ✓  1 [chromium] › .features-gen/features/user-details.feature.spec.js:6:3 › User details › User views their own profile
   ✓  2 [chromium] › .features-gen/features/user-details.feature.spec.js:12:3 › User details › User views another user's profile
   ```

From the repository root, `npm run test:example:bdd` does all of the above (except installing the
browser) and type-checks the example; CI runs it. To use an already installed Chromium, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable.

See [docs/with-gherkin.md](../../docs/with-gherkin.md) for the details of `verify()`, and the
[documentation index](../../docs/README.md) for everything else.
