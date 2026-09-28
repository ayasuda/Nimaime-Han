# Tests — how they fit together

Nimaime-Han is tested in layers, from fast unit tests of pure functions to whole user projects
run through `nimaime-gen` and `playwright test`. Like playwright-bdd's `test/` directory, the tool
test cases (`test/tool/`) exercise the package the way users run it.

| Layer            | Where                                        | Command                             | What it covers                                                                                                                                                                                                        |
| ---------------- | -------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit             | `test/**` (except `e2e/`, `tool/`), `src/**` | `npm test`                          | Parser, config, generator (with file snapshots in `test/gen/__snapshots__/`), CLI in-process on throw-away projects (`test/cli/`), runtime and reporter with fakes, editor grammar. Fast, no build, no browser.       |
| Runtime e2e      | `test/e2e/runtime/`, `test/e2e/reporter/`    | `npm run test:e2e`                  | `nimaime-han/runtime` and the reporter in a real browser, with hand-written specs (no generator).                                                                                                                     |
| Generator e2e    | `test/e2e/gen/`                              | `npm run test:e2e:gen`              | One project through the built `nimaime-gen` and `playwright test` (a script with fixed expectations). Kept as a smoke test; new scenarios go into tool cases.                                                         |
| Tool cases       | `test/tool/cases/<case>/`                    | `npm run test:tool`                 | Many small user projects: `nimaime-gen` exit codes and output, generated files (file snapshots), `playwright test` pass/fail/skip counts, failure messages and the Sanmaime reporter's tree. Built package, Chromium. |
| Version matrix   | `test/tool/cases/basic/` in CI               | `playwright-matrix` job (see below) | The `basic` case against several `@playwright/test` versions of the peerDependency range.                                                                                                                             |
| Example projects | `examples/<name>/`                           | `npm run test:example:basic`        | A self-contained project installing the packed package, as documentation that runs.                                                                                                                                   |

All of `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`, `npm run build`,
`npm run test:e2e`, `npm run test:e2e:gen` and `npm run test:tool` run in CI (`.github/workflows/ci.yml`).

## Browsers

The Playwright configs launch Chromium from `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when it is set.
Use it when the installed Chromium is not the revision the repository's Playwright expects (for
example a sandbox with preinstalled browsers):

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium npm run test:tool
```

Otherwise install the browser once with `npx playwright install chromium`.

## Tool test cases

`npm run test:tool` builds the package and runs vitest with `vitest.tool.config.ts`, which only
includes `test/tool/**/*.test.ts` (the default `npm test` excludes `test/tool/`, so unit tests stay
fast). Each case is a directory:

```text
test/tool/cases/failure-message/
├── case.test.ts          # the test: runCase(import.meta.dirname, { … })
├── playwright.config.ts  # defineSanmaimeConfig() + defineConfig(), as in a user project
├── specs/login.sanmaime
├── definitions/login.ts
└── __snapshots__/        # written by the test: generated files (and outputs) to compare with
    └── sanmaime-gen/specs/login.spec.ts.snap
```

| Case                  | What it checks                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `basic`               | The README's Login and User Details examples against a static app (`file://` URLs): generation summary, snapshots, 6 passing tests, the tree.  |
| `missing-definitions` | Exit 1, the pretty report with snippets (full stderr snapshot), `--format compact`, nothing written.                                           |
| `allow-missing`       | `--allow-missing`: partial generation (a spec left without tests gets no file), the list of left-out tests, exit 0, the generated tests pass.  |
| `syntax-error`        | Exit 1, the `Syntax errors:` block and compact lines, specs with errors not matched against definitions, `check`.                              |
| `i18n-ja`             | Japanese keywords via `# language: ja` and via the config's `language: 'ja'` (with full-width colons); without either, syntax errors.          |
| `custom-fixtures`     | `importTestFrom: { file, varName }` with an option fixture set per project and a custom fixture used by a condition; `quotes: 'double'`.       |
| `failure-message`     | A failing `Disable`: the Sanmaime header in Playwright's output and in the JSON report, the code frame of the `.sanmaime` file, the ✗ block.   |
| `reporter`            | The Sanmaime reporter's tree for a run with passes, an expectation failure, a condition failure and a skip (snapshot), and its `quiet` option. |
| `multi-project`       | Two `defineSanmaimeConfig()` calls / Playwright projects with their own `outputDir`; one configuration with errors does not stop the other.    |
| `export-and-check`    | `export` output, `check` (success, `--verbose` information, missing definitions), `--allow-missing` with both, usage errors (exit 2), version. |

A `tags` case is to be added with issue #15 (tags / `--tags`).

### The harness (`test/tool/harness.ts`)

`runCase(caseDir, options)`:

1. **Copies the case into a temp directory** (`os.tmpdir()/nimaime-tool-<case>-*`, removed after
   the test file; `NIMAIME_TOOL_KEEP=1` keeps them and prints their paths), without `case.test.ts`
   and `__snapshots__/`. It adds a `package.json` (`"type": "module"`) and a `tsconfig.json`
   without `paths` when the case has none — never put a `tsconfig.json` into a case directory: the
   repository's ESLint and TypeScript would pick it up for the case's files.
2. **Gives it a `node_modules`**: a directory of symlinks to every package of the repository's
   `node_modules`, plus `nimaime-han` → the repository root. The project imports `nimaime-han` like
   a user project does, resolved through the package `exports` to `dist/` (hence the build), and
   Node resolves the symlinks to real paths, so the project and nimaime-han load the same
   `@playwright/test` (Playwright refuses to run with two copies of itself).
3. **Runs the built CLI** `node_modules/nimaime-han/dist/cli/nimaime-gen.js` with the case's
   `args` in the project, and checks `exitCode` (default 0), `stdout` / `stderr` patterns (strings
   must be contained, regular expressions must match), `stdoutExact`, and `generated`: the files
   the run created, relative to the project (`[]` = nothing written).
4. **Snapshots every generated file** with vitest's `toMatchFileSnapshot()` into the case's
   `__snapshots__/`, at the file's path with the leading dot of path segments dropped
   (`.sanmaime-gen/specs/login.spec.ts` → `__snapshots__/sanmaime-gen/specs/login.spec.ts.snap`,
   because `.sanmaime-gen/` is git-ignored). `snapshot: false` turns this off.
5. **With `playwright: { … }`, runs `playwright test`** in the project with
   `--reporter=json,nimaime-han/reporter` (the JSON report goes to a file and gives the counts;
   stdout is the Sanmaime tree). It checks `passed` / `failed` (default 0), `skipped`, `flaky`, the
   exit code (default: 1 if `failed` > 0) and `stdout` / `stderr` patterns. `reporters` adds
   reporters (e.g. `['line', 'nimaime-han/reporter']` for Playwright's own failure output), or
   `'config'` uses the config file's `reporter` list (it must contain `json`).

Output is normalised before it is checked: `\r\n` → `\n`, the temp project path → `<project>`,
durations such as `(3.4s)` → `(<duration>)`, and the JSON report's error messages are stripped of
ANSI codes. Child processes run with `FORCE_COLOR=0`.

`runCase()` returns `{ project, gen, playwright }` for further assertions (the flattened tests of
the JSON report are in `playwright.tests`, titles joined with `>`). For steps between runs, use a
`CaseProject` directly: `new CaseProject(dir)`, change files in `project.dir`, then
`project.gen({ … })` and `project.playwright({ … })` as often as needed.

### Adding a case

1. Create `test/tool/cases/<name>/` with a `playwright.config.ts` (copy one from another case —
   keep the `launchOptions.executablePath` line), `specs/`, `definitions/` and, if needed,
   `fixtures.ts` or an `app/` of static pages. Serve pages with `page.setContent()` or `file://`
   URLs; no web server. The case's `.ts` files are type-checked and linted with the repository's
   settings (`nimaime-han` maps to `src/`, no DOM types: use Playwright APIs rather than
   `document`).
2. Write `case.test.ts`:

   ```ts
   import { it } from 'vitest';
   import { runCase } from '../../harness';

   it('does what the case is about', async () => {
     await runCase(import.meta.dirname, {
       stdout: ['Generated 1 spec file (2 tests) into .sanmaime-gen'],
       generated: ['.sanmaime-gen/specs/login.spec.ts'],
       playwright: { passed: 1, failed: 1, stdout: ['✗ Screen: Login'] },
     });
   });
   ```

3. Run it alone and review the snapshots it writes:

   ```bash
   npm run build
   PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=… npx vitest run -c vitest.tool.config.ts test/tool/cases/<name>
   ```

4. Add the case to the table above.

### Updating snapshots

A change to the generated code or to an output snapshotted with `toMatchFileSnapshot()` fails the
cases whose snapshots differ. Review the diff, then rewrite the snapshots:

```bash
npm run test:tool -- -u                    # all cases
npm run test:tool -- -u test/tool/cases/basic
```

Commit the updated `__snapshots__/` files with the change. On CI (`CI=true`) missing snapshots are
not written: they fail the run.

## Playwright version matrix

The `playwright-matrix` CI job (on pull requests and `main`) runs the `basic` case with other
`@playwright/test` versions, without touching the repository's own install:

```bash
npm run build
node test/tool/install-playwright.js 1.45.0 /tmp/pw-1.45   # npm pack + npm install there
NIMAIME_TOOL_NODE_MODULES=/tmp/pw-1.45/node_modules NIMAIME_TOOL_PACKAGE_TYPE=commonjs \
  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=… npx vitest run -c vitest.tool.config.ts test/tool/cases/basic
```

- `install-playwright.js` packs the repository and installs the tarball with the requested
  `@playwright/test` into the directory, so `nimaime-han` is a copy that loads that Playwright.
- `NIMAIME_TOOL_NODE_MODULES` makes the harness link the projects' `node_modules` to that directory
  instead of the repository's.
- `NIMAIME_TOOL_PACKAGE_TYPE` (`module` by default, or `commonjs`) is the `type` of the projects'
  `package.json`.
- The browser is the Chromium installed for the repository's Playwright; older Playwright versions
  drive it fine, and their own browser builds may no longer be downloadable.

The matrix runs CommonJS projects with 1.40 (the peerDependency minimum), 1.45, 1.50, 1.55 and the
latest version, and ES module projects with 1.61 and the latest version. **Known limitation:** with
Playwright older than 1.61, `nimaime-gen` cannot load the definition files of an ES module project
(`"type": "module"`): relative imports without an extension (`import { test } from '../fixtures'`)
fail with `Cannot find module`, and with some versions (e.g. 1.58) the config itself fails to load
(`….esm.preflight`). Older Playwright versions register their ES module loader only in the
processes they start themselves, which `nimaime-gen` does not do yet. CommonJS projects work across
the whole range.
