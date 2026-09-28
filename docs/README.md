# Nimaime-Han documentation

Nimaime-Han is to Sanmaime what playwright-bdd is to Gherkin: you describe what a screen must show
in `.sanmaime` files, bind the names to your application in TypeScript, and `nimaime-gen` turns the
specifications into Playwright tests. The [README](../README.md) explains why; these pages explain
how.

## Start here

| Page                                    | What it covers                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [Getting started](./getting-started.md) | Install, configure `playwright.config.ts`, write a first `.sanmaime` file and its definitions, run it. |
| [examples/basic](../examples/basic)     | A runnable project: the README's Login and User Details screens, in English and Japanese.              |

## Language

| Page                                        | What it covers                                                                                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [Sanmaime language](./sanmaime.md)          | The normative specification (v0.3): lexical rules, grammar, semantics, `Background:` / `And when:`, tags, `# status:`, diagnostics codes. |
| [Expectation vocabulary](./expectations.md) | Every expectation keyword (`Show:`, `Enable`, `Check`, `Text:`, `Count:`, …), its Playwright assertion, and the policy for new ones.      |
| [Keyword languages (i18n)](./i18n.md)       | `# language: ja`, the Japanese keywords, the dictionaries and how to add a language.                                                      |

## Definitions and runtime

| Page                            | What it covers                                                                                                        |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [Configuration](./config.md)    | `defineSanmaimeConfig()` in `playwright.config.ts`: every option, several projects, validation.                       |
| [Definitions](./definitions.md) | `createNimaime(test)`: `defineScreen`, `defineElement` (targets and `self`), `defineCondition`, scopes, the registry. |
| [Hooks](./hooks.md)             | `beforeScreen` / `afterScreen` / `beforeElement` / `afterElement`: scopes, order, fixtures, generated code.           |
| [Runtime](./runtime.md)         | The `$nimaime` fixture, plans, step titles, failure messages, `$tags`.                                                |
| [Reporter](./reporter.md)       | `nimaime-han/reporter`: the ✓/✗ tree of screens, elements and expectations, and its options.                          |
| [API reference](./api.md)       | Every export of `nimaime-han`, `nimaime-han/runtime`, `nimaime-han/parser` and `nimaime-han/reporter`.                |

## Tools

| Page                           | What it covers                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| [CLI](./cli.md)                | `nimaime-gen` (generate / export / check, `--tags`, `--allow-missing`, snippets, generated files) and `nimaime`. |
| [Drafts](./draft.md)           | `nimaime draft`: observe a live screen and propose a Sanmaime draft, rule-based or with an LLM adapter.          |
| [Editor support](./editors.md) | The VS Code extension and TextMate grammar for `.sanmaime` files.                                                |

## Workflows

| Page                                                            | What it covers                                                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [AI workflow](./ai-workflow.md)                                 | Draft → review → approve → regression tests → drift checks, and how to run it in pull requests and CI. |
| [Review workflow](./review-workflow.md)                         | The `# status:` directive, `nimaime approve` and `nimaime diff` in detail.                             |
| [Using Sanmaime with Gherkin](./with-gherkin.md)                | playwright-bdd scenarios whose `Then` steps verify screens with `$nimaime.verify()`.                   |
| [examples/with-playwright-bdd](../examples/with-playwright-bdd) | A runnable playwright-bdd project using Sanmaime.                                                      |

## Contributing

| Page                               | What it covers                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| [CONTRIBUTING](../CONTRIBUTING.md) | Design principle, development setup, checks, commits, changesets.                        |
| [Tests](./contributing-tests.md)   | The test layers, the tool test cases and their harness, the Playwright version matrix.   |
| [Releasing](./releasing.md)        | Versioning policy (0.x), changesets, the release workflow, checking the package locally. |
| [CHANGELOG](../CHANGELOG.md)       | Released versions.                                                                       |

## About these pages

The documentation is plain Markdown, readable on GitHub as it is. It uses only relative links and
no generator-specific syntax, so it can be published later with any static site generator (for
example on GitHub Pages) without rewriting the pages.
