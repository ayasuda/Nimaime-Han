---
'nimaime-han': minor
---

First experimental release of Nimaime-Han: screen specification testing for Playwright with the Sanmaime DSL.

- **Sanmaime parser** (`nimaime-han/parser`): `parse(source)` returns a typed AST (Screen, Element, When, Show/Hide/And/Enable/Disable) and located diagnostics `SANMAIME_E001`..`SANMAIME_E020`; never throws. The language is specified in `docs/sanmaime.md`.
- **Internationalised keywords**: English and Japanese (`# language: ja`, `画面:` / `要素:` / `条件:` / `表示:` / `非表示:` / `かつ:` / `有効` / `無効`).
- **Configuration**: `defineSanmaimeConfig()` in `playwright.config.ts` (specs, definitions, output directory, language, tags, `importTestFrom`).
- **Definitions**: `createNimaime(test)` with `defineScreen`, `defineElement` and `defineCondition` bind Sanmaime names to Playwright locators and state setup.
- **Generator CLI** `nimaime-gen` (`generate`, `export`, `check`): turns `.sanmaime` files into Playwright specs under `.sanmaime-gen/`, reporting missing definitions with ready-to-paste snippets (`--allow-missing`, `--format pretty|compact`).
- **Runtime** (`nimaime-han/runtime`): the `$nimaime` fixture runs each block as Playwright steps and fails with a Sanmaime-shaped message (Screen / Element / When / Expected / Actual / Location).
- **Reporter** (`nimaime-han/reporter`): prints results as a ✓/✗ Screen > Element > When tree.
- Repository extras (not part of the npm package): the `examples/basic` sample project and a VS Code TextMate grammar for `.sanmaime` files (`editors/vscode-sanmaime`).

The project is experimental: while the version is 0.x, breaking changes are released as minor versions.
