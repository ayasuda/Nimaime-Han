# Definitions — `createNimaime(test)`

A `.sanmaime` file contains no selectors and no code. Its names — `Screen:`, `Element:`, the
targets of `Show:` / `Hide:` and the conditions of `When:` — are bound to the application by
TypeScript **definitions**, the same way playwright-bdd binds Gherkin steps to step definitions
created with `createBdd(test)`.

| Sanmaime                       | Definition API                                  | playwright-bdd counterpart      |
| ------------------------------ | ----------------------------------------------- | ------------------------------- |
| `Screen: X`                    | `defineScreen('X', { open })`                   | — (a Feature has no definition) |
| `Show:` / `Hide:` targets of X | `defineElement('X', { name: locator })`         | step definitions                |
| `Enable` / `Disable` of X      | `defineElement('X', self, { name: locator }?)`  | step definitions                |
| `When: X`                      | `defineCondition('X', async ({ page }) => {…})` | `Given` steps                   |

Definition files are the files matched by the `definitions` option of
[`defineSanmaimeConfig()`](./config.md).

```ts
// definitions/user-details.ts
import { createNimaime } from 'nimaime-han';
import { test } from './fixtures'; // optional: a test made with test.extend()

const { defineScreen, defineElement, defineCondition } = createNimaime(test);

defineScreen('User Details', {
  open: ({ page }) => page.goto('/users/me'),
});

defineElement('User Information', {
  Username: ({ page }) => page.getByTestId('username'),
  'Full name': ({ page }) => page.getByTestId('real-name'),
  'Email address': ({ page }) => page.getByTestId('email'),
});

defineElement('Login Button', ({ page }) => page.getByRole('button', { name: 'Log in' }));

defineCondition('Viewing your own profile', async ({ login }) => {
  await login('alice');
});

defineCondition(
  'Input is invalid',
  async ({ page }) => {
    await page.getByLabel('Email').fill('not-an-email');
  },
  { screen: 'Login' },
);
```

## `createNimaime(test?)`

```ts
function createNimaime<T extends TestType<any, any> = typeof test /* from @playwright/test */>(
  test?: T,
): NimaimeDefinitions<FixturesOf<T>>;
```

Returns `{ defineScreen, defineElement, defineCondition }`. Every callback receives the **fixtures**
of a test as its only argument:

- Without `test`: the built-in Playwright fixtures (`page`, `context`, `browser`, `request`,
  `baseURL`, … — `PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs &
PlaywrightWorkerOptions`).
- With a `test` made by `test.extend<TestFixtures, WorkerFixtures>()`: its test- and worker-scoped
  fixtures, fully typed, exactly like playwright-bdd's `createBdd(test)`. Use the same `test` as the
  `importTestFrom` config option, so that the generated specs provide those fixtures at run time.

`createNimaime` may be called any number of times (e.g. once per definition file); all calls feed
the same registry. The `test` is stored on every definition, together with a `customTest` flag.

## `defineScreen(name, { open? })`

Binds `Screen: <name>`. `open(fixtures)` navigates to the screen, i.e. establishes its _base state_
([sanmaime.md §5.4](./sanmaime.md)). It is optional (e.g. when a `BeforeScreen` hook or a condition
does the navigation). Its type is `(fixtures) => unknown`: a returned promise is awaited and its
value ignored, so `open: ({ page }) => page.goto('/users/me')` works as is.

## `defineElement(name, targets)` / `defineElement(name, self, targets?)`

Binds `Element: <name>`.

- `targets` maps the target names used in `Show:` / `Hide:` / `And:` to locator functions
  `(fixtures) => Locator`. Target names are the exact names written in Sanmaime.
- `self` locates the Element itself. `Enable` and `Disable` apply to the Element itself
  ([sanmaime.md §5](./sanmaime.md)), so an Element that uses them needs the second form.

At least one of `self` or a target must be given. Locator functions are synchronous and only build
a Playwright `Locator`; they must not perform actions.

**Scope:** element definitions are global by name — an Element name is expected to identify the
same part of the UI wherever it is used. A `{ screen }` option (as for conditions) may be added
later if screen-specific elements with the same name turn out to be needed.

## `defineCondition(name, fn, { screen? })`

Binds `When: <name>`. `fn(fixtures)` establishes the state named by the condition (log in as
another user, fill in invalid input, …), starting from the base state reached by the screen's `open`.
Like `open`, its type is `(fixtures) => unknown`: a returned promise is awaited, its value ignored.

**Scope and lookup:**

- Without `screen` the condition is **global**: it applies to `When: <name>` in every screen.
- With `{ screen: 'Login' }` it applies only inside `Screen: Login`.
- At run time the definition scoped to the current screen wins; otherwise the global one is used.
  A global and several screen-scoped definitions of the same name can coexist.
- The same `When:` name in several Elements of one screen denotes the **same** condition
  ([sanmaime.md §5.3](./sanmaime.md)), so it resolves to the same definition.

## Duplicates

Defining the same screen name twice, the same element name twice, or the same condition name twice
**in the same scope** throws a `NimaimeDefinitionError` naming both source locations:

```text
NimaimeDefinitionError: Duplicate element definition "User Information".
  First defined at /app/definitions/users.ts:12:1
  Defined again at /app/definitions/profile.ts:4:1
```

A re-registration that is **equivalent** is ignored instead, because Playwright may evaluate
definition files more than once in a process. A definition is equivalent to the registered one when

- it was made at the same source location (the same call site evaluated again), or
- it uses the same function objects (the same `open`; the same `self` and the same target names
  mapped to the same functions; the same condition `fn` in the same scope).

The first registration is kept.

## Source locations

Each definition records `source: { file, line, column }` — the call site of `defineScreen` /
`defineElement` / `defineCondition` — taken from the call stack at definition time (like
playwright-bdd). The stack string is used, so source maps installed by Playwright's TypeScript
loader are honoured and locations point at the `.ts` file. `source` is `undefined` if the stack
cannot be parsed.

## Registry (for the generator and the runtime)

The registry is a process-wide singleton. It is stored on `globalThis` under
`Symbol.for('nimaime-han.registry')`, so that the main entry and `nimaime-han/runtime` — which are
bundled separately, in both ESM and CJS builds — share one registry. It is queried through
`nimaime-han/runtime`:

| Function                          | Returns                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| `findScreen(name)`                | `ScreenDefinition \| undefined` — `{ name, open, source, test, customTest }`                |
| `findElement(name)`               | `ElementDefinition \| undefined` — `{ name, self, targets: Map, source, … }`                |
| `findCondition(name, { screen })` | `ConditionDefinition \| undefined` — screen-scoped first, then global                       |
| `listDefinitions()`               | `{ screens, elements, conditions }` — every definition (e.g. for unused-definition reports) |
| `getRegistry()`                   | the raw maps (`screens`, `elements`, `conditions` keyed by name, then scope)                |
| `resetRegistry()`                 | removes every definition (for tests)                                                        |

Stored callbacks have their fixture type erased; the runtime calls them with the fixtures object of
the running test.
