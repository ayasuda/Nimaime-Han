---
'nimaime-han': minor
---

Sanmaime v0.2: shared and combined conditions.

- `Background: <condition>` (`背景:`) directly under `Screen:` establishes conditions for every block of every element of the screen, after the screen is opened and before the block's own conditions (like Gherkin's `Background:`). `Background:` is no longer reserved (`SANMAIME_E019` is retired).
- `And when: <condition>` (`かつ条件:`) after `When:` combines conditions; the test is titled `When: A and B`.
- New diagnostics `SANMAIME_E021` (expectations under `Background:`), `SANMAIME_E022` (a condition established twice), `SANMAIME_E023` (misplaced `And when:`) and `SANMAIME_E025` (misplaced `Background:`).
- Generated plans now carry `background: [...]` and `conditions: [...]` (the runtime still accepts `condition`); `$nimaime.run` runs the steps `Background: B`, `When: A`, `And when: C`; the reporter prints a screen's background under it; the editor grammar highlights the new keywords.
