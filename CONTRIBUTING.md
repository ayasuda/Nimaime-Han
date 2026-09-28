# Contributing to Nimaime-Han

Thanks for helping! Nimaime-Han is experimental, so issues that question the design are as welcome
as pull requests. For anything larger than a fix, please open an issue first so the approach can be
agreed before you write the code.

## Design principle

> **Nimaime-Han : Sanmaime = playwright-bdd : Gherkin**

Nimaime-Han follows the shape of [playwright-bdd](https://github.com/vitalets/playwright-bdd), with
Sanmaime (screen specifications) in place of Gherkin (scenarios). When you design a feature, first
ask how playwright-bdd does the equivalent thing and keep the same shape unless there is a reason
not to:

| playwright-bdd / Gherkin                      | Nimaime-Han / Sanmaime                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| `.feature` file                               | `.sanmaime` file                                                             |
| `@cucumber/gherkin` parser                    | Sanmaime parser (`nimaime-han/parser`, pure functions)                       |
| `defineBddConfig()` in `playwright.config.ts` | `defineSanmaimeConfig()` in `playwright.config.ts`                           |
| `bddgen` CLI (`.feature` → `.spec.js`)        | `nimaime-gen` CLI (`.sanmaime` → `.spec.ts`)                                 |
| `.features-gen/`                              | `.sanmaime-gen/`                                                             |
| `createBdd(test)` → `Given` / `When` / `Then` | `createNimaime(test)` → `defineScreen` / `defineElement` / `defineCondition` |
| step definitions                              | element definitions (locators) and condition definitions (state setup)       |
| missing step snippets                         | missing element / condition snippets                                         |
| Gherkin i18n keywords                         | Sanmaime i18n keywords                                                       |
| Cucumber reporter                             | Sanmaime reporter (✓/✗ tree)                                                 |

Two rules follow from the README's philosophy:

- **Sanmaime says what must be true, never how.** No selectors, no DOM structure and no Playwright
  code in `.sanmaime` files; those live in TypeScript definitions.
- **Playwright stays in charge.** Nimaime-Han generates ordinary Playwright tests; browsers,
  fixtures, retries, traces and parallelism are Playwright's.

The language is specified normatively in [docs/sanmaime.md](docs/sanmaime.md). A change to the
syntax or semantics changes that document first, in the same pull request.

## Development setup

You need **Node.js 22** or later and npm.

```bash
git clone https://github.com/ayasuda/Nimaime-Han.git
cd Nimaime-Han
npm ci
npm run build
```

End-to-end tests need Chromium for Playwright: `npx playwright install chromium` (add `--with-deps`
on a fresh Linux machine).

## Checks

Run these before you push; CI runs all of them on every pull request.

```bash
npm run lint           # ESLint (typed rules)
npm run format:check   # Prettier (use `npm run format` to fix)
npm run typecheck      # tsc --noEmit
npm test               # unit tests (vitest)
npm run build          # tsup → dist/ (ESM + CJS + .d.ts)
```

### Test layers

| Layer              | Command                      | What it covers                                                                                                     |
| ------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Unit               | `npm test`                   | Parser, config, generator, runtime, reporter and editor grammar as functions (`test/**/*.test.ts`, vitest).        |
| End-to-end runtime | `npm run test:e2e`           | The runtime and reporter inside real Playwright runs against a small app (`test/e2e/`).                            |
| End-to-end gen     | `npm run test:e2e:gen`       | Builds, runs the `nimaime-gen` CLI from `dist/` on `test/e2e/gen`, then Playwright on the generated specs.         |
| Examples           | `npm run test:example:basic` | Installs `examples/basic` against a packed copy of this package and runs its specs and typecheck, as a user would. |
| Package            | `npm pack --dry-run`         | What would be published ([docs/releasing.md](docs/releasing.md#checking-the-package-locally)).                     |

Every new module gets unit tests. Changes to generated code or runtime behaviour also need an
end-to-end test; changes a user would see belong in an example as well.

The examples under `examples/` are self-contained projects (their own `package.json` and
`tsconfig.json`, depending on `"nimaime-han": "file:../.."`); the root lint, typecheck and unit
tests ignore them.

If you change the keywords in `src/parser/languages.ts`, regenerate the TextMate grammar with
`npm run build:grammar` (unit tests fail when it is stale).

## Commits and pull requests

- Branch from `main`; one topic per pull request. Reference the issue it resolves (`Closes #12`).
- Commit messages: a short imperative subject line (`Add --format compact to nimaime-gen`),
  optionally followed by a blank line and a body explaining why. When a commit implements an issue,
  end the subject with the issue number, e.g. `Report missing definitions with snippets (#11)`.
- Keep the public API documented: user-facing behaviour is described in `docs/` and changes there
  in the same pull request.
- Add a changeset if the change affects users of the package (see below).

## Changesets

Releases are made with [Changesets](https://changesets.dev). If your pull request changes anything a
user of `nimaime-han` would notice — the Sanmaime language, an export, the CLI, the configuration,
generated code or the reporter output — add a changeset:

```bash
npm run changeset
```

Pick the bump type with the **0.x rule**: while Nimaime-Han is experimental,

- **minor** = breaking change (`0.3.4 → 0.4.0`),
- **patch** = new feature or bug fix (`0.3.4 → 0.3.5`),
- **never major** (that would publish 1.0.0).

Write the summary for users: it goes verbatim into [CHANGELOG.md](CHANGELOG.md) and the GitHub
release. Pull requests that only touch tests, CI, examples or repository docs need no changeset.

Do not edit `version` in package.json, `src/version.ts` or CHANGELOG.md by hand, and do not run
`npm version`; the release workflow does this. The whole process, including the one-time repository
setup, is described in [docs/releasing.md](docs/releasing.md).

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
