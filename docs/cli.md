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
5. reports problems — if there is any error, **nothing is written** for that configuration;
6. otherwise removes the previously generated files from `outputDir` and writes the new ones.

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
| `--verbose`           | Also prints: the number of spec and definition files, screens without `defineScreen`, unused definitions, every generated file, files kept in `outputDir`, and stack traces of errors. The `verbose` config option does the same for one configuration. |
| `-h, --help`          | Prints the help.                                                                                                                                                                                                                                        |
| `-v, --version`       | Prints the version.                                                                                                                                                                                                                                     |

`--watch` is not available yet: a changed definition file cannot be re-evaluated in the same
process ([definitions.md](./definitions.md#definition-loading-and-matching)), so a watch mode has
to regenerate in a child process. It is left for a later version.

## Output and exit codes

Normal output (the summary, the `export` list) goes to stdout; problems go to stderr, in the
editor/problem-matcher friendly form `file:line:column: severity: message`, with paths relative to
the current directory:

```text
specs/login.sanmaime:7:5: error SANMAIME_E007: 'And:' must follow 'Show:', 'Hide:' or 'And:' in the same block.
specs/login.sanmaime:8:3: error: Element "Login Button" of Screen "Login" has no definition (defineElement).
specs/login.sanmaime:9:5: error: Element "Login Form" has no definition for target "Remember me".
specs/login.sanmaime:12:5: error: Condition "When: Input is valid" (Screen "Login", Element "Login Button") has no definition (defineCondition).
nimaime-gen: nothing was generated into .sanmaime-gen (4 errors).
```

| Exit code | Meaning                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0`       | Success (warnings do not change the exit code).                                                                                                                    |
| `1`       | Spec or definition errors: parser errors, missing definitions, a definition file that fails to load (or an unexpected error, with its stack).                      |
| `2`       | Usage or configuration errors: unknown command or option, Playwright config not found, invalid `defineSanmaimeConfig()` options, no `defineSanmaimeConfig()` call. |

What is an error, a warning or information:

| Problem                                                                     | Severity                                         |
| --------------------------------------------------------------------------- | ------------------------------------------------ |
| parser diagnostic (`SANMAIME_Ennn`)                                         | error                                            |
| missing element, target, `self` locator (for `Enable`/`Disable`), condition | error                                            |
| definition file that throws while loading (incl. duplicate definitions)     | error (message only; the stack with `--verbose`) |
| no `.sanmaime` file matches `specs`                                         | warning (an empty `outputDir` is still produced) |
| a callback whose fixtures cannot be determined (see below)                  | warning                                          |
| a `Screen:` without `defineScreen` (it is simply not opened)                | info, shown with `--verbose`                     |
| unused definitions                                                          | warning, shown with `--verbose`                  |

With several configurations (Playwright projects), each one is processed independently: one with
errors writes nothing, the others are still generated, and the exit code is 1.

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

The CLI is a thin wrapper around `runGeneration({ cli, cwd, mode, verbose, stdout, stderr })` in
`src/gen/run.ts`, which returns `{ exitCode, results }`. It loads each Playwright config file at
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
