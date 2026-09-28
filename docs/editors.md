# Editor support

Nimaime-Han ships a TextMate grammar for `.sanmaime` files and a small VS Code extension that
contributes it, the way playwright-bdd users rely on the Cucumber extension for `.feature` files.
The extension lives in this repository under
[`editors/vscode-sanmaime/`](../editors/vscode-sanmaime/). It may move to a repository of its own
once it grows a language server (see [Roadmap](#roadmap-language-server)); the grammar itself will
keep being generated from this repository's keyword dictionaries.

What it provides today:

- the `sanmaime` language for `*.sanmaime` files;
- syntax highlighting of keywords, names, targets, comments, tags and the `# language:` directive,
  in every keyword language (English and Japanese, including the full-width colon `：`);
- `#` line comments (`Ctrl+/` / `Cmd+/`), indentation-based folding and a word pattern that treats
  Japanese text as words.

It contains no code: no activation, no dependencies, no telemetry.

## Installing locally

The extension is not on the Marketplace yet. Install it from a checkout of this repository.

### From a `.vsix` package

```bash
cd editors/vscode-sanmaime
npx @vscode/vsce package --skip-license   # writes vscode-sanmaime-<version>.vsix
code --install-extension vscode-sanmaime-*.vsix
```

`--skip-license` is needed because the license file is at the repository root (the extension is
MIT-licensed like the rest of Nimaime-Han). Reload the VS Code window after installing.

### As a symbolic link (for grammar development)

VS Code loads unpacked extensions from `~/.vscode/extensions`:

```bash
ln -s "$PWD/editors/vscode-sanmaime" ~/.vscode/extensions/nimaime-han.vscode-sanmaime
```

(`%USERPROFILE%\.vscode\extensions` on Windows; `~/.vscode-insiders/extensions` for Insiders;
`~/.vscode-oss/extensions` for VSCodium.) Run **Developer: Reload Window** after every grammar
change. **Developer: Inspect Editor Tokens and Scopes** shows the scopes under the cursor.

Other editors that read TextMate grammars (Sublime Text, JetBrains IDEs via the TextMate Bundles
plugin, GitHub Linguist-style tools, Shiki) can use
[`syntaxes/sanmaime.tmLanguage.json`](../editors/vscode-sanmaime/syntaxes/sanmaime.tmLanguage.json)
directly; its root scope is `source.sanmaime`.

## How the grammar works

The grammar follows the line classification of [sanmaime.md §3.8](./sanmaime.md#38-line-classification):
every rule matches one whole line, leading and trailing whitespace (including the full-width space
`U+3000` and a BOM) is ignored, and indentation has no meaning.

The keyword language is chosen like the parser does it ([i18n.md](./i18n.md)), as far as an editor
can know it:

| File header                                     | Keywords highlighted                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `# language: ja` (a supported code)             | only that language's keywords; `Screen:` in a `ja` file is marked as an unknown keyword      |
| no directive, or an unsupported one (`E017`)    | the keywords of **every** language, because the default comes from the project configuration |
| a `# language:` line after the header, or later | an ordinary comment, as in the parser                                                        |

The grammar is **generated** from the parser's dictionaries in `src/parser/languages.ts`, so a new
language or synonym only needs:

```bash
npm run build:grammar
```

`editors/vscode-sanmaime/scripts/grammar.ts` builds the grammar (pure function),
`scripts/build-grammar.ts` writes `syntaxes/sanmaime.tmLanguage.json` (formatted with Prettier;
`--check` only verifies it). The generated file is committed. `test/editors/grammar.test.ts` fails
when it is out of date, and tokenizes every fixture of `examples/sanmaime/` with the engine VS Code
uses (`vscode-textmate` + `vscode-oniguruma`), checking each line against the parser's lexer.

## Scopes

| Syntax                                                                                                                                                                                                | Scope                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| comment line `# …`                                                                                                                                                                                    | `comment.line.number-sign.sanmaime` (`#`: `punctuation.definition.comment.sanmaime`) |
| `# language: ja` in the header                                                                                                                                                                        | `meta.language.sanmaime`                                                             |
| &nbsp;&nbsp;`language`                                                                                                                                                                                | `keyword.other.language.sanmaime`                                                    |
| &nbsp;&nbsp;`ja` (supported)                                                                                                                                                                          | `constant.language.sanmaime`                                                         |
| &nbsp;&nbsp;`xx` (unsupported, `E017`)                                                                                                                                                                | `invalid.illegal.language.sanmaime`                                                  |
| tag line                                                                                                                                                                                              | `meta.tags.sanmaime`                                                                 |
| &nbsp;&nbsp;`@smoke`                                                                                                                                                                                  | `entity.name.tag.sanmaime` (`@`: `punctuation.definition.tag.sanmaime`)              |
| &nbsp;&nbsp;any other token (`E020`)                                                                                                                                                                  | `invalid.illegal.tag.sanmaime`                                                       |
| `Screen:` `Element:` (`画面:` `要素:`)                                                                                                                                                                | `keyword.control.structure.sanmaime`                                                 |
| &nbsp;&nbsp;their name                                                                                                                                                                                | `entity.name.section.sanmaime`                                                       |
| `Background:` `When:` `And when:` (`背景:` `条件:` `かつ条件:`)                                                                                                                                       | `keyword.control.condition.sanmaime`                                                 |
| &nbsp;&nbsp;the condition name                                                                                                                                                                        | `entity.name.function.sanmaime`                                                      |
| `Show:` `Hide:` `And:` (`表示:` `非表示:` `かつ:`)                                                                                                                                                    | `keyword.operator.expectation.sanmaime`                                              |
| &nbsp;&nbsp;the target                                                                                                                                                                                | `string.unquoted.target.sanmaime`                                                    |
| the colon of a keyword (`:` or `：`)                                                                                                                                                                  | `punctuation.separator.key-value.sanmaime` (inside the keyword scope)                |
| state keywords `Enable` `Disable` `Check` `Uncheck` `Focus` `Editable` `ReadOnly` `Empty` (`有効` `無効` `チェック` `未チェック` `フォーカス` `編集可` `読取専用` `空`), alone or before `: <target>` | `keyword.operator.state.sanmaime` (the target: `string.unquoted.target.sanmaime`)    |
| `Text:` `Contain:` `Count:` (`テキスト:` `含む:` `件数:`) (v0.3)                                                                                                                                      | `keyword.operator.expectation.sanmaime`                                              |
| &nbsp;&nbsp;the target                                                                                                                                                                                | `string.unquoted.target.sanmaime`                                                    |
| &nbsp;&nbsp;the `=` between target and value                                                                                                                                                          | `keyword.operator.assignment.sanmaime`                                               |
| &nbsp;&nbsp;a text value `"…"` / a number value                                                                                                                                                       | `string.quoted.double.sanmaime` / `constant.numeric.integer.sanmaime`                |
| &nbsp;&nbsp;an invalid value (`E027`)                                                                                                                                                                 | `invalid.illegal.value.sanmaime`                                                     |
| &nbsp;&nbsp;an argument without a standalone `=` (`E026`)                                                                                                                                             | `invalid.illegal.missing-value.sanmaime`                                             |
| name keyword without a name, e.g. `Show:` (`E002`)                                                                                                                                                    | `invalid.illegal.missing-name.sanmaime`                                              |
| `Enable X` (a state keyword and an argument without colon, `E003`)                                                                                                                                    | `invalid.illegal.sanmaime`                                                           |
| any other `Word:` at the start of a line (`E001`)                                                                                                                                                     | `invalid.illegal.sanmaime` (`Given:`, `show:`, `Show：` in an English file, …)       |

Other lines (for example free text, which is `E001` too) are left unscoped. The grammar only
highlights: structural errors such as `Element:` outside a `Screen:` are reported by
`nimaime-gen check` ([cli.md](./cli.md)).

## Roadmap: language server

The next step (listed as future work in issue #22) is a language server bundled with the
extension. It needs no new parsing code: the parser (`nimaime-han/parser`) is a pure function that
never throws and returns positions for every node and diagnostic.

- **Diagnostics while typing**: run `parse()` on every change and publish its `SANMAIME_Ennn`
  diagnostics (line/column are already 1-based code-point positions), using the project's
  `language` from `defineSanmaimeConfig()` as the default.
- **Undefined names**: load the project's definitions like `nimaime-gen check` does and report
  screens, elements, targets and conditions without a definition (`matchSpecs()` in `src/gen`), with
  a quick fix that inserts the `defineElement` / `defineCondition` snippet.
- **Go to definition / find references**: from a name in a `.sanmaime` file to the
  `defineScreen` / `defineElement` / `defineCondition` call (the registry records each call site),
  and back.
- **Completion** of keywords (in the file's language) and of names known from the definitions.
- **Formatting** that normalises indentation (sanmaime.md §9).
