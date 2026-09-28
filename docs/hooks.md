# Hooks — `beforeScreen` / `afterScreen` / `beforeElement` / `afterElement`

Hooks run code around the tests generated from `.sanmaime` files: seed data before a screen is
tested, log in before every test of an element, clean up afterwards. They are the counterpart of
playwright-bdd's `BeforeAll` / `AfterAll` / `Before` / `After`, and they are returned by
[`createNimaime(test)`](./definitions.md) together with the definition functions.

| Nimaime-Han     | Runs                                            | Generated as                              | Fixtures                  | playwright-bdd |
| --------------- | ----------------------------------------------- | ----------------------------------------- | ------------------------- | -------------- |
| `beforeScreen`  | once per `Screen:` and worker, before its tests | `test.beforeAll` in the Screen describe   | worker-scoped only        | `BeforeAll`    |
| `afterScreen`   | once per `Screen:` and worker, after its tests  | `test.afterAll` in the Screen describe    | worker-scoped only        | `AfterAll`     |
| `beforeElement` | before every test (block) of an `Element:`      | `test.beforeEach` in the Element describe | every fixture (`page`, …) | `Before`       |
| `afterElement`  | after every test (block) of an `Element:`       | `test.afterEach` in the Element describe  | every fixture (`page`, …) | `After`        |

```ts
// definitions/hooks.ts
import { createNimaime } from 'nimaime-han';
import { test } from '../fixtures'; // test.extend<{ login: … }, { db: … }>(…)

const { beforeScreen, afterScreen, beforeElement, afterElement } = createNimaime(test);

// Every screen: worker-scoped fixtures only (browser, custom worker fixtures).
beforeScreen(async ({ db }, { screen }) => {
  await db.seed(screen);
});

// Only `Screen: User Details`.
afterScreen(({ db }) => db.reset(), { screen: 'User Details' });

// Before every test of every element of `Screen: User Details`.
beforeElement(
  async ({ login }) => {
    await login('alice');
  },
  { screen: 'User Details' },
);

// After every test of `Element: Login Form`, in any screen.
afterElement(
  async ({ page }, { screen, element, condition }) => {
    await page.screenshot({ path: `shots/${screen}-${element}-${condition ?? 'always'}.png` });
  },
  { element: 'Login Form' },
);
```

## API

```ts
beforeScreen(fn: (fixtures: WorkerFixtures, info: { screen: string }) => unknown, options?: { screen?: string; tags?: string }): void;
afterScreen(fn: (fixtures: WorkerFixtures, info: { screen: string }) => unknown, options?: { screen?: string; tags?: string }): void;
beforeElement(fn: (fixtures: Fixtures, info: { screen: string; element: string; condition?: string }) => unknown, options?: { screen?: string; element?: string; tags?: string }): void;
afterElement(fn: (fixtures: Fixtures, info: { screen: string; element: string; condition?: string }) => unknown, options?: { screen?: string; element?: string; tags?: string }): void;
```

- `fn` may return a promise, which is awaited; its value is ignored.
- `info.screen` / `info.element` are the `Screen:` / `Element:` names; `info.condition` is the
  `When:` name of the block the test checks, absent for the element's unconditional block
  (`Always`).
- `WorkerFixtures` / `Fixtures` are the worker-scoped / all fixtures of the `test` passed to
  `createNimaime` (types `WorkerFixturesOf<T>` / `FixturesOf<T>`; by default Playwright's built-in
  ones). Using `page` in a screen hook is a type error.

## Scopes

Without options a hook is **global**: screen hooks run for every screen, element hooks for every
element of every screen.

| Options                                      | `beforeScreen` / `afterScreen` | `beforeElement` / `afterElement`         |
| -------------------------------------------- | ------------------------------ | ---------------------------------------- |
| none                                         | every screen                   | every element of every screen            |
| `{ screen: 'Login' }`                        | `Screen: Login`                | every element of `Screen: Login`         |
| `{ element: 'Login Form' }`                  | — (not allowed)                | `Element: Login Form` in every screen    |
| `{ screen: 'Login', element: 'Login Form' }` | — (not allowed)                | `Element: Login Form` in `Screen: Login` |

Names are compared after trimming surrounding whitespace, like Sanmaime names are matched to
definitions. A name that matches no screen or element simply never applies (it is not reported).

## Order

Hooks of one kind run one after the other:

- `before*`: global hooks first, then screen-scoped, then element-scoped, then hooks scoped to both
  a screen and an element; within a scope, in registration order (the order of the definition
  files, then of the calls).
- `after*`: the exact reverse (the most specific hook first, global hooks last).

A test of an element therefore runs:

```text
beforeScreen hooks (once per screen and worker)
  beforeElement hooks → Screen: open → When: condition → expectations → afterElement hooks
  … the next test of the screen …
afterScreen hooks (once per screen and worker)
```

`beforeScreen` / `afterScreen` follow Playwright's `beforeAll` / `afterAll` semantics: they run once
per Screen `describe` **per worker**. With `fullyParallel` the tests of a screen may be spread over
several workers, and each of those workers runs the screen hooks.

## Fixtures

Hooks receive the test's fixtures like definitions do. Playwright sets up only the fixtures a
hook function destructures, so `nimaime-gen` reads the first parameter of every hook that applies
(`({ page, login }, info) => …`) and makes the generated `test.beforeEach` destructure exactly those
names ([runtime.md](./runtime.md#why-the-fixtures-are-passed-explicitly)).

- **Screen hooks get worker-scoped fixtures only** (`browser`, `playwright`, custom fixtures with
  `{ scope: 'worker' }`). Playwright forbids test-scoped fixtures such as `page`, `context` or
  `request` in `beforeAll` / `afterAll`. Like playwright-bdd's `BeforeAll`, open a page yourself
  (`await browser.newPage()`) if a screen hook needs one.
- **Element hooks get every fixture**, the same `page` as the test.
- A hook whose first parameter is not destructured (`(fixtures) => …`) cannot be analysed:
  `nimaime-gen` warns and requests `browser` (screen hooks) or `page` (element hooks) for it.
- At run time a hook reading a fixture that was not requested fails with `The hook uses the
fixture "x", but the test did not provide it` instead of seeing `undefined`.

## Errors

A throwing hook fails with a `NimaimeHookError` whose message names the hook and its scope, followed
by the original message; `cause` is the original error and its stack frames are kept:

```text
NimaimeHookError: BeforeElement hook for Element "Login Form" failed: connect ECONNREFUSED 127.0.0.1:5432
```

`before*` hooks stop at the first failure (a failing `beforeEach` fails the test; a failing
`beforeAll` fails the screen's tests). `after*` hooks all run, since they usually clean up; the
first failure is thrown once they have finished.

## Steps

Each hook runs in a `test.step` titled `BeforeScreen: <screen>`, `AfterScreen: <screen>`,
`BeforeElement: <element>` or `AfterElement: <element>`, located at the hook's call in the
definition file, so traces and the HTML report show which hook ran. Playwright lists them under
"Before Hooks" / "After Hooks".

## Generated code

For a screen with hooks, `nimaime-gen` emits the Playwright hooks at the top of the describes and
imports `runHooks` from `nimaime-han/runtime` (only when a file uses hooks). With the hooks above
and `specs/user-details.sanmaime`:

```ts
// Generated by nimaime-gen from specs/user-details.sanmaime. Do not edit.
import { createNimaimeTest, runHooks } from 'nimaime-han/runtime';
import { test as base } from '../../fixtures';
import '../../definitions/hooks';
import '../../definitions/user-details';

const test = createNimaimeTest(base);
const file = '../../specs/user-details.sanmaime';

test.describe('Screen: User Details', () => {
  test.beforeAll(async ({ db }) => {
    await runHooks('beforeScreen', { db }, { screen: 'User Details' });
  });

  test.afterAll(async ({ db }) => {
    await runHooks('afterScreen', { db }, { screen: 'User Details' });
  });

  test.describe('Element: User Information', () => {
    test.beforeEach(async ({ login }) => {
      await runHooks(
        'beforeElement',
        { login },
        { screen: 'User Details', element: 'User Information' },
      );
    });

    test('When: Viewing your own profile', async ({ $nimaime, page }) => {
      await $nimaime.run({ page }, { screen: 'User Details', element: 'User Information', … });
    });
  });
});
```

Screens and elements without hooks get no Playwright hooks. The generator looks the hooks up with
`hooksFor(screen, element?)` from the registry after loading the definition files; add or remove a
hook, or change the fixtures it destructures, and run `nimaime-gen` again.

## Runtime: `runHooks(kind, fixtures, info)`

Exported from `nimaime-han/runtime`, called by the generated code; also usable from hand-written
specs:

```ts
test.beforeEach(async ({ page }) => {
  await runHooks('beforeElement', { page }, { screen: 'Login', element: 'Login Form' });
});
```

`kind` is `'beforeScreen' | 'afterScreen' | 'beforeElement' | 'afterElement'`. `info.screen` is
required, `info.element` too for element hooks. When `info` has no `condition` key, element hooks
receive the condition taken from the running test's title (`When: C` → `C`, as generated tests are
titled). `createHookRunner(driver)` builds the same function with another step driver (for unit
tests).

Registry queries (see [definitions.md](./definitions.md#registry-for-the-generator-and-the-runtime)):
`findHooks(kind, { screen, element? })` returns the matching hooks in execution order;
`hooksFor(screen, element?)` returns `{ before, after }` for a screen (screen hooks) or an element
of a screen (element hooks). `getRegistry().hooks` lists every hook (`HookDefinition { kind, fn,
screen, element, tags, source, test, customTest }`) in registration order.

## Duplicates

Any number of hooks may apply to the same scope. Registering the **same** hook again is ignored,
because Playwright may evaluate definition files more than once in a process: the same call site
evaluated again, or the same function with the same kind and options.

## Tags (not supported yet)

The options accept `tags` (a tag expression such as `'@smoke and not @slow'`, as in
playwright-bdd's `Before({ tags }, fn)`). It is validated as a string and stored on the hook, but
**not applied yet**: until tag expressions are supported (issues #15 / #17) a hook with `tags` runs
as if it had none.
