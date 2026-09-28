# Sanmaime Language Specification — v0

> Status: **draft v0**. This document is the reference for the Sanmaime parser,
> the `nimaime-gen` generator, editor grammars and AI generators. Where this
> document and an implementation disagree, the implementation is wrong (or this
> document must be changed first).

Sanmaime (三枚目) is the screen-specification language used by Nimaime-Han.
It plays the same role for Nimaime-Han that Gherkin plays for playwright-bdd:
a small, line-oriented, human-readable language whose files are parsed and
turned into Playwright tests.

Sanmaime describes **what must be true on a screen**. It never contains
selectors, DOM structure or Playwright code; those live in TypeScript
definitions that bind Sanmaime names to the application.

## Contents

1. [Overview](#1-overview)
2. [File format](#2-file-format)
3. [Lexical structure](#3-lexical-structure)
4. [Grammar (EBNF)](#4-grammar-ebnf)
5. [Semantics](#5-semantics)
6. [Consistency rules](#6-consistency-rules)
7. [Diagnostics](#7-diagnostics)
8. [Reserved syntax and future extensions](#8-reserved-syntax-and-future-extensions)
9. [Recommended style](#9-recommended-style)
10. [Suggested AST (non-normative)](#10-suggested-ast-non-normative)
11. [Full worked example](#11-full-worked-example)
12. [Test fixtures](#12-test-fixtures)
13. [Design decisions](#13-design-decisions)
14. [日本語サマリ](#14-日本語サマリ)

The key words MUST, MUST NOT, SHOULD and MAY are used as in RFC 2119.

---

## 1. Overview

A Sanmaime file contains one or more **screens**. A screen contains
**elements**. An element contains **expectations**, optionally grouped into
**condition blocks** introduced by `When:`.

```text
Screen: User Details

  Element: User Information

    When: Viewing your own profile
    Show: Username
    And: Full name
    And: Email address

    When: Viewing another user's profile
    Show: Username
    Hide: Full name
    And: Email address
```

Read it as:

- On the **User Details** screen,
- the **User Information** element,
- *when viewing your own profile*, shows Username, Full name and Email address;
- *when viewing another user's profile*, shows Username and hides Full name
  and Email address.

The complete keyword set of v0 is:

| Keyword    | Takes a name | Introduces / means                                              |
|------------|--------------|-----------------------------------------------------------------|
| `Screen:`  | yes          | a screen                                                        |
| `Element:` | yes          | an element of the current screen                                |
| `When:`    | yes          | a condition block of the current element                        |
| `Show:`    | yes          | expectation: the named target is visible                        |
| `Hide:`    | yes          | expectation: the named target is not visible                    |
| `And:`     | yes          | expectation: same kind as the preceding `Show:` / `Hide:`       |
| `Enable`   | no           | expectation: the current element itself is enabled             |
| `Disable`  | no           | expectation: the current element itself is disabled             |

---

## 2. File format

| Property        | Rule |
|-----------------|------|
| Extension       | `.sanmaime` (for example `user-details.sanmaime`). |
| Encoding        | UTF-8. A leading byte order mark (U+FEFF) MUST be ignored. Decoding is the loader's job; invalid UTF-8 is an I/O error, not a Sanmaime diagnostic. |
| Line breaks     | LF, CRLF and a lone CR are all accepted, and may be mixed. The last line does not need a line break. |
| Screens per file| One or more. A file that contains only blank lines and comments is valid and describes no screens. |
| File naming     | Not significant. Recommended: one screen per file, file named after the screen in kebab-case. |

---

## 3. Lexical structure

Sanmaime is **line-oriented**. Each physical line is classified on its own,
then the sequence of classified lines is checked against the grammar in §4.

### 3.1 Whitespace and indentation

*Whitespace* means exactly the characters removed by ECMAScript
`String.prototype.trim()`: U+0009 TAB, U+000B, U+000C, U+0020 SPACE,
U+00A0, U+FEFF, every character of Unicode general category `Zs`
(including U+3000 IDEOGRAPHIC SPACE), and line terminators.

Before classification every line is **trimmed**: leading and trailing
whitespace is removed.

**Indentation is not significant.** Structure is determined only by the
order of keywords (Screen > Element > When > expectations). Spaces, tabs,
full-width spaces or no indentation at all are equally valid. Indentation is
a readability convention (§9) that a future formatter will normalise.

### 3.2 Blank lines

A line that is empty after trimming is a **blank line**. Blank lines are
ignored everywhere and never end a block.

### 3.3 Comments

A line whose first non-whitespace character is `#` is a **comment line** and
is ignored (apart from the language directive, §3.4).

There are **no trailing comments**: a `#` anywhere else is an ordinary
character. `Show: Order #1234` names the target `Order #1234`.

### 3.4 Language directive

A comment line of the form

```text
# language: en
```

that appears **before the first significant line** (the *header*: only
blank and comment lines may precede it) is a **language directive**. It
selects the keyword language of the file. Precisely, after trimming, the
line is a directive when it matches:

```text
^#[ws]*language[ws]*:[ws]*(.*)$        (the captured value is trimmed)
```

- v0 defines only the language `en`, which is also the default when no
  directive is present.
- An unsupported (or empty) value is error `SANMAIME_E017`.
- A second directive in the header is error `SANMAIME_E017`.
- After the header, a `# language:` line is an ordinary comment.

Additional languages (Japanese first) are specified by issue #5. They change
only the keyword spellings, never the structure.

### 3.5 Keywords

Keywords are **case-sensitive** and must be spelled exactly as in the table
in §1.

- A **name keyword** (`Screen:`, `Element:`, `When:`, `Show:`, `Hide:`,
  `And:`) matches when the trimmed line **starts with** the keyword
  including its colon. There is no whitespace between the word and the
  colon. Whitespace after the colon is optional (`Show:Username` is valid,
  but not recommended).
- A **bare keyword** (`Enable`, `Disable`) matches when the trimmed line is
  **exactly** the keyword. `Enable: X`, `Enable:` and `Enable X` are error
  `SANMAIME_E003`.

### 3.6 Names

The **name** of a name keyword is everything after the keyword's colon, up
to the end of the line, trimmed.

- A name may contain **any characters** other than line breaks: letters of
  any script (Japanese included), digits, punctuation, spaces, `:`, `#`,
  `@`, quotes, emoji.
- Only the first colon — the keyword's own — is special.
  `Show: Time: 12:00` names the target `Time: 12:00`.
- Internal whitespace is preserved exactly as written.
- An empty name is error `SANMAIME_E002`.
- Names are compared by **exact code-point equality** after trimming. There
  is no case folding and no Unicode normalisation in v0 (authors SHOULD use
  NFC; tools MAY warn about names that differ only by normalisation).
- Names are **not** quoted and have no escape sequences.

### 3.7 Tag lines (reserved, v1)

A line whose first non-whitespace character is `@` is a **tag line**:

```text
@smoke @regression
Screen: Login
```

A tag line is one or more tags separated by whitespace. A tag is `@`
followed by one or more characters that are not whitespace, `@` or `#`.
Any other token on a tag line is error `SANMAIME_E020`.

In v0 tags are **parsed and attached** to the `Screen:` or `Element:` that
follows them (possibly after blank and comment lines), but they have **no
meaning** yet. Their semantics (filtering with `--tags`, inheritance, etc.)
are specified by issue #15. Tags followed by anything other than `Screen:`
or `Element:` (or by the end of the file) are error `SANMAIME_E018`.

### 3.8 Line classification

Each physical line is trimmed to `t` and classified by the **first**
matching rule:

| # | Condition on `t`                                                   | Class / result |
|---|--------------------------------------------------------------------|----------------|
| 1 | empty                                                              | blank line |
| 2 | starts with `#`                                                    | comment (or language directive, §3.4) |
| 3 | starts with `@`                                                    | tag line (§3.7), or `E020` |
| 4 | starts with `Screen:` `Element:` `When:` `Show:` `Hide:` `And:`    | name keyword line; empty name → `E002` |
| 5 | equals `Enable` or `Disable`                                       | bare keyword line |
| 6 | starts with `Enable` or `Disable` followed by whitespace or `:`    | `E003` |
| 7 | starts with `Background:`                                          | `E019` (reserved) |
| 8 | anything else                                                      | `E001` |

Blank lines and comments are *insignificant*; all other lines are
*significant*.

---

## 4. Grammar (EBNF)

Notation: ISO 14977 style. `,` is concatenation, `|` alternation,
`[ … ]` optional, `{ … }` zero or more, `-` exception, `? … ?` a
prose-defined set.

### 4.1 Lexical grammar (one physical line)

```ebnf
line               = { ws } , [ line-content ] , { ws } , line-break ;
line-break         = "\n" | "\r\n" | "\r" | end-of-input ;
line-content       = comment | tag-line | name-keyword-line | bare-keyword-line ;

comment            = "#" , { char } ;
language-directive = "#" , { ws } , "language" , { ws } , ":" , { ws } ,
                     language-code , { ws } ;
language-code      = "en" ;                       (* v0; extended by issue #5 *)

tag-line           = tag , { ws , { ws } , tag } ;
tag                = "@" , tag-char , { tag-char } ;
tag-char           = char - ( ws | "@" | "#" ) ;

name-keyword-line  = screen-line | element-line | when-line
                   | show-line | hide-line | and-line ;
screen-line        = "Screen:"  , { ws } , name ;
element-line       = "Element:" , { ws } , name ;
when-line          = "When:"    , { ws } , name ;
show-line          = "Show:"    , { ws } , name ;
hide-line          = "Hide:"    , { ws } , name ;
and-line           = "And:"     , { ws } , name ;
bare-keyword-line  = "Enable" | "Disable" ;

name               = name-char , [ { char } , name-char ] ;
name-char          = char - ws ;
char               = ? any Unicode scalar value except U+000A and U+000D ? ;
ws                 = ? whitespace as defined in §3.1, excluding line breaks ? ;
```

### 4.2 Syntactic grammar (sequence of significant lines)

Blank lines and comment lines are removed first; the language directive is
consumed from the header. The remaining lines are matched by:

```ebnf
document        = { screen } ;

screen          = { tag-line } , screen-line , element , { element } ;

element         = { tag-line } , element-line , element-body ;
element-body    = expectations , { condition-block }     (* unconditional block first *)
                | condition-block , { condition-block } ;

condition-block = when-line , expectations ;

expectations    = expectation , { expectation } ;
expectation     = visibility-group | bare-keyword-line ;
visibility-group= ( show-line | hide-line ) , { and-line } ;
```

Consequences of the grammar:

- A screen needs at least one element (`E010`); an element needs at least
  one expectation (`E009`); a `When:` block needs at least one expectation
  (`E008`).
- `And:` can only extend a `Show:`/`Hide:` group; it cannot start a block
  and cannot follow `Enable`/`Disable` (`E007`).
- Unconditional expectations can only appear **before** the first `When:`
  of an element. Once a `When:` appears, every following expectation belongs
  to a condition block until the next `When:`, `Element:` or `Screen:`.

The context-sensitive rules (uniqueness, conflicts) are in §6.

---

## 5. Semantics

### 5.1 Screen

`Screen: <name>` declares a screen. The name identifies the screen and is
bound by the runtime to a screen definition (how to reach it, e.g. a URL).
Everything up to the next `Screen:` belongs to it.

### 5.2 Element

`Element: <name>` declares a named part of the current screen. It is bound
by the runtime to an element definition, which maps the element's target
names (and, for `Enable`/`Disable`, the element itself) to locators.
Everything up to the next `Element:` or `Screen:` belongs to it.

### 5.3 Condition blocks

`When: <name>` starts a **condition block**. The name refers to a
*condition*: a screen state that the runtime can establish (log in as
another user, fill in invalid input, …). The block's expectations must hold
**in the state established by that condition**.

- An element may have any number of condition blocks.
- A block ends at the next `When:`, `Element:`, `Screen:` or end of file.
  Blank lines do not end a block.
- The same condition name may be used in several elements of the same
  screen; it then denotes the **same** condition (the runtime may establish
  the state once and check all those elements).

### 5.4 Unconditional block

Expectations that appear directly under `Element:`, before any `When:`,
form the element's **unconditional block**.

- Meaning: they are **invariants** of the screen — they must hold in every
  state of the screen that the specification describes: the *base state*
  (the screen as reached by its screen definition, with no condition
  applied) and every state produced by a `When:` condition of the same
  screen.
- Minimum verification: a v0 runtime MUST verify them in the base state and
  MAY additionally verify them in condition states.
- An element may have an unconditional block, condition blocks, or both.

### 5.5 Expectations

| Line           | Subject              | Meaning (Playwright analogue, non-normative) |
|----------------|----------------------|----------------------------------------------|
| `Show: X`      | target `X` of the element | `X` is visible (`toBeVisible()`) |
| `Hide: X`      | target `X` of the element | `X` is not visible: absent or hidden (`toBeHidden()`) |
| `And: X`       | target `X` of the element | same kind as the group it continues (§5.6) |
| `Enable`       | the element itself   | the element is enabled (`toBeEnabled()`) |
| `Disable`      | the element itself   | the element is disabled (`toBeDisabled()`) |

- Name keywords (`Show:`, `Hide:`, `And:`) take a **target name** and speak
  about a part of the element.
- Bare keywords (`Enable`, `Disable`) take no argument and speak about the
  **element itself**. They make no claim about visibility.
- The expectations of a block form a set; their order carries no meaning,
  but tools MUST preserve source order for reporting.

### 5.6 `And:` resolution

`And:` repeats the kind of the `Show:` or `Hide:` that starts its group.
Formally, an `And:` line resolves to the kind of the nearest preceding
`Show:`/`Hide:` line, provided that every line in between (ignoring blank
and comment lines) is an `And:` line and all of them are in the same block.
Otherwise it is error `SANMAIME_E007`:

- `And:` as the first expectation of a `When:` block or of an element;
- `And:` directly after `Enable` or `Disable`;
- `And:` that would continue a group from a previous block.

Example (from the README):

```text
When: Viewing another user's profile
Show: Username
Hide: Full name
And: Email address
```

| Line                 | Resolves to            |
|----------------------|------------------------|
| `Show: Username`     | show `Username`        |
| `Hide: Full name`    | hide `Full name`       |
| `And: Email address` | hide `Email address` (continues `Hide:`) |

### 5.7 Names and scoping

| Name        | Identity                                   | Scope of uniqueness |
|-------------|--------------------------------------------|---------------------|
| Screen      | the screen name                            | unique within a file (`E011`); SHOULD be unique within a project (checked by the generator, not the parser) |
| Element     | (screen, element)                          | unique within its screen (`E012`) |
| Condition   | (screen, condition)                        | unique within its element (`E013`); shared across elements of the same screen |
| Target      | (screen, element, target)                  | see §6 |

Whether an element or condition definition may be shared between screens
(for example a global `defineElement("Header", …)`) is decided by the
runtime binding API, not by the language. The language only defines the
identities above.

---

## 6. Consistency rules

These rules are checked by the parser after the grammar in §4 is
satisfied. They keep every fact in exactly one place, which makes
specifications easier to review and makes AI-generated output canonical.

1. **Unique target per block.** Within one block (the unconditional block or
   one condition block) a target name appears at most once, whatever its
   kind. `Show: X` + `And: X`, or `Show: X` + `Hide: X`, is `E014`.
2. **At most one state per block.** A block contains at most one `Enable` or
   `Disable` line. `Enable` + `Enable` or `Enable` + `Disable` is `E015`.
3. **Unconditional facts are not repeated.** Because unconditional
   expectations are invariants (§5.4), a condition block of the same element
   must not assert a target that the unconditional block already asserts,
   nor contain `Enable`/`Disable` when the unconditional block does. Either
   a contradiction or a redundant repetition is `E016`.

These rules are deliberately strict. Relaxing them later (for example,
letting a condition block override an unconditional expectation) is a
backwards-compatible change; tightening them would not be.

---

## 7. Diagnostics

### 7.1 Format

Every diagnostic has a stable **code**, a **message**, and a 1-based
**line** and **column**. Unless stated otherwise the location is the first
non-whitespace character of the offending line. Columns count Unicode code
points; a tab counts as one column.

Recommended rendering (compatible with editors' problem matchers):

```text
specs/login.sanmaime:7:5: error SANMAIME_E007: 'And:' must follow 'Show:', 'Hide:' or 'And:' in the same block.
```

### 7.2 Error codes

Placeholders in `{braces}` are filled in by the parser. Messages are
suggestions; codes and locations are normative.

| Code | Condition | Location | Suggested message |
|------|-----------|----------|-------------------|
| `SANMAIME_E001` | Unrecognised line (§3.8 rule 8): unknown keyword, wrong case, missing colon, free text. | the line | `Unrecognised line '{text}'. Expected Screen:, Element:, When:, Show:, Hide:, And:, Enable, Disable, a comment (#) or tags (@).` Parsers SHOULD add a hint when the line is a case-insensitive match (`Did you mean 'Show:'?`) or lacks the colon (`Did you mean 'Show: Username'?`). |
| `SANMAIME_E002` | A name keyword has an empty name. | the line | `'{Keyword}:' requires a name.` |
| `SANMAIME_E003` | `Enable`/`Disable` followed by a colon or an argument. | the line | `'{Keyword}' takes no argument. Write '{Keyword}' on its own line.` |
| `SANMAIME_E004` | `Element:` before any `Screen:`. | the line | `'Element:' must appear inside a 'Screen:'.` |
| `SANMAIME_E005` | `When:` before any `Element:` of the current screen (or before any `Screen:`). | the line | `'When:' must appear inside an 'Element:'.` |
| `SANMAIME_E006` | `Show:`, `Hide:`, `And:`, `Enable` or `Disable` before any `Element:` of the current screen (or before any `Screen:`). | the line | `'{Keyword}' must appear inside an 'Element:'.` |
| `SANMAIME_E007` | `And:` with no `Show:`/`Hide:` group to continue in the same block (§5.6). | the `And:` line | `'And:' must follow 'Show:', 'Hide:' or 'And:' in the same block.` |
| `SANMAIME_E008` | A `When:` block with no expectations. | the `When:` line | `Condition '{name}' has no expectations.` |
| `SANMAIME_E009` | An `Element:` with no expectations at all (no unconditional block and no `When:` block). | the `Element:` line | `Element '{name}' has no expectations.` |
| `SANMAIME_E010` | A `Screen:` with no `Element:`. | the `Screen:` line | `Screen '{name}' has no elements.` |
| `SANMAIME_E011` | Two screens with the same name in one file. | the second `Screen:` line | `Duplicate screen '{name}' (first declared on line {n}).` |
| `SANMAIME_E012` | Two elements with the same name in one screen. | the second `Element:` line | `Duplicate element '{name}' in screen '{screen}' (first declared on line {n}).` |
| `SANMAIME_E013` | Two `When:` blocks with the same name in one element. | the second `When:` line | `Duplicate condition '{name}' in element '{element}' (first declared on line {n}). Merge the two blocks.` |
| `SANMAIME_E014` | A target asserted twice in the same block (§6 rule 1). | the second line | `'{target}' is already asserted in this block (line {n}).` |
| `SANMAIME_E015` | More than one `Enable`/`Disable` in the same block (§6 rule 2). | the second line | `This block already declares '{Keyword}' (line {n}).` |
| `SANMAIME_E016` | A condition block re-asserts a target or state already asserted by the element's unconditional block (§6 rule 3). | the line in the condition block | `'{target}' is already asserted unconditionally for element '{element}' (line {n}). Unconditional expectations hold in every state.` |
| `SANMAIME_E017` | Invalid language directive: unsupported or empty language, or a second directive in the header. | the directive line | `Unsupported language '{code}'. Supported languages: en.` / `Duplicate language directive (first on line {n}).` |
| `SANMAIME_E018` | Tag lines not followed by `Screen:` or `Element:` (followed by another keyword or by end of file). | the first tag line of the group | `Tags must be followed by 'Screen:' or 'Element:'.` |
| `SANMAIME_E019` | Use of the reserved keyword `Background:`. | the line | `'Background:' is reserved for a future version of Sanmaime and is not supported in v0.` |
| `SANMAIME_E020` | Malformed tag line. | the line | `Invalid tag '{token}'. A tag is '@' followed by characters other than whitespace, '@' and '#'.` |

Codes are never reused. New diagnostics get new numbers.

### 7.3 Error recovery

Parsers SHOULD report **all** diagnostics of a file in source order, and
MUST report at least the first one. To avoid cascades, a parser that
continues after an error SHOULD recover as follows:

| After    | Recovery |
|----------|----------|
| `E001`, `E019`, `E020` | ignore the line (for `E020`, discard the tags of that line). |
| `E002`   | treat the line as its keyword with an empty name. |
| `E003`   | treat the line as the bare `Enable` / `Disable`. |
| `E004`   | ignore lines up to the next `Screen:` or tag line. |
| `E005`, `E006` | ignore lines up to the next `Element:`, `Screen:` or tag line. |
| `E007`   | ignore the line. |
| `E017`   | continue with the default language `en`. |
| `E018`   | discard the tags. |
| others   | keep the offending construct in the AST and continue. |

A document with at least one error has no defined meaning; generators MUST
NOT generate tests from it.

---

## 8. Reserved syntax and future extensions

v0 is intentionally strict: every line that is not listed in §3.8 is an
error. Therefore each extension below can be added later without changing
the meaning of any valid v0 file.

| Extension | Reserved now | Planned for |
|-----------|--------------|-------------|
| **i18n keywords** (Japanese first) | `# language: <code>` directive (§3.4); only `en` is accepted in v0. | issue #5 |
| **Tags** | `@tag` lines before `Screen:` / `Element:` are tokenised and attached to the node (§3.7), without semantics. | issue #15 |
| **Description** (free text under a header, like Gherkin's description) | Free-text lines are `E001` in v0. A future version may accept non-keyword lines directly after `Screen:` or `Element:` as a description. | v1 |
| **Background** (conditions shared by all elements of a screen) | The keyword `Background:` is reserved and is `E019` in v0. | v1 |
| **More expectation kinds** (text, count, value, …) | Any `Word:` line that is not a v0 keyword is `E001`, so new keywords can be introduced freely. | later |
| **Trailing comments** | `#` inside a line is part of the name in v0; trailing comments will not be introduced in a way that changes existing names without a new language version. | not planned |

---

## 9. Recommended style

Indentation is not significant, but tools that *write* Sanmaime (the AI
workflow, formatters, snippet generators) SHOULD produce this canonical
layout, which is the layout used in the README:

- `Screen:` at column 1.
- `Element:` indented by 2 spaces; a blank line before each `Element:`
  except when it directly follows `Screen:` (a blank line there is also fine).
- `When:` and expectations indented by 4 spaces (expectations are **not**
  indented further than their `When:`).
- A blank line between two `When:` blocks and between the unconditional
  block and the first `When:` block.
- One space after each colon; no trailing whitespace; LF line endings; a
  final newline.
- Use `And:` for every consecutive expectation of the same kind rather than
  repeating `Show:`/`Hide:`.

```text
Screen: Login

  Element: Login Form
    Show: Email address
    And: Password
    And: Login button

  Element: Login Button
    When: Input is valid
    Enable

    When: Input is invalid
    Disable
```

---

## 10. Suggested AST (non-normative)

The parser API is defined by its own issue. This shape is a suggestion
that captures everything the language defines:

```ts
interface Location { line: number; column: number }          // 1-based

interface SanmaimeDocument {
  language: string;                 // "en" in v0
  screens: Screen[];
}

interface Tag { name: string; location: Location }           // name includes "@"

interface Screen {
  name: string;
  tags: Tag[];
  location: Location;
  elements: Element[];
}

interface Element {
  name: string;
  tags: Tag[];
  location: Location;
  unconditional: Expectation[];     // may be empty
  conditions: ConditionBlock[];     // may be empty (but not both)
}

interface ConditionBlock {
  name: string;                     // the text after "When:"
  location: Location;
  expectations: Expectation[];
}

type Expectation =
  | { kind: "show" | "hide";        // And: already resolved
      target: string;
      keyword: "Show" | "Hide" | "And";
      location: Location }
  | { kind: "enable" | "disable";
      keyword: "Enable" | "Disable";
      location: Location };

interface Diagnostic {
  code: `SANMAIME_E${string}`;
  message: string;
  location: Location;
}
```

---

## 11. Full worked example

```text
# language: en
#
# Screen specification for the user details page.
# Approved by: product team

@profile
Screen: User Details

  Element: Page Header
    Show: Page title
    And: Back link

  Element: User Information

    When: Viewing your own profile
    Show: Username
    And: Full name
    And: Email address

    When: Viewing another user's profile
    Show: Username
    Hide: Full name
    And: Email address

  Element: Edit Button
    Show: Edit icon

    When: Viewing your own profile
    Enable

    When: Viewing another user's profile
    Disable

Screen: Login

  Element: Login Form
    Show: Email address
    And: Password
    And: Login button

  Element: Login Button
    When: Input is valid
    Enable

    When: Input is invalid
    Disable
```

Resolved meaning:

| Screen | Element | Condition | Expectations |
|--------|---------|-----------|--------------|
| User Details | Page Header | *(unconditional)* | show Page title, show Back link |
| User Details | User Information | Viewing your own profile | show Username, show Full name, show Email address |
| User Details | User Information | Viewing another user's profile | show Username, hide Full name, hide Email address |
| User Details | Edit Button | *(unconditional)* | show Edit icon |
| User Details | Edit Button | Viewing your own profile | element enabled |
| User Details | Edit Button | Viewing another user's profile | element disabled |
| Login | Login Form | *(unconditional)* | show Email address, show Password, show Login button |
| Login | Login Button | Input is valid | element enabled |
| Login | Login Button | Input is invalid | element disabled |

Notes:

- `Viewing your own profile` is used by two elements of *User Details*; it is
  one condition, established once.
- `Email address` on *User Details / User Information* and on
  *Login / Login Form* are unrelated targets (different elements).
- *Page Header* and *Edit Button / Edit icon* are invariants: they hold in
  the base state and in both condition states.
- The screen *User Details* carries the tag `@profile`, which has no effect
  in v0.

---

## 12. Test fixtures

`examples/sanmaime/` holds fixtures meant to be reused verbatim by the
parser's test suite.

```text
examples/sanmaime/
  valid/     *.sanmaime   — each file MUST parse with no diagnostics
  invalid/   *.sanmaime   — each file MUST produce the diagnostic it declares
```

Every invalid fixture starts with two comment lines:

```text
# expect: SANMAIME_E007
# at: 9:5
```

`expect` is the code of the **first** diagnostic and `at` is its
`line:column`. Each invalid fixture contains exactly one error under the
recovery rules of §7.3, so a parser that stops at the first error and a
parser that reports all errors both produce exactly this diagnostic.
Invalid fixtures are named `eNNN-<short-description>.sanmaime`.

`valid/crlf-line-endings.sanmaime` uses CRLF and `valid/utf8-bom.sanmaime`
starts with a BOM; `examples/sanmaime/.gitattributes` keeps git from
normalising them.

---

## 13. Design decisions

| # | Decision | Reason |
|---|----------|--------|
| D1 | Extension `.sanmaime`, UTF-8, BOM ignored, LF/CRLF/CR accepted. | Mirrors `.feature`; UTF-8 is needed for Japanese names; tolerant line endings avoid Windows friction. |
| D2 | Line-oriented grammar; **indentation is not significant**; lines are trimmed. | Same as Gherkin. Indentation errors are the most common mistake in hand-written and AI-written text, and the keyword order already determines the structure unambiguously. A formatter can normalise layout. |
| D3 | Structure by keyword nesting: `Screen:` > `Element:` > `When:` > expectations. | Matches every README example; each keyword has exactly one possible parent. |
| D4 | Keywords are case-sensitive and English-only in v0. | Predictable tokenising; i18n is a separate concern (#5) reserved via `# language:`. |
| D5 | Name keywords end with `:` and take the rest of the line as the name; `Enable`/`Disable` have no colon and no argument. | The colon visually marks "a name follows". Bare keywords state a property of the element itself, as in the README Login example. |
| D6 | Names are arbitrary text (any script, any punctuation), trimmed, compared exactly, unquoted. | Names must read naturally in any language and must match TypeScript definition keys literally (`defineElement("User Information", { "Username": … })`). |
| D7 | `#` starts a comment only as the first non-whitespace character; no trailing comments. | Lets names contain `#` (`Order #1234`), same as Gherkin. |
| D8 | Blank lines are ignored and never end a block. | The README uses blank lines freely inside elements. |
| D9 | `And:` continues the nearest `Show:`/`Hide:` group in the same block; it cannot start a block or follow `Enable`/`Disable`. | Required by the README (`Hide: Full name` / `And: Email address` means hidden). Forbidding the edge cases removes all ambiguity. |
| D10 | Expectations before the first `When:` are an unconditional block with invariant meaning; everything after a `When:` belongs to it until the next `When:`/`Element:`/`Screen:`. | Matches the README Login and AI-draft examples. The "until next header" rule makes blocks unambiguous without indentation. |
| D11 | Multiple `When:` blocks per element; multiple screens per file; the same condition name may appear in several elements of a screen and denotes one condition. | README examples; lets the runtime set up a state once for several elements. |
| D12 | Duplicates (screen, element, condition, target in a block, state in a block) and re-assertion of unconditional facts are errors. | Keeps one canonical place for every fact, which matters for human review of AI drafts. Strict now, relaxable later without breaking files. |
| D13 | Empty screen / element / condition block is an error; an empty file is valid. | A header with nothing under it is almost always a truncated specification; an empty file is harmless (same as an empty `.feature`). |
| D14 | Unknown lines are errors (no free-text description in v0); `Background:` reserved; tags tokenised but without semantics. | Every future extension (description, background, new expectation kinds, tags) can be added without changing the meaning of existing valid files. |
| D15 | Stable diagnostic codes `SANMAIME_Ennn` with line and column; fixtures declare the expected code and location. | Tests, editors and AI repair loops can match on codes rather than message text. |

---

## 14. 日本語サマリ

- **拡張子**は `.sanmaime`、文字コードは UTF-8(BOM は無視)。改行は LF / CRLF / CR のいずれも可。
- **行指向**の文法。各行は前後の空白(全角スペースを含む)を除去してから解釈する。**インデントは意味を持たない**(Gherkin と同じ)。構造はキーワードの順序 `Screen:` > `Element:` > `When:` > 期待 だけで決まる。
- **キーワード**: `Screen:` `Element:` `When:` `Show:` `Hide:` `And:`(名前を取る)と、`Enable` `Disable`(引数なし・要素自身の状態)。大文字小文字を区別する。
- **名前**はコロン以降の行末までの文字列(前後の空白を除去)。日本語・記号・`:`・`#` を含む任意の文字を使える。引用符やエスケープはない。
- **コメント**は行頭(空白の後)が `#` の行のみ。行末コメントはない。**空行**はどこでも無視され、ブロックを終わらせない。
- **`And:`** は同じブロック内の直前の `Show:` / `Hide:` の種類を引き継ぐ。ブロック先頭や `Enable` / `Disable` の直後の `And:` はエラー(E007)。
- **`When:` なしの期待**(要素直下、最初の `When:` より前)は無条件ブロックで、画面のすべての状態で成り立つ不変条件。最低限ベース状態(条件適用前)で検証する。
- 1 つの `Element:` に**複数の `When:`** を書ける。同じ画面内の別要素で同じ `When:` 名を使うと同じ条件を指す。1 ファイルに**複数の `Screen:`** を書ける。
- 重複(画面名・要素名・条件名・同一ブロック内の対象)や、無条件ブロックで宣言済みの対象を条件ブロックで再宣言することはエラー。空の画面・要素・条件ブロックもエラー。空ファイルは有効。
- **診断**は `SANMAIME_E001`〜`SANMAIME_E020` の安定したコードと行・桁を持つ(§7)。
- **将来拡張の予約**: `# language: xx`(i18n, #5。v0 は `en` のみ)、`@tag` 行(#15。v0 では構文解析して付与するだけ)、自由記述の Description(v0 ではエラー)、`Background:`(v0 では予約語エラー)。
- **テストフィクスチャ**は `examples/sanmaime/valid/` と `examples/sanmaime/invalid/`。無効例は先頭に `# expect: SANMAIME_Ennn` と `# at: 行:桁` を書く。
