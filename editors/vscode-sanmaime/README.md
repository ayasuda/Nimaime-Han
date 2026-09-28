# Sanmaime for Visual Studio Code

Syntax highlighting for [Sanmaime](https://github.com/ayasuda/Nimaime-Han/blob/main/docs/sanmaime.md)
(`.sanmaime`), the screen-specification language of
[Nimaime-Han](https://github.com/ayasuda/Nimaime-Han) — what the Cucumber extension is for
`.feature` files in playwright-bdd projects.

```text
# language: ja
@smoke
画面: ログイン

  要素: ログインフォーム
    表示: メールアドレス
    かつ: パスワード

  要素：ログインボタン
    条件：入力が正しい
    有効
```

## Features

- Highlights keywords (`Screen:`, `Background:`, `Element:`, `When:`, `And when:`, `Show:`,
  `Hide:`, `And:`, the state keywords `Enable`, `Disable`, `Check`, `Uncheck`, `Focus`,
  `Editable`, `ReadOnly`, `Empty` — alone or with a target — and the value keywords `Text:`,
  `Contain:`, `Count:`), names and targets, text and number values, comments, tags and the
  `# language:` directive.
- All keyword languages (English and Japanese, with the full-width colon `：`). A
  `# language: xx` directive restricts highlighting to that language's keywords.
- Marks unknown keywords (`Given:`) and invalid values (`Count: Items = three`) so typos stand
  out.
- `#` line comments, indentation-based folding, Japanese-aware word selection.

The extension contains no code. Diagnostics, go-to-definition and completion are planned for a
language server.

## Installation

Not published to the Marketplace yet. From a checkout of the Nimaime-Han repository:

```bash
cd editors/vscode-sanmaime
npx @vscode/vsce package --skip-license
code --install-extension vscode-sanmaime-*.vsix
```

See [docs/editors.md](https://github.com/ayasuda/Nimaime-Han/blob/main/docs/editors.md) for a
symlink-based setup, the list of scopes and how the grammar is generated, and
[Getting started](https://github.com/ayasuda/Nimaime-Han/blob/main/docs/getting-started.md) to
write and run a first `.sanmaime` specification.

## Development

`syntaxes/sanmaime.tmLanguage.json` is generated from the parser's keyword dictionaries. Do not
edit it by hand; from the repository root run:

```bash
npm run build:grammar
npm test -- test/editors
```
