# Using Sanmaime with Gherkin (playwright-bdd)

**Gherkin tests the journey. Sanmaime verifies the stops along the way.**

A Gherkin scenario brings the application to a state; a `Then` step then checks the screen. With
Nimaime-Han the `Then` step does not enumerate what the screen shows — it verifies the screen
against its Sanmaime specification:

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

```text
Screen: User Details

  Element: User Information
    Show: Username

    When: Viewing your own profile
    Show: Full name
    And: Email address
```

A complete, runnable project: [examples/with-playwright-bdd](../examples/with-playwright-bdd).

## Setup

### 1. Add `$nimaime` to playwright-bdd's `test`

`createBdd(test)` requires a `test` extended from playwright-bdd's. Extend it with Nimaime-Han's
fixture — both forms work, and custom fixtures keep their types:

```ts
// fixtures.ts
import { createNimaimeTest, loadSanmaimeSpecs, nimaimeFixtures } from 'nimaime-han/runtime';
import { createBdd, test as base } from 'playwright-bdd';

await loadSanmaimeSpecs('specs/**/*.sanmaime', { cwd: import.meta.dirname }); // see 2.

export const test = base.extend(nimaimeFixtures);
// or: export const test = createNimaimeTest(base.extend<{ user: string }>({ user: 'alice' }));

export const { Given, When, Then } = createBdd(test);
```

List this file in the `steps` option of `defineBddConfig` (playwright-bdd finds the `test` of the
scenarios there), together with the step files and the element definition files:

```ts
// playwright.config.ts
const testDir = defineBddConfig({
  features: 'features/**/*.feature',
  steps: ['fixtures.ts', 'steps/**/*.ts', 'definitions/**/*.ts'],
});
```

### 2. Load the Sanmaime specs

Generated specs (`nimaime-gen`) carry their expectations with them. `verify()` is called with a
screen name only, so the expectations must be available at run time: call `loadSanmaimeSpecs()`
once, e.g. at the top of the fixtures file (it runs once per worker; loading the same files again
is harmless).

```ts
loadSanmaimeSpecs(
  files: string | string[],   // paths or globs; '!pattern' excludes; node_modules is skipped
  options?: {
    cwd?: string;             // base of relative patterns (default: process.cwd())
    language?: string;        // default keyword language, like defineSanmaimeConfig's (default 'en')
  },
): Promise<ScreenSpec[]>
```

It reads and parses the files and registers every screen. It throws a `NimaimeRuntimeError` if no
file matches, or listing every diagnostic if a file is not valid Sanmaime (then nothing is
registered). Screen names must be unique across the loaded files (a `NimaimeDefinitionError`
otherwise).

Top-level `await` needs ESM (`"type": "module"` in `package.json`). In a CommonJS project, load the
specs from a worker-scoped fixture or a playwright-bdd `BeforeAll` hook instead.

To register expectations without `.sanmaime` files (e.g. from another source), use
`registerScreenSpec`:

```ts
registerScreenSpec({
  screen: 'User Details',
  file: '/abs/path/specs/user-details.sanmaime', // optional: step locations and failure messages
  elements: [
    {
      element: 'User Information',
      unconditional: [{ kind: 'show', target: 'Username' }],
      conditions: [
        {
          name: 'Viewing your own profile',
          expectations: [
            { kind: 'show', target: 'Full name' },
            { kind: 'show', target: 'Email address' },
          ],
        },
      ],
    },
  ],
});
```

`screenSpecsFromDocument(document, file?)` converts a parsed document (`nimaime-han/parser`) to
these objects; `findScreenSpec(name)`, `listScreenSpecs()` and `resetScreenSpecs()` query and
clear the registry.

### 3. Define the elements

`verify()` needs the [element definitions](./definitions.md) of the screen (the locators of every
target, and the element's own `self` locator for bare state keywords such as `Enable` or `Check`),
imported through the `steps` option. It does not need `defineScreen` or `defineCondition`.

```ts
// definitions/user-details.ts
import { createNimaime } from 'nimaime-han';
import { test } from '../fixtures';

const { defineElement } = createNimaime(test);

defineElement('User Information', {
  Username: ({ page }) => page.getByTestId('username'),
  'Full name': ({ page }) => page.getByTestId('full-name'),
  'Email address': ({ page }) => page.getByTestId('email'),
});
```

## `$nimaime.verify(fixtures, screen, options?)`

```ts
verify(
  fixtures: object,                    // the fixtures the definitions use, e.g. { page }
  screen: string,                      // Screen: name
  options?: {
    when?: string | string[];          // the When: state(s) the page is in
    elements?: string | string[];      // restrict to these Element: names (default: all)
  },
): Promise<void>
```

It checks the **current page**:

1. for every element of the screen (or of `elements`), in source order:
   - its **unconditional** expectations — invariants that hold in every state of the screen
     ([sanmaime.md §5.4](./sanmaime.md#54-unconditional-block));
   - for each name in `when`, the element's `When:` block of that name, if it has one;
2. each check in its own step, nested like this:

   ```text
   Then the user details screen is displayed
     Screen: User Details
       Element: User Information
         Show: Username
         When: Viewing your own profile
           Show: Full name
           Show: Email address
       Element: Edit Action
         When: Viewing your own profile
           Show: Edit button
   ```

   Steps are located at the `.sanmaime` lines (when the file is known), so the HTML report and the
   trace viewer point at the specification. `Screen:` and `When:` steps only group the checks here.

3. The first failed expectation throws a `NimaimeExpectationError` with the usual Sanmaime header
   (`Screen:` / `Element:` / `When:` / `Expected:` / `Actual:` / `Location:`, see
   [runtime.md](./runtime.md#failures)).

Before touching the browser it resolves every name and throws a `NimaimeRuntimeError`:

| Problem                                                 | Message (abridged)                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| unknown screen                                          | `No Sanmaime spec for "Screen: X". Loaded screens: "A", "B".` (or: no file is loaded)       |
| unknown element in `elements`                           | `Screen "X" has no element "E". Elements: …`                                                |
| a `when` name with no block (in the selected elements)  | `Screen "X" has no "When: C" block. Conditions: …`                                          |
| nothing to check (e.g. no invariants and no `when`)     | `Nothing to verify in Screen "X": … Pass the current state with { when: … }. Conditions: …` |
| missing element definition, target or `self` locator    | as for generated tests ([runtime.md](./runtime.md#errors))                                  |
| a definition reads a fixture that was not in `fixtures` | `… uses the fixture "login", but the test did not provide it.`                              |

### Passing the fixtures

As everywhere in the runtime, the fixtures are passed explicitly: Playwright only sets up the
fixtures a step function destructures. Destructure what the element definitions use and pass it
on:

```ts
Then('the order summary is displayed', async ({ $nimaime, page, currency }) => {
  await $nimaime.verify({ page, currency }, 'Order Summary', { when: 'Cart has items' });
});
```

### A generic step

One parameterised step can serve every screen:

```ts
Then(
  'the {string} screen is displayed as {string}',
  async ({ $nimaime, page }, screen: string, state: string) => {
    await $nimaime.verify({ page }, screen, { when: state });
  },
);
```

Screen-specific phrases (`Then the user details screen is displayed`) usually read better in
scenarios.

## What not to do

- **Do not expect `verify()` to navigate or set up state.** It never calls the screen's `open`
  nor any condition definition — the Gherkin steps are responsible for the journey. If the page is
  not in the named state, the check fails (and tells you which expectation did not hold).
- **Do not name a state the page is not in.** `when` selects which `When:` blocks apply; passing
  a condition whose steps were not performed turns correct pages into failures.
- **Do not restate the screen in the scenario.** `Then the username is displayed`,
  `And the full name is displayed`, … is exactly what the Sanmaime file already says; keep one
  canonical place for every fact.
- **Do not use `$nimaime.run()` from steps** unless you really want the screen reopened and the
  condition re-established: `run` is what generated screen tests use.

## Relationship with `nimaime-gen`

Both can be used on the same specs and definitions:

|                   | `nimaime-gen` (generated screen tests)         | `verify()` from Gherkin steps               |
| ----------------- | ---------------------------------------------- | ------------------------------------------- |
| Reaches the state | `defineScreen` `open` + `defineCondition`      | the scenario's `Given` / `When` steps       |
| Checks            | one element × one block per test               | the whole screen (selected blocks) per step |
| Specs loaded      | at generation time (baked into the spec files) | at run time (`loadSanmaimeSpecs`)           |
| Needs             | screen, element and condition definitions      | element definitions only                    |

---

See also: [examples/with-playwright-bdd](../examples/with-playwright-bdd) ·
[runtime.md](./runtime.md#verifyfixtures-screen-options) · [definitions.md](./definitions.md) ·
[api.md](./api.md#specs-at-run-time-loadsanmaimespecs-registerscreenspec) ·
[documentation index](./README.md)
