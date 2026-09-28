# Expectation vocabulary

Sanmaime describes **what must be true on a screen**. Each expectation line is one requirement
of an element, and maps to exactly one Playwright web-first assertion. This page lists the
vocabulary (Sanmaime v0.3, "vocabulary v1"), explains the three shapes of expectation lines, and
states the policy for adding keywords. The normative grammar is in
[sanmaime.md](./sanmaime.md) (§3.5, §4, §5.5, §6, §7).

## The vocabulary

| Keyword (`en`) | `ja`         | Form                                          | Playwright            | `Expected:` (failure message, reporter)   |
| -------------- | ------------ | --------------------------------------------- | --------------------- | ----------------------------------------- |
| `Show:`        | `表示:`      | `Show: <target>`                              | `toBeVisible()`       | `<target> is shown`                       |
| `Hide:`        | `非表示:`    | `Hide: <target>`                              | `toBeHidden()`        | `<target> is hidden`                      |
| `And:`         | `かつ:`      | `And: <target>` (continues `Show:` / `Hide:`) | (the continued one)   | (the continued one)                       |
| `Enable`       | `有効`       | `Enable` / `Enable: <target>`                 | `toBeEnabled()`       | `enabled` / `<target> is enabled`         |
| `Disable`      | `無効`       | `Disable` / `Disable: <target>`               | `toBeDisabled()`      | `disabled` / `<target> is disabled`       |
| `Check`        | `チェック`   | `Check` / `Check: <target>`                   | `toBeChecked()`       | `checked` / `<target> is checked`         |
| `Uncheck`      | `未チェック` | `Uncheck` / `Uncheck: <target>`               | `not.toBeChecked()`   | `not checked` / `<target> is not checked` |
| `Focus`        | `フォーカス` | `Focus` / `Focus: <target>`                   | `toBeFocused()`       | `focused` / `<target> is focused`         |
| `Editable`     | `編集可`     | `Editable` / `Editable: <target>`             | `toBeEditable()`      | `editable` / `<target> is editable`       |
| `ReadOnly`     | `読取専用`   | `ReadOnly` / `ReadOnly: <target>`             | `not.toBeEditable()`  | `read-only` / `<target> is read-only`     |
| `Empty`        | `空`         | `Empty` / `Empty: <target>`                   | `toBeEmpty()`         | `empty` / `<target> is empty`             |
| `Text:`        | `テキスト:`  | `Text: <target> = "<text>"`                   | `toHaveText(text)`    | `<target> has text "<text>"`              |
| `Contain:`     | `含む:`      | `Contain: <target> = "<text>"`                | `toContainText(text)` | `<target> contains text "<text>"`         |
| `Count:`       | `件数:`      | `Count: <target> = <number>`                  | `toHaveCount(n)`      | `Count of <target> is <number>`           |

`Show:`, `Hide:`, `And:`, `Enable` and `Disable` are the v0 vocabulary; everything else, and the
target form of `Enable` / `Disable`, is new in v0.3.

```text
Screen: Settings

  Element: Header
    Text: Title = "Settings"
    Contain: Greeting = "Hello"
    Count: Tabs = 3

  Element: Remember Me Checkbox
    Enable
    Check

  Element: Account Form
    Uncheck: Newsletter
    ReadOnly: Account ID
    Empty: Notes

    When: The nickname is focused
    Focus: Nickname
    Enable: Save button
```

## Three shapes of expectation lines

The grammar stays line-oriented: every expectation is one line, and its keyword decides its
shape.

1. **Target keywords** — `Show: <target>`, `Hide: <target>`, `And: <target>`. The target is a
   name the element definition maps to a locator (`defineElement('Header', { Title: … })`).
2. **State keywords** — `Enable`, `Disable`, `Check`, `Uncheck`, `Focus`, `Editable`, `ReadOnly`,
   `Empty`.
   - **Alone on the line**, a state keyword is about the **element itself**: its `self` locator
     (`defineElement('Remember Me Checkbox', ({ page }) => page.getByLabel('Remember me'))`).
   - **With a colon and a target** (`Check: Remember me`), it is about that target of the
     element, like `Show:`.
   - A state keyword followed by an argument **without** a colon (`Check Remember me`) is
     `SANMAIME_E003`; with a colon but no target (`Check:`) it is `SANMAIME_E002`.
3. **Value keywords** — `Text:`, `Contain:`, `Count:` take a target, `=` and a value:
   - The target ends at the **first `=` that stands alone** (whitespace on both sides). A target
     therefore cannot contain a standalone `=` (it may contain `=` otherwise:
     `Text: A=b = "x"` is about `A=b`), and a text value can (`Text: Formula = "a = b"`).
   - A **text** (`Text:`, `Contain:`) is written in ASCII double quotes. Inside it, `\"` is a
     quote and `\\` a backslash; there are no other escapes. Japanese files use the same `"`
     quotes (full-width `“ ”` are not quotes).
   - A **number** (`Count:`) is a whole number written with ASCII digits: `0`, `1`, `42`.
   - No standalone `=` is `SANMAIME_E026`; a value that is not a valid text / number is
     `SANMAIME_E027`; an empty target is `SANMAIME_E002`.

`And:` continues only `Show:` / `Hide:` groups (§5.6). It does not continue value or state
keywords: `Text: A = "x"` / `And: B = "y"` would be ambiguous (is `And:` a `Text:` with a value,
or a `Show:`?), so any other keyword ends the group and a following `And:` is `SANMAIME_E007`.

`Text:` compares the whole text of the target (whitespace-normalised, like `toHaveText`);
`Contain:` a part of it (`toContainText`). `Count:` counts the elements the target's locator
matches (`toHaveCount`), so its locator may match several elements, unlike the others.

## One fact per line, once per block

The consistency rules of [sanmaime.md §6](./sanmaime.md#6-consistency-rules) are about **facts**.
Each keyword belongs to a **family**; opposite keywords share one:

| Family     | Keywords                 |
| ---------- | ------------------------ |
| visibility | `Show:`, `Hide:`, `And:` |
| enabled    | `Enable`, `Disable`      |
| checked    | `Check`, `Uncheck`       |
| editable   | `Editable`, `ReadOnly`   |
| focus      | `Focus`                  |
| empty      | `Empty`                  |
| text       | `Text:`                  |
| contain    | `Contain:` (per text)    |
| count      | `Count:`                 |

- `E014`: a block states each (target, family) at most once: `Check: X` + `Uncheck: X` or two
  `Text: X` are errors, `Show: X` + `Text: X = "…"` is fine. Two `Contain: X` lines with
  different texts are two facts; the same text twice is `E014`.
- `E015`: a block states each family of the element itself at most once: `Enable` + `Disable` or
  `Check` + `Uncheck` are errors, `Enable` + `Check` is fine.
- `E016`: a `When:` block must not repeat (or contradict) a fact of the element's unconditional
  block, family by family.

## Where the vocabulary lives

The vocabulary is **one table**: `EXPECTATIONS` in
[`src/runtime/expectations.ts`](../src/runtime/expectations.ts) (exported by
`nimaime-han/runtime`). Each entry gives:

| Field              | Example (`check`)                 | Used by                                                         |
| ------------------ | --------------------------------- | --------------------------------------------------------------- |
| `kind`             | `'check'`                         | the AST, generated plans (`{ kind: 'check', target? }`), JSON   |
| `keyword`          | `'Check'`                         | step titles (`Check: Remember me`), the AST's canonical keyword |
| `slot`             | `'check'`                         | the language dictionaries (`src/parser/languages.ts`)           |
| `arity`            | `'optional-target'`               | the parser (which line shapes are valid)                        |
| `valueType`        | — (`'text'` / `'int'` for values) | the parser (E027), the runtime (plan validation)                |
| `family`           | `'checked'`                       | the consistency rules (E014–E016)                               |
| `playwright`       | `'toBeChecked()'`                 | documentation, the table test                                   |
| `matcher`          | `expect(l).toBeChecked()`         | the runtime (`$nimaime`)                                        |
| `describeExpected` | `Remember me is checked`          | failure messages (`Expected:`), the reporter                    |
| `parseExpected`    | the reverse                       | `parseExpectationFailure()` (reporters only receive messages)   |
| `probeActual`      | `checked` / `not checked`         | failure messages (`Actual:`)                                    |

The parser's keyword lists, the E001 message, the generator, the runtime's dispatch
(`$nimaime.check()`), the failure messages and their parser, the reporter, the definition
snippets and `nimaime diff` all read this table; `test/runtime/expectations.test.ts` checks that
every entry is complete, and `test/editors/grammar.test.ts` that the editor grammar agrees with it.

## Policy: keep it readable as a specification

Sanmaime is read by people who decide what a screen must do. A keyword belongs in the
vocabulary only if all of these hold:

1. **It reads as a requirement.** `Check: Remember me` and `Count: Results = 3` are sentences a
   product owner can approve. A keyword that needs the reader to know the DOM, CSS or the
   framework does not qualify.
2. **It maps 1:1 to a Playwright web-first assertion** on a locator (`toBeChecked()`, or its
   negation). No custom logic, no combination of assertions, no options that change its meaning
   (timeouts, `useInnerText`, …) — those belong in the TypeScript definitions.
3. **It does not encode implementation details.** No attribute names, CSS classes or properties
   (`toHaveClass`, `toHaveCSS`, `toHaveAttribute`, `toHaveJSProperty` are deliberately **not**
   part of the vocabulary), no regular expressions, no screenshots. When a requirement needs such
   a check, name the requirement instead (a target or a condition) and implement it in the
   definitions.
4. **It is a new fact, not a synonym.** Opposites share a family (`Check` / `Uncheck`), so the
   one-fact-per-block rules keep working.

Not included for these reasons (for now): `toHaveValue` / `toHaveValues` (form values are
usually a condition's input, not the screen's requirement), `toHaveAttribute`, `toHaveClass`,
`toHaveCSS`, `toHaveId`, `toHaveJSProperty`, `toHaveScreenshot`, `toBeAttached`,
`toBeInViewport`, `toHaveAccessibleName` / `Description`, `toHaveRole`. Each can be proposed
again with a use case that satisfies the policy.

### Proposing a keyword

1. Open an issue with the requirement it expresses (a sentence from a real specification), the
   Playwright matcher, the English and Japanese spellings, its shape (target, state, value) and
   family, and its `Expected:` phrasing.
2. Implement it: an entry in `EXPECTATIONS`, a slot in `LanguageKeywords` with a spelling in every
   language (`src/parser/languages.ts`), the grammar slot lists of
   `editors/vscode-sanmaime/scripts/grammar.ts` (then `npm run build:grammar`), valid and
   invalid fixtures under `examples/sanmaime/`, and this page, [sanmaime.md](./sanmaime.md) and
   [i18n.md](./i18n.md). The table test tells what is missing.
3. A new keyword is a new language version (a minor release): files that do not use it keep
   their meaning, since any unknown `Word:` line was an error before (§8).

## 日本語サマリ

- 期待語彙 v1(Sanmaime v0.3)は `テキスト:` `含む:` `件数:`(値つき)と、`チェック` `未チェック` `フォーカス` `編集可` `読取専用` `空`(状態)を追加し、状態キーワード(`有効` `無効` を含む)は `チェック: 対象` のように対象を取れる。単独なら要素自身(`self` ロケーター)についての期待。
- 値つきの形は `テキスト: <対象> = "<文字列>"` / `件数: <対象> = <数>`。対象と値は最初の「前後に空白のある `=`」で分ける。文字列は半角の `"` で囲み、`\"` と `\\` だけがエスケープ。値がないと E026、値が不正だと E027。
- `かつ:` は `表示:` / `非表示:` だけを引き継ぐ。
- 同じブロックで同じ対象・同じ系統(表示/有効/チェック/編集/…)の事実は 1 回だけ(E014)。要素自身の状態は系統ごとに 1 回(E015)。
- キーワードとマッチャの対応は `src/runtime/expectations.ts` の `EXPECTATIONS` 1 か所に集約している。
- 語彙を増やす条件: 仕様として読めること、Playwright のマッチャに 1 対 1 で対応すること、実装の詳細(属性名・CSS など)を含まないこと。
