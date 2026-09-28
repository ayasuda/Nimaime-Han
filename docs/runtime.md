# Runtime — `nimaime-han/runtime` and the `$nimaime` fixture

Generated specs (`.sanmaime-gen/**/*.spec.ts`) do not contain assertions of their own. They
describe _what_ to check as data — a **plan** — and hand it to the `$nimaime` fixture, which looks
up the [definitions](./definitions.md), drives the browser and asserts. This is the counterpart of
playwright-bdd's special fixtures (`$bddContext`, `$test`, …).

```text
.sanmaime  --nimaime-gen-->  .spec.ts (plans)  --Playwright-->  $nimaime.run(fixtures, plan)
                                                                   │  registry: defineScreen / defineElement / defineCondition
                                                                   └─ test.step('Show: Username') → expect(locator).toBeVisible()
```

## Exports

| Export                                                                     | What it is                                                                              |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `test`                                                                     | `@playwright/test`'s `test` extended with `$nimaime`                                    |
| `expect`                                                                   | re-export of `@playwright/test`'s `expect`                                              |
| `nimaimeFixtures`                                                          | `{ $nimaime: [fixture, { scope: 'test', box: true }] }` — for `anyTest.extend(…)`       |
| `createNimaimeTest(base)`                                                  | `base.extend(nimaimeFixtures)`, typed: keeps `base`'s custom fixtures                   |
| `Nimaime`, `NimaimeTestArgs`                                               | the fixture's type; `{ $nimaime: Nimaime }`                                             |
| `NimaimePlan`, `NimaimeExpectation`, `SanmaimePosition`, `ExpectationKind` | the plan emitted by the generator                                                       |
| `collectFixtureNames(plan)`                                                | the fixtures a plan's definitions destructure (for the generator)                       |
| `fixtureNamesOf(fn)`                                                       | the fixtures one callback destructures (`undefined` if it cannot be known)              |
| `validatePlan(plan)`                                                       | throws `NimaimeRuntimeError` if a name of the plan does not resolve                     |
| `NimaimeRuntimeError`                                                      | unresolvable name / fixture not provided                                                |
| `NimaimeExpectationError`                                                  | a failed expectation (`.sanmaime`: structured context, `.original`: Playwright error)   |
| `formatExpectationFailure(ctx, err)`                                       | builds the failure message (the single place to change its format, see #12)             |
| registry queries                                                           | `findScreen`, `findElement`, `findCondition`, `listDefinitions`, … (see definitions.md) |

## Why the fixtures are passed explicitly

Definition callbacks receive the test's fixtures (`page`, `context`, custom fixtures such as
`login`). A Playwright fixture cannot depend on "all fixtures", and Playwright only sets up the
fixtures that a test **destructures** (the test function's first parameter must be an object
pattern; `...rest` is rejected). So, as in playwright-bdd, the generated test destructures exactly
the fixtures its definitions use and passes them on:

```ts
test('…', async ({ $nimaime, page, login }) => {
  await $nimaime.run({ page, login }, plan);
});
```

The generator finds those names with `collectFixtureNames(plan)` after loading the definition
files. It reads the first parameter of each callback the plan runs (screen `open`, condition `fn`,
the element's `self` / target locators) the same way Playwright does. A callback whose first
parameter is not destructured (`(fixtures) => fixtures.page…`) is listed in `unknown`; the
generator should then warn and request a safe default (at least `page`).

At run time every callback receives a guarded view of the object: reading a fixture that was not
passed throws a `NimaimeRuntimeError` (`Condition "Logged in" uses the fixture "login", but the test
did not provide it…`) instead of failing with `undefined` inside user code.

## The `Nimaime` API

```ts
interface Nimaime {
  run(fixtures: object, plan: NimaimePlan): Promise<void>;
  screen(fixtures: object, screen: string, ctx?: ExpectationContext): Promise<void>;
  condition(fixtures: object, condition: string, ctx?: ExpectationContext): Promise<void>;
  expectShow(
    fixtures: object,
    element: string,
    target: string,
    ctx?: ExpectationContext,
  ): Promise<void>;
  expectHide(
    fixtures: object,
    element: string,
    target: string,
    ctx?: ExpectationContext,
  ): Promise<void>;
  expectEnable(fixtures: object, element: string, ctx?: ExpectationContext): Promise<void>;
  expectDisable(fixtures: object, element: string, ctx?: ExpectationContext): Promise<void>;
  check(
    fixtures: object,
    element: string,
    expectation: NimaimeExpectation,
    ctx?: ExpectationContext,
  ): Promise<void>;
}

interface ExpectationContext {
  screen?: string; // resolves screen-scoped conditions; shown in failures
  condition?: string; // shown in failures
  file?: string; // the .sanmaime file
  location?: SanmaimePosition; // the line of this action
}
```

`run` is what generated code calls; the other methods are its building blocks (and allow custom
flows, e.g. checking several elements after one condition).

| Sanmaime             | Runtime                                                    | Step title  |
| -------------------- | ---------------------------------------------------------- | ----------- |
| `Screen: X`          | `open(fixtures)` of `defineScreen('X')`, once per test     | `Screen: X` |
| `When: C`            | `fn(fixtures)` of `defineCondition('C')`, once per test    | `When: C`   |
| `Show: T` / `And: T` | `expect(target locator).toBeVisible()`                     | `Show: T`   |
| `Hide: T` / `And: T` | `expect(target locator).toBeHidden()`                      | `Hide: T`   |
| `Enable`             | `expect(self locator).toBeEnabled()` — the Element itself  | `Enable`    |
| `Disable`            | `expect(self locator).toBeDisabled()` — the Element itself | `Disable`   |

Step titles use the canonical English keywords (the AST keeps them canonical; `And:` is already
resolved to `Show` / `Hide` by the parser).

### `run(fixtures, plan)`

```ts
interface NimaimePlan {
  screen: string; // Screen: name
  element: string; // Element: name
  condition?: string; // When: name — omitted for the unconditional block (base state)
  expectations: readonly NimaimeExpectation[]; // in source order
  file?: string; // the .sanmaime file (relative: to the generated spec's directory)
  locations?: {
    screen?: SanmaimePosition;
    element?: SanmaimePosition;
    condition?: SanmaimePosition;
  };
}
interface NimaimeExpectation {
  kind: 'show' | 'hide' | 'enable' | 'disable';
  target?: string; // required for show / hide
  location?: SanmaimePosition;
}
interface SanmaimePosition {
  line: number; // 1-based
  column: number; // 1-based
}
```

Order of execution:

1. `validatePlan(plan)` — every name must resolve, or a `NimaimeRuntimeError` is thrown before
   the browser is touched. A missing **screen** definition is allowed (nothing is opened).
2. **Screen** — the screen's `open`, if any, once per test (the base state).
3. **Condition** — if `plan.condition` is set: the definition scoped to `plan.screen`, else the
   global one, once per test.
4. **Expectations** — in order, each in its own `test.step()`. The first failure stops the test.

One plan is one Sanmaime block: an Element's unconditional block (checked in the base state,
as required by [sanmaime.md §5.4](./sanmaime.md)) or one of its `When:` blocks.

### Step locations

When `plan.file` and a position are known, each step is created with
`test.step(title, body, { location })` at the `.sanmaime` line, so the trace viewer and the HTML
report point at the specification. A relative `file` is resolved against the directory of the
running spec file (`testInfo.file`); the generator emits the path of the `.sanmaime` file relative
to the generated `.spec.ts`.

## Failures

A failed assertion is rethrown as a `NimaimeExpectationError` whose message starts with a Sanmaime
header, followed by Playwright's own message:

```text
NimaimeExpectationError: Screen: Login
Element: Login Button
When: Input is invalid
Expected: Error message is hidden
Actual: shown
Location: specs/login.sanmaime:17

expect(locator).toBeHidden() failed

Locator:  getByTestId('error')
Expected: hidden
Received: visible
…
```

- `Expected` is `<target> is shown`, `<target> is hidden`, `enabled` or `disabled` (as in the
  README).
- `Actual` is observed after the failure without waiting: `shown` / `hidden` / `hidden (not found)`
  / `enabled` / `disabled` / `not found` / `N matching elements (expected exactly one)`, or
  `unknown` if the probe itself failed. The page may have changed after the assertion timed out;
  this is best effort.
- The `.sanmaime` line is added as the top stack frame (`at Hide: Error message
(/abs/specs/login.sanmaime:17:5)`), so Playwright reports the error at, and prints a code frame
  of, the specification line. The message shows `file:line` without a column on purpose:
  Playwright parses every line ending in `:line:column` — message lines included — as a stack
  frame.
- `error.sanmaime` holds the structured context (`ExpectationFailureContext`), `error.original`
  Playwright's error (not `cause`, which reporters would print a second time).

The message is built by `formatExpectationFailure(ctx, originalError)` in
`src/runtime/failure.ts`; the reporter work (#12) refines the format there.

## Errors

| Error                     | When                                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `NimaimeRuntimeError`     | missing element definition, target, `self` locator (for `Enable`/`Disable`) or condition; a fixture not passed |
| `NimaimeExpectationError` | an expectation did not hold                                                                                    |

Runtime errors name the Sanmaime names and, when known, the location (`Location: file:line`). They
are a safety net: the generator refuses to generate tests with unresolvable names.

## Generated code

`nimaime-gen` emits code of this shape (see [cli.md](./cli.md#generated-files) for the details):

```ts
// Generated by nimaime-gen from specs/login.sanmaime. Do not edit.
import { createNimaimeTest } from 'nimaime-han/runtime';
import { test as base } from '../../fixtures'; // importTestFrom (else: from '@playwright/test')
import '../../definitions/login'; // every file matched by `definitions`

const test = createNimaimeTest(base);
const file = '../../specs/login.sanmaime';

test.describe('Screen: Login', () => {
  test.describe('Element: Login Button', () => {
    test('Always', async ({ $nimaime, page }) => {
      await $nimaime.run(
        { page },
        {
          screen: 'Login',
          element: 'Login Button',
          expectations: [{ kind: 'disable', location: { line: 9, column: 5 } }],
          file,
          locations: { screen: { line: 1, column: 1 }, element: { line: 8, column: 3 } },
        },
      );
    });

    test('When: Input is invalid', async ({ $nimaime, page, login }) => {
      await $nimaime.run(
        { page, login },
        {
          screen: 'Login',
          element: 'Login Button',
          condition: 'Input is invalid',
          expectations: [
            { kind: 'disable', location: { line: 16, column: 5 } },
            { kind: 'show', target: 'Error message', location: { line: 17, column: 5 } },
          ],
          file,
          locations: {
            screen: { line: 1, column: 1 },
            element: { line: 8, column: 3 },
            condition: { line: 15, column: 5 },
          },
        },
      );
    });
  });
});
```

Without `importTestFrom`, the generated file extends `@playwright/test`'s `test` the same way
(which is what the `test` exported by `nimaime-han/runtime` is). `test/e2e/runtime/` contains
hand-written specs of this shape; `test/e2e/gen/` generates them with `nimaime-gen`.

## Not in v0

- Options (e.g. a Sanmaime-specific expect timeout): the default `expect` timeout of the Playwright
  config applies.
- Soft mode (checking all expectations of a block and reporting every failure).
- Checking unconditional expectations again in condition states (allowed by §5.4, not required).
- Hooks (`BeforeScreen`, …) and localized step titles.

## Testing the runtime

- Unit tests (`npm test`): resolution, fixture analysis, failure formatting and the orchestration
  of `run` with a fake driver (`createNimaimeRuntime(driver)`), in `test/runtime/`.
- End-to-end tests (`npm run test:e2e`): real Chromium, pages served with `page.setContent()`,
  in `test/e2e/` (config: `test/e2e/playwright.config.ts`). CI installs Chromium with
  `npx playwright install --with-deps chromium`. To use an already installed Chromium whose
  revision differs from the one Playwright expects, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
