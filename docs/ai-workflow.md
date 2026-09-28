# AI workflow — draft, review, approve, regression-test

The README's
[Sanmaime as an Intermediate Representation](../README.md#sanmaime-as-an-intermediate-representation)
proposes one loop:

> **AI generates the specification from the implementation.
> Humans approve the specification.
> The approved specification becomes the regression test.**

This page is the operational guide to that loop: which command does each step, who does it, and
how to wire it into pull requests and CI. The commands themselves are documented in
[draft.md](./draft.md) (`nimaime draft`) and [review-workflow.md](./review-workflow.md)
(`# status:`, `nimaime approve`, `nimaime diff`); this page does not repeat their options.

```text
Existing Application
        │
        ▼
   nimaime draft  ──────────────  AI (rules, optionally an LLM) observes the screen
        │
        ▼
   Sanmaime Draft               # status: draft        "what the application currently does"
        │
        ▼
   Human Review                 pull request: edit names, When: blocks, Hide:, values
        │
        ▼
   nimaime approve              # status: approved     "what the application is supposed to do"
        │
        ▼
   nimaime-gen + playwright test  ──  regression tests, on every pull request (CI/CD)
        │
        ▼
   nimaime diff                 later: has the screen drifted from its specification?
```

| Step                                             | Command                          | Who                              | Output                                             |
| ------------------------------------------------ | -------------------------------- | -------------------------------- | -------------------------------------------------- |
| [1. Draft](#1-draft)                             | `nimaime draft <url>`            | a developer (or a scheduled job) | `specs/<screen>.sanmaime` marked `# status: draft` |
| [2. Review](#2-review)                           | an editor, `nimaime-gen check`   | product owner, QA, developer     | an edited draft in a pull request                  |
| [3. Approve](#3-approve)                         | `nimaime approve <file>`         | the reviewer who owns the spec   | `# status: approved` — a one-line diff             |
| [4. Regression tests](#4-regression-tests-in-ci) | `nimaime-gen && playwright test` | CI                               | Playwright tests that must pass                    |
| [5. Drift](#5-drift-nimaime-diff)                | `nimaime diff <spec> <url>`      | a scheduled CI job               | differences in Sanmaime terms, exit code 1         |

## Before you start

- A project set up as in [getting-started.md](./getting-started.md): `defineSanmaimeConfig()` in
  `playwright.config.ts`, `specs/` and `definitions/`.
- A running build of the application with **realistic but non-personal data**. Drafts and saved
  observations contain the text shown on the screen.
- For screens behind a login, a Playwright
  [storage state](https://playwright.dev/docs/auth) file (e.g. saved by a setup project), passed
  with `--storage-state`.

## 1. Draft

```bash
npx nimaime draft http://localhost:3000/login --screen Login \
  --out specs/login.sanmaime --definitions drafts/login.ts
```

`nimaime draft` opens the screen with Playwright, observes its landmarks and named elements, and
writes:

- a Sanmaime draft whose first line is `# status: draft` — `nimaime-gen` skips it until it is
  approved, so a draft never becomes a test by accident;
- optionally a definitions draft: `defineScreen` with the observed URL and one `defineElement` per
  element, with locators chosen like Playwright's codegen (`getByTestId`, `getByRole`, …).

Write the **definitions draft outside the `definitions` glob** (here `drafts/`, or `-d -` to print
it). Definition files are loaded whatever the status of the specs, and element names are global:
a drafted `defineElement('Login Form', …)` next to an existing one fails generation with a
duplicate-definition error. Move the reviewed definitions into `definitions/` in step 2.

**Rule-based or LLM.** Without options the draft is produced by deterministic rules: no network, the
same observation always gives the same draft. `--llm <module>` hands the observation and the
rule-based candidate to your own adapter (a function that calls any model); the answer is parsed
and validated, retried once with the diagnostics, and replaced by the rule-based draft if it is
still invalid. Nimaime-Han ships no model client. See [draft.md](./draft.md#llm-adapters).

What a draft never contains: `When:` blocks, conditions and `Hide:` (one observation is one state
of the screen), and the value and state keywords of the vocabulary v1 (`Text:`, `Count:`,
`Check`, … — [expectations.md](./expectations.md)). Those are the reviewer's decisions.

To draft several states of a screen (another user, an empty list, an error), draft each into its
own file (`--out drafts/login-invalid.sanmaime`) and merge what differs into `When:` blocks during
the review.

## 2. Review

The review turns _"this is what the application currently does"_ into _"this is what it is
supposed to do"_. Do it in a pull request, like code:

1. **Delete** what is incidental: decoration, marketing copy, duplicated headings, elements nobody
   would write in a specification.
2. **Rename** elements and targets to the words the team uses (`Log in button` → `Login button`).
   Names are the contract with the definitions, so rename both.
3. **Add states**: move state-dependent lines into `When:` blocks, add `Hide:` for what must not be
   shown, `Background:` for a condition every element needs, and values the screen must have
   (`Text: Title = "Log in"`, `Count: Results = 20`).
4. **Bind the names**: move the definitions draft into `definitions/`, check each locator, replace
   the observed URL with a path relative to `baseURL`, and write a `defineCondition()` for each
   `When:` name. `npx nimaime-gen check --include-drafts` lists what is still missing, with snippets.
5. **Try it**: `npx nimaime-gen --include-drafts && npx playwright test` runs the draft's tests on
   the current screen. A line that fails is either wrong in the draft or a bug in the application —
   the review decides which.

While the file still says `# status: draft`, the normal `nimaime-gen` run (and CI) skips it:

```text
$ npx nimaime-gen
nimaime-gen: 1 draft spec skipped (use --include-drafts).
Generated 1 spec file (3 tests) into .sanmaime-gen
```

Delete the draft's header comment (`# Draft proposed by nimaime draft from …`) during the review.
Details and the reasoning behind the status line: [review-workflow.md](./review-workflow.md).

## 3. Approve

```bash
npx nimaime approve specs/login.sanmaime
# Approved specs/login.sanmaime
```

`nimaime approve` rewrites `# status: draft` to `# status: approved` and changes nothing else, so
the approval is one visible line in the pull request. It refuses a file with Sanmaime errors.

Approval is a decision, not a formatting step. Give specifications owners so that approvals need
their review:

```text
# .github/CODEOWNERS — screen specifications are requirements
*.sanmaime    @your-org/product @your-org/qa
```

and require code-owner reviews on the protected branch. Never approve in an automated job: the
point of the loop is that a human decides what the application must do.

## 4. Regression tests in CI

Once approved, the specification is an ordinary part of the test suite:

```yaml
# .github/workflows/ci.yml (excerpt)
jobs:
  screens:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx nimaime-gen check # approved specs must parse and be fully defined
      - run: npx nimaime-gen && npx playwright test
```

- `nimaime-gen check` fails (exit code 1) on a syntax error or a missing definition in an
  **approved** specification; drafts do not block. Add a separate, non-blocking job with
  `--include-drafts` to keep an eye on drafts.
- The generated tests check every element and every `When:` block, with the locators the team
  reviewed. They are the gate.
- Add `['nimaime-han/reporter']` to the reporters to get the ✓/✗ tree in the job log
  ([reporter.md](./reporter.md)).

When a requirement changes, edit the `.sanmaime` file in the same pull request as the application
change. The specification stays approved; the pull request review is the approval of the change.

## 5. Drift: `nimaime diff`

Tests catch what the specification checks. `nimaime diff` looks the other way: it observes the
screen again, exactly as `nimaime draft` does, and compares it with the approved specification in
Sanmaime terms — `=` the same, `-` in the specification but not observed, `+` observed but not in
the specification, `!` stated differently:

```bash
npx nimaime diff specs/login.sanmaime https://staging.example.com/login
```

Run it on a schedule or after each deployment ([review-workflow.md](./review-workflow.md#ci) has a
workflow). Exit code 1 means the screen and the specification disagree: either the application
changed without its specification (update the specification in a pull request), or the application
broke. Exit code 2 means the comparison itself failed (the environment was down).

`nimaime diff` compares only what one observation can tell: elements, `Show:` / `Hide:` targets
and `Enable` / `Disable` outside `When:` blocks. It also compares **names**, so a specification whose names were
edited during the review reports each renamed target twice (`- Login button`, `+ Log in button`).
Keep it informational at first. For a quieter signal, keep the unedited draft as a baseline
(copy it before the review: `cp specs/login.sanmaime drafts/login.sanmaime`) and compare the screen
with that — the same command with the baseline as the first argument reports only what changed on
the screen since it was drafted. Two
`.sanmaime` files can be compared too (`nimaime diff specs/login.sanmaime drafts/login.sanmaime`).

When the screen has changed on purpose, re-draft it, review the differences, update the
specification in a pull request and approve it again: the loop starts over.

## Responsibilities

|                 | Proposes              | Decides                      | Enforces                       |
| --------------- | --------------------- | ---------------------------- | ------------------------------ |
| AI / `nimaime`  | drafts, drift reports | —                            | —                              |
| Humans          | edits, `When:` blocks | approval (`nimaime approve`) | code-owner review              |
| Playwright / CI | —                     | —                            | the approved spec, on every PR |

> **Let AI describe what exists.
> Let humans decide what should exist.
> Let Playwright make sure it stays that way.**

## Privacy and determinism

- An `--llm` adapter receives the observation, including the text on the screen. Only use a
  provider you may send that content to; draft from test data.
- Saved observations (`--observation`) are like screenshots: do not commit them if the screen
  shows real data.
- The rule-based draft is deterministic; an LLM draft is not. Either way, the approved `.sanmaime`
  file in Git — not the draft — is the source of truth.

---

See also: [draft.md](./draft.md) · [review-workflow.md](./review-workflow.md) ·
[cli.md](./cli.md) · [getting-started.md](./getting-started.md) ·
[documentation index](./README.md)
