# CLI — `nimaime-gen`

`nimaime-gen` turns `.sanmaime` specifications into Playwright test files, the way playwright-bdd's
`bddgen` turns `.feature` files into `.spec.js` files. Playwright then runs the generated files:

```bash
npx nimaime-gen && npx playwright test
```

It reads the Playwright config, and for every configuration registered with
[`defineSanmaimeConfig()`](./config.md):

1. expands the `specs` and `definitions` globs;
2. loads the [definition files](./definitions.md) (with Playwright's TypeScript loader);
3. parses the `.sanmaime` files ([sanmaime.md](./sanmaime.md));
4. matches every Screen / Element / target / condition name to a definition;
5. reports problems, with [definition snippets](#missing-definitions-and-snippets) for missing
   definitions — if there is any error, **nothing is written** for that configuration;
6. otherwise removes the previously generated files from `outputDir` and writes the new ones.

With [`--allow-missing`](#--allow-missing), missing definitions are warnings: the tests that use
them are left out and the others are generated.

## Commands

| Command                | What it does                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `nimaime-gen`          | Same as `nimaime-gen generate`.                                                                               |
| `nimaime-gen generate` | Generates the spec files into each `outputDir`.                                                               |
| `nimaime-gen export`   | Prints the tests that would be generated (`Screen: X > Element: Y > When: Z`), per spec file. Writes nothing. |
| `nimaime-gen check`    | Does everything `generate` does except writing: reports problems and exits with 1 if there are any. For CI.   |

`export` output:

```text
specs/login.sanmaime
  Screen: Login > Element: Login Form > Always
  Screen: Login > Element: Login Button > When: Input is valid
  Screen: Login > Element: Login Button > When: Input is invalid
3 tests in 1 spec file.
```

## Options

| Option                | Description                                                                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-c, --config <path>` | The Playwright config file, or a directory containing one, relative to the current directory. Default: `playwright.config.{ts,js,mts,mjs,cts,cjs}` in the current directory (the same lookup as `playwright test -c`).                                  |
| `--allow-missing`     | Reports missing definitions as warnings instead of errors and generates every test that does not use one; see [below](#--allow-missing).                                                                                                                |
| `--format <name>`     | How problems are printed: `pretty` (default: counted blocks and definition snippets) or `compact` (one `file:line:column: severity: message` line per problem, for editors and problem matchers).                                                       |
| `--verbose`           | Also prints: the number of spec and definition files, screens without `defineScreen`, unused definitions, every generated file, files kept in `outputDir`, and stack traces of errors. The `verbose` config option does the same for one configuration. |
| `-h, --help`          | Prints the help.                                                                                                                                                                                                                                        |
| `-v, --version`       | Prints the version.                                                                                                                                                                                                                                     |

`--watch` is not available yet: a changed definition file cannot be re-evaluated in the same
process ([definitions.md](./definitions.md#definition-loading-and-matching)), so a watch mode has
to regenerate in a child process. It is left for a later version.

## Output and exit codes

Normal output (the summary, the `export` list) goes to stdout; problems go to stderr, with paths
relative to the current directory. By default (`--format pretty`) parser diagnostics and missing
definitions are printed as counted blocks, sorted by file and position, followed by the
[definition snippets](#missing-definitions-and-snippets):

```text
Syntax errors: 1

  specs/login.sanmaime:7:5
    SANMAIME_E007: 'And:' must follow 'Show:', 'Hide:' or 'And:' in the same block.

Missing definitions: 2

  specs/user-details.sanmaime:4:5
    Condition "Viewing your own profile" is not defined

  specs/user-details.sanmaime:6:5
    Element "User Information" has no definition for "Full name"

Snippets:

// import { createNimaime } from 'nimaime-han';
// const { defineElement, defineCondition } = createNimaime(test);

// Add to the existing defineElement('User Information', { … }):
  'Full name': ({ page }) => page.getByTestId('TODO'),

// Used on Screen "User Details" (add { screen: 'User Details' } to define it for that screen only).
defineCondition('Viewing your own profile', async ({ page }) => {
  // TODO: bring the screen into this state
});

nimaime-gen: nothing was generated into .sanmaime-gen (3 errors).
```

The messages of missing definitions:

| Message                                                             | Missing                                                                      |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `Element "X" is not defined`                                        | `defineElement('X', …)`                                                      |
| `Element "X" has no definition for "Y"`                             | the target `Y` in the existing `defineElement('X', { … })`                   |
| `Element "X" has no self locator (needed by Enable/Disable)`        | the element's own locator: `defineElement('X', self, targets)`               |
| `Condition "C" is not defined`                                      | `defineCondition('C', …)` (global, or for the screen)                        |
| `Screen "S" is not defined (optional: without defineScreen …)` (\*) | `defineScreen('S', …)`; allowed, the screen is just not opened (information) |

(\*) Only with `--verbose`.

`--format compact` prints one editor/problem-matcher friendly line per problem instead, and no
snippets:

```text
specs/login.sanmaime:7:5: error SANMAIME_E007: 'And:' must follow 'Show:', 'Hide:' or 'And:' in the same block.
specs/login.sanmaime:8:3: error: Element "Login Button" of Screen "Login" has no definition (defineElement).
specs/login.sanmaime:9:5: error: Element "Login Form" has no definition for target "Remember me".
specs/login.sanmaime:12:5: error: Condition "When: Input is valid" (Screen "Login", Element "Login Button") has no definition (defineCondition).
nimaime-gen: nothing was generated into .sanmaime-gen (4 errors).
```

| Exit code | Meaning                                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0`       | Success (warnings do not change the exit code). With `--allow-missing`, also when definitions are missing.                                                                     |
| `1`       | Spec or definition errors: parser errors, missing definitions (unless `--allow-missing`), a definition file that fails to load (or an unexpected error, with its stack).       |
| `2`       | Usage or configuration errors: unknown command, option or `--format`, Playwright config not found, invalid `defineSanmaimeConfig()` options, no `defineSanmaimeConfig()` call. |

What is an error, a warning or information:

| Problem                                                                     | Severity                                         |
| --------------------------------------------------------------------------- | ------------------------------------------------ |
| parser diagnostic (`SANMAIME_Ennn`)                                         | error                                            |
| missing element, target, `self` locator (for `Enable`/`Disable`), condition | error (warning with `--allow-missing`)           |
| definition file that throws while loading (incl. duplicate definitions)     | error (message only; the stack with `--verbose`) |
| no `.sanmaime` file matches `specs`                                         | warning (an empty `outputDir` is still produced) |
| a callback whose fixtures cannot be determined (see below)                  | warning                                          |
| a `Screen:` without `defineScreen` (it is simply not opened)                | info, shown with `--verbose`                     |
| unused definitions                                                          | warning, shown with `--verbose`                  |

With several configurations (Playwright projects), each one is processed independently: one with
errors writes nothing, the others are still generated, and the exit code is 1.

## Missing definitions and snippets

Like playwright-bdd's snippets for undefined steps, the `pretty` report ends with TypeScript to
paste into a [definition file](./definitions.md) (in the configuration's `quotes` style). Locators
are `page.getByTestId('TODO')` placeholders; replace them with real locators.

- **An element that is not defined** gets a whole `defineElement()` with every target the specs
  use with it (in all spec files). If the specs use `Enable` / `Disable` on it, the snippet has a
  `self` locator: `defineElement('X', ({ page }) => …, { … })`, or `defineElement('X', ({ page }) => …)`
  when there are no targets.
- **An element that is defined but lacks targets** gets a comment
  `// Add to the existing defineElement('X', { … }):` followed by just the target lines, to paste
  into the existing object.
- **An element that is defined but lacks its `self` locator** gets a comment showing how to pass
  one as the second argument of the existing `defineElement()`.
- **A condition** gets one global `defineCondition('C', async ({ page }) => { … })`. A comment
  names the screens that use it; add `{ screen: 'S' }` to define it for one screen only
  ([definitions.md](./definitions.md)).
- **A screen** without `defineScreen` is allowed, so its `defineScreen('S', { open })` snippet is
  printed only with `--verbose`.

Every element, target, condition and screen appears once, however many specs use it. The first
two lines are a commented-out reminder of where the `defineXxx` functions come from
(`createNimaime(test)`, [definitions.md](./definitions.md)), naming only the functions the snippets
use.

## `--allow-missing`

While writing specifications before their definitions, `--allow-missing` lets you generate and run
what is already defined:

- missing definitions are reported (with snippets) as warnings, and the exit code is 0;
- every **test** (block) that uses a missing definition is left out; the other tests are
  generated. A block uses a definition when it is the element, its condition (`When:`), one of its
  targets, or the element's `self` locator for `Enable` / `Disable`. An element or screen left
  without tests is left out, and a spec file left without tests gets no generated file;
- the left-out tests are listed on stderr:

```text
nimaime-gen: --allow-missing: 2 tests that use missing definitions are not generated:
  specs/user-details.sanmaime: Screen: User Details > Element: User Information > When: Viewing your own profile
  specs/user-details.sanmaime: Screen: User Details > Element: Edit Button > Always
```

Left-out tests are not generated as `test.skip()` / `test.fixme()` on purpose: a skipped test has
no definition to call, would appear in reports as if it were part of the suite, and would still
need the missing names in its plan. Leaving them out keeps the generated files exactly what a run
without `--allow-missing` generates once the definitions exist. Parser errors (`SANMAIME_Ennn`)
and definition files that fail to load are still errors: nothing is written and the exit code is
still 1. `--allow-missing` works with every command (`export` lists only the tests that would be
generated; `check` succeeds).

## Generated files

### Location

Each `.sanmaime` file becomes one `.spec.ts` file in `outputDir`, at the spec's path relative to
the config directory, with `.sanmaime` replaced by `.spec.ts`:

| Spec                                                  | Generated file                                          |
| ----------------------------------------------------- | ------------------------------------------------------- |
| `specs/login.sanmaime`                                | `.sanmaime-gen/specs/login.spec.ts`                     |
| `specs/ja/user-details.sanmaime`                      | `.sanmaime-gen/specs/ja/user-details.spec.ts`           |
| `../shared/x.sanmaime` (outside the config directory) | `.sanmaime-gen/__/shared/x.spec.ts` (`..` becomes `__`) |

Before writing, `nimaime-gen` deletes the files it generated earlier in `outputDir` — files whose
first line starts with `// Generated by nimaime-gen` — and the directories left empty. Other files
are never deleted (they are listed with `--verbose`), so a misconfigured `outputDir` cannot lose
your files. When there are errors, the previous output is left untouched.

Do not commit the output; add it to `.gitignore`:

```gitignore
# nimaime-gen output
.sanmaime-gen/
```

### Layout

Screens and elements become nested `test.describe` blocks and every **block** of an element
becomes one `test`:

| Sanmaime                                                            | Generated                     |
| ------------------------------------------------------------------- | ----------------------------- |
| `Screen: X`                                                         | `test.describe('Screen: X')`  |
| `Element: Y`                                                        | `test.describe('Element: Y')` |
| the element's unconditional block (expectations before any `When:`) | `test('Always')`              |
| `When: C` and its expectations                                      | `test('When: C')`             |

The unconditional block is titled `Always` because its expectations are invariants that hold in
every state of the screen ([sanmaime.md §5.4](./sanmaime.md)); v0 checks them in the base state
(the screen as opened by `defineScreen`, no condition applied). Every test starts from a fresh
page: the screen is opened, the condition (if any) is applied, then the expectations are checked
in order, each as a `test.step` (`Show: Username`, `Disable`, …), by the
[runtime](./runtime.md).

The README's Login example

```text
Screen: Login

  Element: Login Form
    Show: Email address
    And: Password
    And: Login button

  Element: Login Button
    When: Input is valid
    Enable

    When: Input is invalid
    Disable
```

with `importTestFrom: 'fixtures.ts'` and `definitions: 'definitions/**/*.ts'` generates
`.sanmaime-gen/specs/login.spec.ts`:

```ts
// Generated by nimaime-gen from specs/login.sanmaime. Do not edit.
import { createNimaimeTest } from 'nimaime-han/runtime';
import { test as base } from '../../fixtures';
import '../../definitions/login';

const test = createNimaimeTest(base);
const file = '../../specs/login.sanmaime';

test.describe('Screen: Login', () => {
  test.describe('Element: Login Form', () => {
    test('Always', async ({ $nimaime, page }) => {
      await $nimaime.run(
        { page },
        {
          screen: 'Login',
          element: 'Login Form',
          expectations: [
            { kind: 'show', target: 'Email address', location: { line: 4, column: 5 } },
            { kind: 'show', target: 'Password', location: { line: 5, column: 5 } },
            { kind: 'show', target: 'Login button', location: { line: 6, column: 5 } },
          ],
          file,
          locations: { screen: { line: 1, column: 1 }, element: { line: 3, column: 3 } },
        },
      );
    });
  });

  test.describe('Element: Login Button', () => {
    test('When: Input is valid', async ({ $nimaime, page }) => {
      await $nimaime.run(
        { page },
        {
          screen: 'Login',
          element: 'Login Button',
          condition: 'Input is valid',
          expectations: [{ kind: 'enable', location: { line: 10, column: 5 } }],
          file,
          locations: {
            screen: { line: 1, column: 1 },
            element: { line: 8, column: 3 },
            condition: { line: 9, column: 5 },
          },
        },
      );
    });

    test('When: Input is invalid', async ({ $nimaime, page }) => {
      await $nimaime.run(
        { page },
        {
          screen: 'Login',
          element: 'Login Button',
          condition: 'Input is invalid',
          expectations: [{ kind: 'disable', location: { line: 13, column: 5 } }],
          file,
          locations: {
            screen: { line: 1, column: 1 },
            element: { line: 8, column: 3 },
            condition: { line: 12, column: 5 },
          },
        },
      );
    });
  });
});
```

Details:

- **Header.** The first line names the source and marks the file as generated
  (`// Generated by nimaime-gen from <spec path relative to the config directory>. Do not edit.`).
- **`test`.** `createNimaimeTest(base)` adds the `$nimaime` fixture to the `test` exported by the
  `importTestFrom` file (`import { <varName> as base } from '<file>'`), so that its custom fixtures
  reach the definitions; without `importTestFrom`, `base` is `@playwright/test`'s `test`.
- **Definitions.** Every file matched by `definitions` is imported for its side effects (the
  `defineXxx()` calls), in sorted order, so that the registry is filled in every Playwright worker.
- **Import paths** are relative to the generated file. The `.ts`, `.tsx`, `.js` and `.jsx`
  extensions are left out (Playwright's loader and TypeScript's `Bundler` resolution find the file);
  `.mjs`, `.cjs`, `.mts` and `.cts` are kept. Avoid two files that differ only in such an
  extension (`steps.ts` and `steps.js`) in the same directory.
- **Fixtures.** Playwright sets up only the fixtures a test destructures, so each test
  destructures `$nimaime` plus exactly the fixtures that the definitions of its block use (screen
  `open`, condition, the element's locators), found by reading the first parameter of each
  callback ([runtime.md](./runtime.md#why-the-fixtures-are-passed-explicitly)), and passes them to
  `$nimaime.run()`. When a callback does not destructure its parameter
  (`(fixtures) => fixtures.page…`), its fixtures cannot be known: `nimaime-gen` warns and the test
  requests `page` for it. Destructure what you use to avoid the warning.
- **Hooks.** When `beforeScreen` / `afterScreen` hooks apply to a screen, its describe starts with
  `test.beforeAll` / `test.afterAll` calling `runHooks(…)`; `beforeElement` / `afterElement` hooks
  become `test.beforeEach` / `test.afterEach` in the element's describe. They destructure the
  fixtures their hooks use (worker-scoped only for screen hooks; the fallback is `browser` for
  screen hooks, `page` for element hooks), and `runHooks` is imported only when used. See
  [hooks.md](./hooks.md#generated-code).
- **Source locations.** `file` is the `.sanmaime` file relative to the generated file; every plan
  carries the line and column of its `Screen:`, `Element:` and `When:` lines and of each
  expectation. The runtime uses them for step locations, failure messages and code frames that
  point at the specification.
- **Names.** Titles use the names as written in the spec. Plans use the names as defined (names
  are matched after trimming surrounding whitespace, the runtime looks them up exactly).
- **Formatting.** The code is laid out the way Prettier formats it with `printWidth: 100` and
  trailing commas, so it reads and diffs like hand-written code. Strings use the `quotes` option,
  except that, like Prettier, a string containing more of those quotes than of the other kind uses
  the other kind (`"When: Viewing another user's profile"`). Characters are escaped as by
  `JSON.stringify`; non-ASCII text (e.g. Japanese) is written as is.
- **Tags** (`@tag` lines) are not used yet; see issue #15.

## Resolving `nimaime-han` in generated files

Generated files import `nimaime-han/runtime` by package name, so `nimaime-han` must be installed
where Playwright runs (it is, as a dependency of your project). Inside this repository the package
refers to itself through its `exports` map, which points at `dist/`: run `npm run build` before the
end-to-end test of the generator (`npm run test:e2e:gen` does it).

## Programmatic use (internal)

The CLI is a thin wrapper around
`runGeneration({ cli, cwd, mode, verbose, allowMissing, format, stdout, stderr })` in
`src/gen/run.ts`, which returns `{ exitCode, results }`. The reports are built by `src/gen/report.ts`
(`formatDiagnostics`, `formatMissing`, `formatUnused`) and the snippets by `generateSnippets()` in
`src/gen/snippets.ts`. It loads each Playwright config file at
most once per process, so call it once per process.

## Testing the generator

- Unit tests (`npm test`): `test/gen/generate.test.ts` locks the generated code with file snapshots
  (`test/gen/__snapshots__/generate/`) and checks that Prettier leaves every generated file
  unchanged; `test/cli/nimaime-gen.test.ts` runs the CLI in-process on throw-away projects.
- End-to-end (`npm run test:e2e:gen`): builds the package, runs the built `nimaime-gen` on the
  project in `test/e2e/gen/` and then `playwright test` on the generated specs, and checks that
  every test passes except `specs/failing/broken-on-purpose.sanmaime`, which must fail with a
  Sanmaime failure message. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use an already installed
  Chromium whose revision differs from the one Playwright expects.
