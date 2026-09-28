# Changelog

## Unreleased

- Sanmaime v0.3 (expectation vocabulary v1): the state keywords `Check`, `Uncheck`, `Focus`,
  `Editable`, `ReadOnly`, `Empty` (`チェック` `未チェック` `フォーカス` `編集可` `読取専用` `空`)
  are highlighted like `Enable` / `Disable`, alone or with a target (`Check: Remember me`;
  `Enable: X` is no longer marked invalid). The value keywords `Text:`, `Contain:`, `Count:`
  (`テキスト:` `含む:` `件数:`) are highlighted with their target, `=` and value (a quoted text or a
  number); invalid values and a missing `=` are marked.

- Sanmaime v0.2: `Background:` (`背景:`) and `And when:` (`かつ条件:`) are highlighted as condition
  keywords; `Background:` is no longer marked as reserved.

## 0.0.1

- Initial version: the `sanmaime` language for `*.sanmaime` files, a TextMate grammar generated
  from the Nimaime-Han keyword dictionaries (English and Japanese), `#` line comments and
  indentation-based folding.
