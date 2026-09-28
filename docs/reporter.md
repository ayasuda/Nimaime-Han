# Reporter — `nimaime-han/reporter`

A Playwright reporter that prints the results of generated Sanmaime tests as a ✓/✗ tree —
Screen > Element > When > expectation — instead of a flat list of test titles. It is the
counterpart of playwright-bdd's Cucumber reporter.

```text
✗ Screen: Login

  ✓ Element: Login Form
    ✓ Email address is shown
    ✓ Password is shown
    ✓ Login button is shown

  ✗ Element: Login Button
    ✓ disabled
    ✓ Error message is hidden

    When: Input is valid
      ✓ enabled

    When: Input is invalid
      ✗ disabled
        Expected: disabled
        Actual: enabled
        Location: specs/login.sanmaime:16

1 screen, 2 elements, 7 expectations: 6 passed, 1 failed, 0 skipped (3.4s)
```

## Configuration

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [['list'], ['nimaime-han/reporter', { quiet: false }]],
});
```

Or on the command line (a path works too, e.g. `--reporter=./node_modules/nimaime-han/dist/reporter/index.js`):

```bash
npx playwright test --reporter=list,nimaime-han/reporter
```

## Options

| Option         | Default | Meaning                                                                                                                                                                                            |
| -------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `colors`       | auto    | ANSI colours (✓ green, ✗ red, ○ yellow). Auto: on when stdout is a TTY and `NO_COLOR` is not set; `FORCE_COLOR` forces it on (`FORCE_COLOR=0` off).                                                |
| `quiet`        | `false` | Print only what failed — failed screens, elements, `When:` blocks and expectations, failed other tests — and the summary.                                                                          |
| `printSteps`   | `true`  | One line per expectation. With `false` only the Screen and Element lines and the failed expectations are printed.                                                                                  |
| `printDetails` | `false` | Also print Playwright's error message (the part after the Sanmaime header) under each failure. Off by default because the reporters it is usually combined with (`list`, `line`, `html`) print it. |
| `cwd`          | cwd     | Directory that file paths are shown relative to.                                                                                                                                                   |
| `output`       | stdout  | `{ write(chunk), isTTY? }` to write to. Mainly for tests; when set, `printsToStdio()` is `false`.                                                                                                  |

## How the tree is built

The reporter reads what the generated specs and the [runtime](./runtime.md) put into Playwright:

- **Test titles** (`test.titlePath()`): `test.describe('Screen: X') > test.describe('Element: Y') > test(title)`.
  A test title starting with `When: ` is a conditional block; any other title is the element's
  unconditional block. Other describes around them (a project, a wrapper) are ignored.
- **Steps** (`TestResult.steps`, category `test.step`, also when nested in user steps): `Screen: X`
  (opening the screen), `Background: B` (a background condition, v0.2), `When: C` and
  `And when: D` (establishing the block's conditions — the block is named after these steps,
  `C and D`, falling back to the test title `When: C and D` when not all of them ran), and one
  step per expectation, printed as:

  | Step               | Printed as            |
  | ------------------ | --------------------- |
  | `Show: T`          | `T is shown`          |
  | `Hide: T`          | `T is hidden`         |
  | `Enable`           | `enabled`             |
  | `Disable`          | `disabled`            |
  | `Check: T` (v0.3)  | `T is checked`        |
  | `ReadOnly` (v0.3)  | `read-only`           |
  | `Text: T = "x"`    | `T has text "x"`      |
  | `Contain: T = "x"` | `T contains text "x"` |
  | `Count: T = 3`     | `Count of T is 3`     |

  That is, every expectation is printed as the `Expected:` line of its failure would read it
  (`describeExpected` of the vocabulary table; every kind is listed in
  [expectations.md](./expectations.md)). Step titles are parsed with `parseExpectationTitle()`
  from `nimaime-han/runtime`.

- **Failures**: the message of a failed expectation starts with the Sanmaime header
  (`Screen:` / `Element:` / `When:` / `Expected:` / `Actual:` / `Location:`, then `Details:`; see
  [runtime.md](./runtime.md)). Playwright hands reporters only an error's message and stack, so the
  reporter parses the header with the runtime's `parseExpectationFailure` (which owns the format and
  accepts the `NimaimeExpectationError: ` prefix and ANSI codes). Under the failed expectation it
  prints `Expected:`, `Actual:` (the observed state, without the `(after 5000ms)` timeout) and
  `Location:` — and `When:` if the block's `When:` line was not printed already. Without a
  `Location:` line, the step's location is used.

Layout: the `Background:` conditions of a screen (from the `Background: B` steps of its tests,
in order of first appearance) are printed once, dimmed, under the `Screen:` line at 2 spaces —
nothing is printed for a screen without background; unconditional expectations are indented 4
spaces; a `When:` line is at 4 spaces with its
expectations at 6; failure details are 2 spaces deeper than the ✗ line. Blocks of one element are
separated by a blank line.

Output is buffered and printed in `onEnd`, so it does not depend on the number of workers. Screens,
elements and blocks are ordered by project, then spec file, then the test's source line; a screen
spread over several spec files is merged. With several Playwright projects each screen is shown
once per project, labelled `✓ Screen: Login [chromium]`.

### Statuses

- `✓` passed, `✗` failed, `○` skipped (also tests that never ran, e.g. after `--max-failures` or
  an interrupted run). An element or screen is ✗ if any block under it failed, ○ if all were skipped.
- **Retries**: the final attempt counts; a flaky test that passed on retry is ✓.
- The runtime stops a block at its first failure, so the expectations after it are not printed.
- A block that failed outside an expectation — opening the screen, a `Background:` / `When:` /
  `And when:` condition, a timeout, a missing definition — is printed as `✗ <step title>`
  (`✗ When: Logged in`, `✗ Timed out`, `✗ Failed`) followed by `Error: <first line of the message>` and `Location:`.

### Summary

```text
2 screens, 5 elements, 18 expectations: 15 passed, 2 failed, 1 skipped (6.9s)
10 other tests: 10 passed, 0 failed, 0 skipped
```

Expectations that ran count as passed or failed; a block that failed outside an expectation counts
as one failed; a skipped block counts as one skipped (its expectations never ran, so their number is
unknown). The duration is the whole run's; `interrupted` / `timedout` runs say so after it. The
second line appears only when the run has other tests.

### Other tests

Tests that are not shaped like generated tests (no `Screen: ` describe with an `Element: ` describe
inside) are listed briefly after the screens, as `file › describe › title`, with the first line of
the error for failures:

```text
Other tests
  ✓ runtime/runtime.spec.ts › runtime behaviour › low-level methods
  ✗ other.spec.ts › breaks
    Error: Error: expected 1 to be 2
```

Errors outside tests (`onError`, e.g. a config that fails to load) are printed under `Errors`.

## Combining with other reporters

The reporter prints the Sanmaime view only; it does not print Playwright's full error messages,
call logs, code frames, attachments or test stdout by default. Combine it with a Playwright
reporter for those:

```ts
reporter: [
  ['list'], // progress + full errors while the run is going
  ['nimaime-han/reporter'], // the Sanmaime tree at the end
  ['html', { open: 'never' }],
],
```

Used alone, set `printDetails: true` to get Playwright's messages under the failures. The reporter
returns `true` from `printsToStdio()`, so Playwright does not add its default stdout reporter.

## Programmatic use

`nimaime-han/reporter` also exports the pieces, typed structurally so they work on Playwright's
objects or on hand-built ones: `buildReport(tests, cwd)` → `RunReport`, `countReport(report)`,
`renderReport(report, options)`, `renderSummary`, `parseSanmaimeHeader(message)`,
`formatDuration(ms)`, `defaultColors(output, env?)`.

## Tests

- Unit: `test/reporter/` drives the reporter with fake suites, tests, results and steps.
- End to end: `test/e2e/reporter/reporter.spec.ts` (part of `npm run test:e2e`) runs Playwright
  with `--reporter=src/reporter/index.ts` in nested processes and checks the printed tree, for
  - `test/e2e/runtime/reporting/playwright.config.ts`: the README example against a buggy page —
    the output is the README result, exactly;
  - `test/e2e/reporter/project/playwright.config.ts`: the runtime e2e specs plus
    `profile.scenario.ts`, which fails and skips on purpose.

  To see the output yourself:

  ```bash
  npx playwright test -c test/e2e/runtime/reporting/playwright.config.ts --reporter=./src/reporter/index.ts
  npx playwright test -c test/e2e/reporter/project/playwright.config.ts --reporter=./src/reporter/index.ts
  ```

## Not yet

- Markdown / JSON output (the issue leaves them for later; `buildReport` gives the data).
- Printing per screen as tests complete (streaming); the tree is printed at the end.
- Marking flaky blocks; showing retried attempts.
