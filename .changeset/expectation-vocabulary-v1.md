---
'nimaime-han': minor
---

Sanmaime v0.3: the expectation vocabulary v1 (docs/expectations.md).

- Value keywords `Text: <target> = "<text>"` (`toHaveText`), `Contain: <target> = "<text>"` (`toContainText`) and `Count: <target> = <number>` (`toHaveCount`); Japanese `テキスト:` `含む:` `件数:`. The target ends at the first `=` with whitespace on both sides; texts are double-quoted with `\"` and `\\` escapes. New diagnostics `SANMAIME_E026` (no value) and `SANMAIME_E027` (invalid value).
- State keywords `Check` / `Uncheck` (`toBeChecked` / `not.toBeChecked`), `Focus` (`toBeFocused`), `Editable` / `ReadOnly` (`toBeEditable` / `not.toBeEditable`) and `Empty` (`toBeEmpty`); Japanese `チェック` `未チェック` `フォーカス` `編集可` `読取専用` `空`. Alone they are about the element itself (its `self` locator), like `Enable` / `Disable`.
- Every state keyword, `Enable` and `Disable` included, also takes a target after a colon: `Check: Remember me`, `Enable: Login button` (previously `SANMAIME_E003`; `Enable X` without a colon still is, `Enable:` is now `SANMAIME_E002`).
- The one-fact rules are per family: `E014` for the same target and family twice in a block (`Show: X` + `Text: X = "…"` is fine, `Check: X` + `Uncheck: X` is not), `E015` for two states of one family of the element itself (`Check` + `Uncheck`), `E016` likewise against the unconditional block.
- The keyword → matcher mapping is one table, `EXPECTATIONS` (exported from `nimaime-han/runtime`), used by the parser, the generator (plans carry `{ kind, target?, value? }`), `$nimaime.check()`, failure messages (`Expected: Title has text "Welcome"`, `Count of Items is 3`, `Remember me is checked`) and `parseExpectationFailure()`, the reporter, definition snippets, `nimaime diff` (new kinds are listed as not compared) and the editor grammar.
