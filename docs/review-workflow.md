# Review workflow — drafts, approval and `nimaime diff`

The README's
[Sanmaime as an Intermediate Representation](../README.md#sanmaime-as-an-intermediate-representation)
describes one transition:

> **Before approval:** This is what the application currently does.
> **After approval:** This is what the application is supposed to do.

Nimaime-Han supports it with a status line in each `.sanmaime` file and three commands. This page
is their reference; [ai-workflow.md](./ai-workflow.md) is the operational guide.

```text
                 nimaime draft <url>                  "what the application currently does"
                        │
                        ▼
  specs/login.sanmaime  # status: draft               nimaime-gen skips it
                        │
                        │  review and edit (pull request)
                        ▼
                 nimaime approve specs/login.sanmaime
                        │
                        ▼
  specs/login.sanmaime  # status: approved            "what the application is supposed to do"
                        │
          ┌─────────────┴──────────────┐
          ▼                            ▼
  nimaime-gen + playwright test   nimaime diff specs/login.sanmaime <url>
  (regression tests in CI)        (has the screen drifted from its specification?)
```

## The status directive

A `# status:` comment in the **header** of a file (before the first `Screen:`, like
`# language:`) says whether the file is a draft or an approved specification
([sanmaime.md §3.4](./sanmaime.md#34-header-directives)):

```text
# status: draft
# Draft proposed by nimaime draft from http://localhost:3000/login. Review it before committing.

Screen: Login

  Element: Login Form
    Show: Email address
    And: Password
    And: Log in button
```

| Status                        | Meaning                                                          | `nimaime-gen`                       |
| ----------------------------- | ---------------------------------------------------------------- | ----------------------------------- |
| `# status: draft`             | What the application currently does. Proposed, not reviewed yet. | skipped (unless `--include-drafts`) |
| `# status: approved`          | What the application is supposed to do. Reviewed.                | generated                           |
| no `# status:` line (default) | Approved. Every hand-written file, and every older file.         | generated                           |

The directive is a comment, so a draft is still an ordinary Sanmaime file: it parses, editors
highlight it, and `nimaime-gen --include-drafts` can generate it. A value other than `draft` or
`approved`, or a second `# status:` line in the header, is the error `SANMAIME_E024`.

**Why a directive?** Other ways to tell drafts from specifications were considered:

- a **directory** (`specs/drafts/`) needs a convention in every project's config (the `specs`
  globs), and approving means moving the file, which breaks the history of the file in some tools;
- **Git** (e.g. "committed on the main branch = approved") cannot tell a reviewed file from a
  draft that was committed to share it, and is invisible to the parser and to editors.

The directive travels with the file, is visible in the file and in code review — the pull request
that approves a specification changes exactly that line — and needs no configuration. Existing
files, without the line, keep their meaning.

## 1. Draft

`nimaime draft` ([draft.md](./draft.md)) writes `# status: draft` as the **first line** of every
draft (before the `# language:` line and the header comment):

```bash
npx nimaime draft http://localhost:3000/login --screen Login --out specs/login.sanmaime \
  --definitions drafts/login.ts
```

`--status approved` writes `# status: approved` instead, for teams that trust the output of a
screen as it is (for example to pin down a legacy screen before refactoring it). The draft is
still worth reading before it is committed.

## 2. Review and edit

Review the draft like code, in a pull request: delete what is incidental, rename elements and
targets to the words the team uses, move state-dependent lines into `When:` blocks, add `Hide:`
for what must not be shown ([draft.md, Recommended review flow](./draft.md#recommended-review-flow)).
While the file says `# status: draft`, `nimaime-gen` leaves it out, so a half-reviewed draft
never breaks the build and never becomes a test by accident:

```text
$ npx nimaime-gen
nimaime-gen: 1 draft spec skipped (use --include-drafts).
Generated 4 spec files (12 tests) into .sanmaime-gen
```

To run a draft's tests while editing it — to see which lines hold on the current screen — include
the drafts: `npx nimaime-gen --include-drafts && npx playwright test`, or set
`includeDrafts: true` in a [config](./config.md#options) used only locally.

## 3. Approve

When the review is done, mark the file approved:

```bash
npx nimaime approve specs/login.sanmaime
# Approved specs/login.sanmaime
```

`nimaime approve <file...>` rewrites the `# status: draft` line to `# status: approved`. Nothing
else changes — line breaks (LF, CRLF), a byte order mark, the other comments and lines are kept
byte for byte — so the approval is a one-line diff in the pull request, and the history shows when
the specification was approved.

| Option                    | Description                                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `--remove`                | Delete the `# status:` line instead (a file without it is approved).                                                   |
| `--force`                 | Approve a file even though it has Sanmaime errors.                                                                     |
| `-l, --language <en\|ja>` | Keyword language of files without a `# language:` line, for checking them (default `en`; use the config's `language`). |

An approved specification must be valid: a file with parser errors is printed with its diagnostics
and left unchanged, and the exit code is 1 (`--force` approves it anyway). A file that is already
approved (no `# status:` line, or `# status: approved`) is left alone. Exit codes: `0` success,
`1` a file has errors, `2` usage errors (e.g. a file that does not exist; the other files are still
processed).

Approving is a decision, not a formatting step: whoever runs `nimaime approve` states that the file
is now the requirement. Leave it to the reviewer, or run it in the pull request once the review is
approved. The draft's header comment (`# Draft proposed by nimaime draft …`) is not removed
automatically; delete or rewrite it during the review.

## 4. Generate and test

Approved specifications are generated as always ([cli.md](./cli.md)):

```bash
npx nimaime-gen && npx playwright test
```

How `nimaime-gen` treats drafts:

- **Skipped by default.** Drafts are left out before anything is reported about them: their parser
  errors and missing definitions are not reported and do not fail the run. The number of skipped
  drafts is always printed on stderr: `nimaime-gen: 2 draft specs skipped (use --include-drafts).`
- **`nimaime-gen check`** also prints one information line per draft:
  `specs/sign-up.sanmaime: info: draft (# status: draft), not generated; approve it with "nimaime approve" when reviewed.`
  (`--verbose` prints the same lines for every command.)
- **`--include-drafts`** (or the config option `includeDrafts: true`) treats drafts like approved
  specifications: they are checked, generated and run. `export` marks them:

  ```text
  specs/sign-up.sanmaime  [draft]
    Screen: Sign Up > Element: Sign-up Form > Always
  ```

## 5. Detect drift: `nimaime diff`

An approved specification says what a screen must show. `nimaime diff` observes the screen again —
exactly as `nimaime draft` does, with the specification's screen name and keyword language — and
compares the specification with that fresh draft, in Sanmaime terms:

```bash
npx nimaime diff specs/login.sanmaime http://localhost:3000/login
```

```text
Screen: Login  (specs/login.sanmaime vs http://localhost:3000/login)

  Element: Login Form
    = Show: Email address
    = Show: Password
    - Show: Login button  (in spec, not observed)
    + Show: Remember me   (observed, not in spec)

  Element: Sign-up link   (observed, not in spec)
    + Show: Sign up

  Not compared (only expectations outside When: blocks are compared):
    Element: Login Button > When: Input is valid
    Element: Login Button > When: Input is invalid

1 element and 2 expectations differ.
```

| Mark | Meaning                                                                                                                     |
| ---- | --------------------------------------------------------------------------------------------------------------------------- |
| `=`  | The same in both.                                                                                                           |
| `-`  | In the specification, not observed (a target the spec shows but the screen does not have, or not by that name).             |
| `+`  | Observed, not in the specification.                                                                                         |
| `!`  | Stated differently: `Enable` / `Disable`, or a `Hide:` target that is visible (`! Hide: Error  (in spec; observed: Show)`). |

What is compared:

- **Screens and elements by name, exactly.** Elements of the draft are named by the
  [rules of `nimaime draft`](./draft.md#what-the-rules-do) (landmarks, labels, headings); an
  element the reviewer renamed appears once as `-` (the specification's name) and once as `+` (the
  draft's name). A difference in a whole element counts once, however many lines it has.
- **Targets by name, within an element.** `And:` is compared as the `Show:` / `Hide:` it continues.
- **Only what one observation can tell**: the expectations an element states **outside `When:`
  blocks**. Conditions cannot be observed (the screen is observed in one state, as it opens), so
  `When:` blocks are listed as _not compared_, and a target the specification states only inside a
  `When:` block is not reported as `+` when it is observed.
- **`Hide:`** agrees with a target the draft does not list (a draft only lists what is visible); it
  differs (`!`) when the target is visible.
- **`Enable` / `Disable`** are compared when both sides state one. A draft states the state of an
  element only when the element is a single control, so a missing state is not a difference.
- **Expectations a draft never proposes** — `Text:`, `Contain:`, `Count:`, `Check` / `Uncheck`,
  `Focus`, `Editable` / `ReadOnly`, `Empty`, and state keywords with a target (`Enable: X`), see
  [expectations.md](./expectations.md) — are listed as _not compared_
  (`Element: Header > Text: Title = "Welcome"`), unless their element exists on one side only
  (then they are listed with it).

The command is the same as `nimaime draft` for opening the screen: the second argument is a URL, a
local HTML file, or an observation saved with `--observation` (`.json`), and `--storage-state`,
`--wait`, `--timeout`, `--test-id-attribute`, `--group-by`, `--browser` and `--headed` work the same
way. Other options:

| Option                    | Description                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| `-s, --screen <name>`     | The screen of the specification to compare, when the file has several.                        |
| `-l, --language <en\|ja>` | Keyword language of `.sanmaime` files without a `# language:` line (default `en`).            |
| `--json`                  | Print the differences as JSON (`{ spec, other, identical, counts, screens: [...] }`) instead. |
| `--observation <file>`    | Save what was observed, to compare again offline or to draft from it.                         |

**Two files.** When the second argument is a `.sanmaime` file, the two files are compared instead
— for example a specification and a draft saved earlier (`nimaime draft … --out login.draft.sanmaime`),
or two versions of a specification. Every screen is compared (`--screen` restricts it to one), and
the annotations name the file: `(in spec, not in login.draft.sanmaime)`.

| Exit code | Meaning                                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `0`       | No differences.                                                                                                                       |
| `1`       | Differences.                                                                                                                          |
| `2`       | The comparison could not be made: usage errors, a file that does not exist or has Sanmaime errors, a screen that could not be opened. |

`nimaime diff` compares any two documents whatever their status; comparing a draft with the screen
it was drafted from reports no differences.

## CI

A suggested setup, from strict to informational:

1. **Every pull request: `npx nimaime-gen check`**, then generate and run the tests. Approved
   specifications must be valid and fully defined; drafts do not block. Add `--include-drafts` to a
   separate, non-blocking job if you want drafts checked too.

2. **Review `.sanmaime` files like code.** Specifications are requirements: give them owners, so
   that a change to one — and in particular an approval, which is a `# status:` line in the diff —
   needs their review. With GitHub, in `.github/CODEOWNERS`:

   ```text
   # Screen specifications are requirements: product and QA review every change.
   *.sanmaime    @your-org/product @your-org/qa
   ```

   and require code owner reviews on the protected branch.

3. **Spec drift: `nimaime diff` against a deployed environment**, on a schedule or after each
   deployment. Exit code 1 means the screen and its approved specification disagree: either the
   application changed without its specification (update the specification in a pull request), or
   the application broke. Exit code 2 means the check itself failed (e.g. the environment was down).

   ```yaml
   # .github/workflows/spec-drift.yml
   name: Spec drift
   on:
     schedule: [{ cron: '0 6 * * 1-5' }]
     workflow_dispatch:
   jobs:
     diff:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: 22, cache: npm }
         - run: npm ci && npx playwright install --with-deps chromium
         - name: Compare each approved screen with staging
           run: |
             status=0
             npx nimaime diff specs/login.sanmaime https://staging.example.com/login || status=$?
             npx nimaime diff specs/user-details.sanmaime https://staging.example.com/users/me \
               --storage-state playwright/.auth/user.json || status=$?
             exit $status
   ```

   Because `nimaime diff` compares only what one observation can tell, keep it informational at
   first (for example `continue-on-error: true`, or a scheduled job that opens an issue), and use
   the Playwright tests generated by `nimaime-gen` as the gate: they check every `When:` block, with
   the locators the team reviewed.

## API

The functions behind the commands are in `src/draft/` (internal; not a package entry point yet):
`setStatusDirective(source, status | undefined)` and `statusDirectiveLine(source)`
(`status.ts`), `approveSource(source, { remove?, language? })` and `runApprove(args, io)`
(`approve.ts`), `diffDocuments(spec, other)`, `formatDiff(diff, { spec, other, otherWord?, language? })`
and `diffSummary(counts)` (`diff.ts`), `runDiff(args, io)` (`diff-run.ts`). The parser reports the
status as `document.status` (`'draft' | 'approved'`) and `document.statusDirective`; the generator's
handling is in `src/gen/status.ts`.

---

See also: [ai-workflow.md](./ai-workflow.md) · [draft.md](./draft.md) ·
[sanmaime.md §3.4](./sanmaime.md#34-header-directives) · [cli.md](./cli.md#drafts) ·
[documentation index](./README.md)
