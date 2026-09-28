# Sanmaime Language Specification — v0.3

> Status: **draft v0.3** (v0 plus tags: §3.7, §5.8 (v0.1), plus `Background:` and
> `And when:`: §5.9, §5.10 (v0.2), plus the expectation vocabulary v1: value keywords
> `Text:` / `Contain:` / `Count:`, state keywords `Check` / `Uncheck` / `Focus` / `Editable` /
> `ReadOnly` / `Empty` and state keywords with a target: §3.5, §3.9, §5.5, §6 (v0.3)). This document is the reference for the Sanmaime parser,
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
- _when viewing your own profile_, shows Username, Full name and Email address;
- _when viewing another user's profile_, shows Username and hides Full name
  and Email address.

The complete keyword set of v0.3 is (in English, the default keyword
language; other languages spell the same keywords differently, §3.5):

| Keyword       | Takes                    | Introduces / means                                                 |
| ------------- | ------------------------ | ------------------------------------------------------------------ |
| `Screen:`     | a name                   | a screen                                                           |
| `Background:` | a name                   | a condition shared by every element of the current screen (§5.9)   |
| `Element:`    | a name                   | an element of the current screen                                   |
| `When:`       | a name                   | a condition block of the current element                           |
| `And when:`   | a name                   | a further condition of the current `When:` block (§5.10)           |
| `Show:`       | a target                 | expectation: the named target is visible                           |
| `Hide:`       | a target                 | expectation: the named target is not visible                       |
| `And:`        | a target                 | expectation: same kind as the preceding `Show:` / `Hide:`          |
| `Enable`      | nothing, or `: <target>` | expectation: the element itself (or the target) is enabled         |
| `Disable`     | nothing, or `: <target>` | expectation: the element itself (or the target) is disabled        |
| `Check`       | nothing, or `: <target>` | expectation: … is checked (v0.3)                                   |
| `Uncheck`     | nothing, or `: <target>` | expectation: … is not checked (v0.3)                               |
| `Focus`       | nothing, or `: <target>` | expectation: … has the focus (v0.3)                                |
| `Editable`    | nothing, or `: <target>` | expectation: … is editable (v0.3)                                  |
| `ReadOnly`    | nothing, or `: <target>` | expectation: … is not editable (v0.3)                              |
| `Empty`       | nothing, or `: <target>` | expectation: … is empty: no text, or an empty input (v0.3)         |
| `Text:`       | `<target> = "<text>"`    | expectation: the target's text is exactly `<text>` (v0.3)          |
| `Contain:`    | `<target> = "<text>"`    | expectation: the target's text contains `<text>` (v0.3)            |
| `Count:`      | `<target> = <number>`    | expectation: the target matches exactly `<number>` elements (v0.3) |

The expectation keywords, their Playwright assertions and the policy for adding
keywords are described in [expectations.md](./expectations.md).

The same example with Japanese keywords (§3.4, §3.5):

```text
# language: ja
画面: ユーザー詳細

  要素: ユーザー情報

    条件: 自分のプロフィールを表示している
    表示: ユーザー名
    かつ: 氏名
    かつ: メールアドレス

    条件: 他のユーザーのプロフィールを表示している
    表示: ユーザー名
    非表示: 氏名
    かつ: メールアドレス
```

---

## 2. File format

| Property         | Rule                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extension        | `.sanmaime` (for example `user-details.sanmaime`).                                                                                                 |
| Encoding         | UTF-8. A leading byte order mark (U+FEFF) MUST be ignored. Decoding is the loader's job; invalid UTF-8 is an I/O error, not a Sanmaime diagnostic. |
| Line breaks      | LF, CRLF and a lone CR are all accepted, and may be mixed. The last line does not need a line break.                                               |
| Screens per file | One or more. A file that contains only blank lines and comments is valid and describes no screens.                                                 |
| File naming      | Not significant. Recommended: one screen per file, file named after the screen in kebab-case.                                                      |

---

## 3. Lexical structure

Sanmaime is **line-oriented**. Each physical line is classified on its own,
then the sequence of classified lines is checked against the grammar in §4.

### 3.1 Whitespace and indentation

_Whitespace_ means exactly the characters removed by ECMAScript
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
is ignored (apart from the header directives, §3.4).

There are **no trailing comments**: a `#` anywhere else is an ordinary
character. `Show: Order #1234` names the target `Order #1234`.

### 3.4 Header directives

The _header_ of a file is the part **before the first significant line**:
only blank and comment lines may precede it. Two kinds of comment lines in
the header are **directives**: `# language:` (the keyword language) and
`# status:` (the review status, [below](#status-directive)). Their order
does not matter, and each may appear at most once. After the header, both
are ordinary comments.

#### Language directive

A comment line of the form

```text
# language: en
```

that appears **before the first significant line** (the _header_: only
blank and comment lines may precede it) is a **language directive**. It
selects the keyword language of the file. Precisely, after trimming, the
line is a directive when it matches:

```text
^#[ws]*language[ws]*:[ws]*(.*)$        (the captured value is trimmed)
```

- v0 defines the languages **`en`** (English) and **`ja`** (Japanese); the
  keywords of each are listed in §3.5. Language codes are case-sensitive
  (`ja`, not `JA`).
- An unsupported (or empty) value is error `SANMAIME_E017`.
- A second directive in the header is error `SANMAIME_E017`; the first one
  stays in effect.
- After the header, a `# language:` line is an ordinary comment.
- The directive applies to the **whole file**. The header itself consists of
  blank and comment lines only, so it reads the same in every language.
- A language changes **only the keyword spellings**, never the structure,
  the semantics or the diagnostics codes. Names are never translated.

**Default language.** A file without a language directive uses the _default
language_. It is `en`, unless the tool that parses the file is configured
otherwise: the `language` option of `defineSanmaimeConfig()`
([config.md](./config.md)) sets the default language of every file of that
configuration, and is passed to the parser as `parse(source, { language })`.
The precedence is:

| #   | Source                                      | Example                                    |
| --- | ------------------------------------------- | ------------------------------------------ |
| 1   | a valid `# language:` directive in the file | `# language: ja`                           |
| 2   | the configured default (`language` option)  | `defineSanmaimeConfig({ language: 'ja' })` |
| 3   | `en`                                        |                                            |

The directive always wins, so a file that declares its language parses the
same under every configuration. Files meant to be shared SHOULD declare
their language when it is not `en`. When the directive is invalid
(`E017`), parsing continues with the configured default (2, else 3).

An unsupported value of the `language` **option** is not a diagnostic of any
file: the reference parser throws a `TypeError` from `parse()` (it is a
configuration error, reported once by the tool, not once per file).

#### Status directive

A comment line in the header that, after trimming, matches

```text
^#[ws]*status[ws]*:[ws]*(.*)$          (the captured value is trimmed)
```

is a **status directive**. It records where the specification is in the
review workflow of the README's
[Sanmaime as an Intermediate Representation](../README.md#sanmaime-as-an-intermediate-representation)
([review-workflow.md](./review-workflow.md)):

| Value      | Meaning                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| `draft`    | _This is what the application currently does._ Proposed (e.g. by `nimaime draft`), not reviewed.      |
| `approved` | _This is what the application is supposed to do._ Reviewed; the requirement tests are generated from. |

```text
# status: draft
# Draft proposed by nimaime draft from http://localhost:3000/login. Review it before committing.

Screen: Login
```

- A file **without** a status directive is `approved`, so files written by
  hand, and every file written before the directive existed, are
  specifications.
- Values are case-sensitive (`draft`, not `Draft`). Another (or an empty)
  value is error `SANMAIME_E024`; the file is then treated as `approved`
  (like `E017`, parsing continues with the default).
- A second status directive in the header is error `SANMAIME_E024`; the
  first one stays in effect.
- The status never changes the meaning of the file (its screens, elements
  and expectations); it tells tools what to do with it: `nimaime-gen` skips
  drafts unless asked to include them, `nimaime approve` rewrites
  `draft` to `approved` ([review-workflow.md](./review-workflow.md)).

### 3.5 Keywords

Keywords are **case-sensitive** and must be spelled exactly as in the table
of the file's language below. Only the keywords of the file's language are
recognised: in a `# language: ja` file, `Show: X` is error `SANMAIME_E001`,
and so is `表示: X` in an English file (parsers SHOULD hint at the
equivalent keyword, §7.2).

| Keyword (canonical) | `en`         | `ja`         | Kind                         |
| ------------------- | ------------ | ------------ | ---------------------------- |
| Screen              | `Screen`     | `画面`       | name keyword                 |
| Background          | `Background` | `背景`       | name keyword (v0.2)          |
| Element             | `Element`    | `要素`       | name keyword                 |
| When                | `When`       | `条件`       | name keyword                 |
| AndWhen             | `And when`   | `かつ条件`   | name keyword (v0.2)          |
| Show                | `Show`       | `表示`       | name keyword (target)        |
| Hide                | `Hide`       | `非表示`     | name keyword (target)        |
| And                 | `And`        | `かつ`       | name keyword (target)        |
| Enable              | `Enable`     | `有効`       | state keyword                |
| Disable             | `Disable`    | `無効`       | state keyword                |
| Check               | `Check`      | `チェック`   | state keyword (v0.3)         |
| Uncheck             | `Uncheck`    | `未チェック` | state keyword (v0.3)         |
| Focus               | `Focus`      | `フォーカス` | state keyword (v0.3)         |
| Editable            | `Editable`   | `編集可`     | state keyword (v0.3)         |
| ReadOnly            | `ReadOnly`   | `読取専用`   | state keyword (v0.3)         |
| Empty               | `Empty`      | `空`         | state keyword (v0.3)         |
| Text                | `Text`       | `テキスト`   | value keyword (text, v0.3)   |
| Contain             | `Contain`    | `含む`       | value keyword (text, v0.3)   |
| Count               | `Count`      | `件数`       | value keyword (number, v0.3) |
| **Colons**          | `:`          | `:` `：`     |                              |

The table lists keywords **without** their colon. The rest of this document
writes keywords in English (`Show:`); every rule applies equally to the
corresponding keyword of the file's language. A language may define several
spellings (synonyms) for one keyword, as Gherkin does; `en` and `ja` define
exactly one each. Keyword dictionaries and how to add a language are
described in [i18n.md](./i18n.md).

- A **name keyword** (`Screen:`, `Background:`, `Element:`, `When:`,
  `And when:`, `Show:`, `Hide:`, `And:`, and since v0.3 the value keywords
  `Text:`, `Contain:`, `Count:` and the state keywords followed by a colon)
  matches when the trimmed line
  **starts with** the keyword immediately followed by one of the language's
  **colons**. There is no whitespace between the word and the colon (the
  space inside `And when` is part of the keyword). Whitespace after the colon
  is optional (`Show:Username` is valid, but not recommended).
- `And when:` and `And:` do not clash: `And:` needs the colon right after
  `And`, so `And when: X` is never `And:` with the target `when: X`, and
  `And: when X` is an `And:` line. Likewise `かつ条件:` is not `かつ:`
  (the longest spelling wins, §3.8).
- **Full-width colon.** Japanese keywords accept both the ASCII colon `:`
  (U+003A) and the full-width colon `：` (U+FF1A), because Japanese input
  methods produce `：` by default: `画面：ログイン` and `画面: ログイン` are
  the same line. English keywords accept only `:` (`Show：X` is `E001`).
  Only the keyword's own colon is special: `表示：時刻：12:00` names the
  target `時刻：12:00`.
- A **state keyword** (`Enable`, `Disable`, and since v0.3 `Check`,
  `Uncheck`, `Focus`, `Editable`, `ReadOnly`, `Empty`) is a **bare keyword**
  when the trimmed line is **exactly** the keyword: it is then about the
  element itself. Since v0.3 a state keyword may also be followed by its colon
  and a target name, like a name keyword (`Enable: Login button`,
  `有効：ログインボタン`): it is then about that target (§3.9). Followed by
  whitespace and an argument **without** a colon (`Enable X`, `有効 X`) it is
  error `SANMAIME_E003`; with a colon and no name (`Enable:`) it is `E002`.
  (`有効期限` is `E001`, since the keyword is not followed by whitespace or a
  colon.) In v0–v0.2, `Enable: X` and `Enable:` were `E003`.
- A **value keyword** (`Text:`, `Contain:`, `Count:`, v0.3) is a name
  keyword whose name is split into a target and a value (§3.9). It has no bare
  form (`Text` alone is `E001`).
- `Background:` was reserved (error `SANMAIME_E019`) in v0 and v0.1. Since
  v0.2 it is an ordinary name keyword (§5.9); `E019` is no longer reported.

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

### 3.7 Tag lines

A line whose first non-whitespace character is `@` is a **tag line**:

```text
@smoke @regression
Screen: Login
```

A tag line is one or more tags separated by whitespace. A tag is `@`
followed by one or more characters that are not whitespace, `@` or `#`
(`@smoke`, `@owner:team-a`, `@日本語タグ`). Any other token on a tag line is
error `SANMAIME_E020`.

Tags are attached to the `Screen:`, `Element:` or `When:` line that follows
them, possibly after blank lines, comment lines and further tag lines (all
tags of the group are attached, in source order). Tags followed by anything
else (an expectation, or the end of the file) are error `SANMAIME_E018`.
Tags have no effect on the structure of the file; their meaning is given in
§5.8.

Tags are language-independent: `@` and the tag text are the same whatever
the file's `# language:` (a tag may be written in any script).

### 3.8 Line classification

Each physical line is trimmed to `t` and classified by the **first**
matching rule:

| #   | Condition on `t`                                                                                                                                                                                 | Class / result                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| 1   | empty                                                                                                                                                                                            | blank line                             |
| 2   | starts with `#`                                                                                                                                                                                  | comment (or header directive, §3.4)    |
| 3   | starts with `@`                                                                                                                                                                                  | tag line (§3.7), or `E020`             |
| 4   | starts with `Screen:` `Background:` `Element:` `When:` `And when:` `Show:` `Hide:` `And:`, a value keyword (`Text:` `Contain:` `Count:`) or a state keyword and its colon (`Enable:` … `Empty:`) | name keyword line; empty name → `E002` |
| 5   | equals a state keyword (`Enable` `Disable` `Check` `Uncheck` `Focus` `Editable` `ReadOnly` `Empty`)                                                                                              | bare keyword line                      |
| 6   | starts with a state keyword followed by whitespace                                                                                                                                               | `E003`                                 |
| 7   | anything else                                                                                                                                                                                    | `E001`                                 |

(v0 and v0.1 had a rule "starts with `Background:` → `E019` (reserved)"
before the last one; v0.2 removed it, since `Background:` is now a name
keyword. Before v0.3, rule 6 also caught `Enable:` / `Disable:` followed by a
colon; since v0.3 rule 4 makes them state keywords with a target.)

Keywords in rules 4–6 are those of the file's language (§3.5), and `:`
stands for any of the language's colons. When a language has synonyms, the
longest spelling that matches wins. Rules 1–3 do not depend on the language,
which is why the header can be read before the language is known.

Blank lines and comments are _insignificant_; all other lines are
_significant_.

### 3.9 Arguments of expectation keywords (v0.3)

The expectation keywords take three shapes of arguments
([expectations.md](./expectations.md)):

| Keywords                                                                   | Argument                          | Example                        |
| -------------------------------------------------------------------------- | --------------------------------- | ------------------------------ |
| `Show:` `Hide:` `And:`                                                     | a target name (§3.6)              | `Show: Username`               |
| `Enable` `Disable` `Check` `Uncheck` `Focus` `Editable` `ReadOnly` `Empty` | nothing, or `:` and a target name | `Check` / `Check: Remember me` |
| `Text:` `Contain:`                                                         | a target name, `=`, a text        | `Text: Title = "Welcome"`      |
| `Count:`                                                                   | a target name, `=`, a number      | `Count: Search results = 3`    |

For a value keyword, the name (everything after the colon, trimmed, §3.6) is
split at its **first `=` that stands alone**: preceded by whitespace (or the
start of the name) and followed by whitespace (or the end of the name).
Whitespace is that of §3.1 (a full-width space counts); the `=` is the ASCII
`=`.

- The part before it, trimmed, is the **target**; empty → `E002`.
- The part after it, trimmed, is the **value**. Without such an `=` the line
  is `SANMAIME_E026`.
- A target therefore cannot contain a standalone `=` (an `=` without
  whitespace on both sides is an ordinary character: `Text: A=b = "x"` is about `A=b`); a text
  value can (`Text: Formula = "a = b"`).

Values:

- A **text** (`Text:`, `Contain:`) is enclosed in ASCII double quotes
  (U+0022), in every keyword language. Inside the quotes `\"` stands for a
  quote and `\\` for a backslash; any other backslash, an unescaped quote, a
  missing closing quote or characters after it are `SANMAIME_E027`. `""` (the
  empty text) is valid.
- A **number** (`Count:`) is one or more ASCII digits (`0`, `3`, `042`); a
  sign, a decimal point, full-width digits or quotes are `SANMAIME_E027`.

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
language-code      = "en" | "ja" ;
status-directive   = "#" , { ws } , "status" , { ws } , ":" , { ws } ,
                     ( "draft" | "approved" ) , { ws } ;

tag-line           = tag , { ws , { ws } , tag } ;
tag                = "@" , tag-char , { tag-char } ;
tag-char           = char - ( ws | "@" | "#" ) ;

(* Shown for "en". For another language, substitute its spellings (§3.5)
   and let colon = ":" | "：" where the language accepts the full-width colon. *)
colon              = ":" ;
name-keyword-line  = screen-line | background-line | element-line
                   | when-line | and-when-line
                   | show-line | hide-line | and-line
                   | state-target-line | value-line ;          (* v0.3 *)
screen-line        = "Screen"  , colon , { ws } , name ;
background-line    = "Background" , colon , { ws } , name ;  (* v0.2 *)
element-line       = "Element" , colon , { ws } , name ;
when-line          = "When"    , colon , { ws } , name ;
and-when-line      = "And when" , colon , { ws } , name ;    (* v0.2 *)
show-line          = "Show"    , colon , { ws } , name ;
hide-line          = "Hide"    , colon , { ws } , name ;
and-line           = "And"     , colon , { ws } , name ;
state-keyword      = "Enable" | "Disable" | "Check" | "Uncheck"     (* v0.3: all but *)
                   | "Focus" | "Editable" | "ReadOnly" | "Empty" ;  (* Enable/Disable *)
bare-keyword-line  = state-keyword ;
state-target-line  = state-keyword , colon , { ws } , name ;        (* v0.3 *)
value-line         = ( "Text" | "Contain" ) , colon , { ws } ,
                     target , ws , { ws } , "=" , ws , { ws } , text
                   | "Count" , colon , { ws } ,
                     target , ws , { ws } , "=" , ws , { ws } , number ;  (* v0.3 *)
target             = name - ( ? names containing ws "=" ws ? ) ;     (* §3.9 *)
text               = '"' , { text-char | '\"' | '\\' } , '"' ;
text-char          = char - ( '"' | "\" ) ;
number             = digit , { digit } ;
digit              = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" ;

name               = name-char , [ { char } , name-char ] ;
name-char          = char - ws ;
char               = ? any Unicode scalar value except U+000A and U+000D ? ;
ws                 = ? whitespace as defined in §3.1, excluding line breaks ? ;
```

### 4.2 Syntactic grammar (sequence of significant lines)

Blank lines and comment lines are removed first; the header directives are
consumed from the header. The remaining lines are matched by:

```ebnf
document        = { screen } ;

screen          = { tag-line } , screen-line , { background-line } ,
                  element , { element } ;

element         = { tag-line } , element-line , element-body ;
element-body    = expectations , { condition-block }     (* unconditional block first *)
                | condition-block , { condition-block } ;

condition-block = { tag-line } , when-line , { and-when-line } , expectations ;

expectations    = expectation , { expectation } ;
expectation     = visibility-group | bare-keyword-line
                | state-target-line | value-line ;      (* v0.3 *)
visibility-group= ( show-line | hide-line ) , { and-line } ;
```

Consequences of the grammar:

- A screen needs at least one element (`E010`); an element needs at least
  one expectation (`E009`); a `When:` block needs at least one expectation
  (`E008`).
- `And:` can only extend a `Show:`/`Hide:` group; it cannot start a block
  and cannot follow a state or value keyword (`E007`). `And:` never continues
  `Text:`, `Contain:`, `Count:` or a state keyword: their arguments have
  another shape, and `And: X = "y"` would be ambiguous.
- Tags can precede `Screen:`, `Element:` and `When:` only. The unconditional
  block has no header line, so it has no tags of its own (§5.8).
- Unconditional expectations can only appear **before** the first `When:`
  of an element. Once a `When:` appears, every following expectation belongs
  to a condition block until the next `When:`, `Element:` or `Screen:`.
- `Background:` lines can only appear directly under `Screen:`, before its
  first `Element:` (`E025`), and have no expectations of their own
  (`E021`).
- `And when:` lines can only directly follow `When:` or another `And when:`
  (`E023`): they come before the block's expectations.
- **There is no nesting.** Since indentation is not significant (§3.1), an
  indented `When:` never starts a block _inside_ another block: it ends the
  previous block and starts a new one. Conditions are combined with
  `And when:` instead (§5.10).

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
names (and, for the bare state keywords such as `Enable`, the element itself)
to locators.
Everything up to the next `Element:` or `Screen:` belongs to it.

### 5.3 Condition blocks

`When: <name>` starts a **condition block**. The name refers to a
_condition_: a screen state that the runtime can establish (log in as
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
  state of the screen that the specification describes: the _base state_
  (the screen as reached by its screen definition, with no condition
  applied) and every state produced by a `When:` condition of the same
  screen.
- Minimum verification: a v0 runtime MUST verify them in the base state and
  MAY additionally verify them in condition states.
- An element may have an unconditional block, condition blocks, or both.

### 5.5 Expectations

| Line               | Subject                   | Meaning (Playwright analogue, non-normative)                           |
| ------------------ | ------------------------- | ---------------------------------------------------------------------- |
| `Show: X`          | target `X` of the element | `X` is visible (`toBeVisible()`)                                       |
| `Hide: X`          | target `X` of the element | `X` is not visible: absent or hidden (`toBeHidden()`)                  |
| `And: X`           | target `X` of the element | same kind as the group it continues (§5.6)                             |
| `Enable`           | the element itself        | the element is enabled (`toBeEnabled()`)                               |
| `Disable`          | the element itself        | the element is disabled (`toBeDisabled()`)                             |
| `Check`            | the element itself        | it is checked (`toBeChecked()`) (v0.3)                                 |
| `Uncheck`          | the element itself        | it is not checked (`not.toBeChecked()`) (v0.3)                         |
| `Focus`            | the element itself        | it has the focus (`toBeFocused()`) (v0.3)                              |
| `Editable`         | the element itself        | it is editable (`toBeEditable()`) (v0.3)                               |
| `ReadOnly`         | the element itself        | it is not editable (`not.toBeEditable()`) (v0.3)                       |
| `Empty`            | the element itself        | it has no text, or is an empty input (`toBeEmpty()`) (v0.3)            |
| `Check: X` (etc.)  | target `X` of the element | the same state, of `X` (v0.3; also `Enable: X`, `Disable: X`)          |
| `Text: X = "t"`    | target `X` of the element | the text of `X` is `t`, whitespace normalised (`toHaveText(t)`) (v0.3) |
| `Contain: X = "t"` | target `X` of the element | the text of `X` contains `t` (`toContainText(t)`) (v0.3)               |
| `Count: X = n`     | target `X` of the element | `X` matches exactly `n` elements (`toHaveCount(n)`) (v0.3)             |

- Target keywords (`Show:`, `Hide:`, `And:`), value keywords and state
  keywords with a colon take a **target name** and speak about a part of the
  element.
- Bare state keywords take no argument and speak about the **element
  itself**. They make no claim about visibility.
- The complete vocabulary, its `Expected:` phrasing in failure messages and
  the policy for adding keywords are in [expectations.md](./expectations.md).
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

| Line                 | Resolves to                              |
| -------------------- | ---------------------------------------- |
| `Show: Username`     | show `Username`                          |
| `Hide: Full name`    | hide `Full name`                         |
| `And: Email address` | hide `Email address` (continues `Hide:`) |

### 5.7 Names and scoping

| Name      | Identity                  | Scope of uniqueness                                                                                                                     |
| --------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Screen    | the screen name           | unique within a file (`E011`); SHOULD be unique within a project (checked by the generator, not the parser)                             |
| Element   | (screen, element)         | unique within its screen (`E012`)                                                                                                       |
| Condition | (screen, condition)       | shared across the elements and the `Background:` of the same screen; a block's list of conditions is unique within its element (`E013`) |
| Target    | (screen, element, target) | see §6                                                                                                                                  |

Whether an element or condition definition may be shared between screens
(for example a global `defineElement("Header", …)`) is decided by the
runtime binding API, not by the language. The language only defines the
identities above.

### 5.8 Tags

Tags label tests so that tools can select them, as Gherkin tags do. Each
block of an element is one **test** (§5.3, §5.4); its **effective tags** are:

| Test                      | Effective tags                                |
| ------------------------- | --------------------------------------------- |
| the unconditional block   | screen tags ∪ element tags                    |
| a `When:` condition block | screen tags ∪ element tags ∪ the block's tags |

- Tags on a `Screen:` apply to all its elements; tags on an `Element:`
  apply to all its blocks; tags on a `When:` apply to that block only.
- Effective tags form a set: a tag repeated on several levels (or twice on
  one line) counts once. Tags are compared by exact code-point equality,
  including the `@` (`@Smoke` ≠ `@smoke`).
- Tags never change what a test checks. They are used to **select** tests:
  `nimaime-gen --tags "<expression>"` (or the config's `tags` option)
  generates only the tests whose effective tags match a Cucumber-style tag
  expression such as `@smoke and not (@wip or @slow)`. Screens and elements
  left without tests, and files left without tests, are not generated. See
  [cli.md](./cli.md#tags).
- The generated Playwright tests carry the tags (`{ tag: [...] }` on the
  `test.describe` of the screen and element and on the `test` of a `When:`
  block), so `npx playwright test --grep @smoke` also selects them, and a
  running test can read its effective tags from the `$tags` fixture
  ([runtime.md](./runtime.md#tags)).

```text
@smoke
Screen: Login

  Element: Login Form          # effective tags of its unconditional block: @smoke
    Show: Email address

  @regression
  Element: Login Button
    When: Input is valid       # @smoke @regression
    Enable

    @wip
    When: Input is invalid     # @smoke @regression @wip
    Disable
```

(The `# …` annotations above are explanations, not Sanmaime comments:
Sanmaime has no trailing comments, §3.3.)

### 5.9 Background (v0.2)

`Background: <condition>` lines directly under a `Screen:` (before its first
`Element:`) name conditions that are shared by **every block of every
element** of that screen, like Gherkin's `Background:` applies to every
scenario of a feature.

```text
Screen: Cart
  Background: The user is logged in
  Background: The cart has an item

  Element: Summary
    Show: Item count

  Element: Checkout Button
    When: An address is entered
    Enable
```

- A `Background:` line takes a **condition name**, which denotes the same
  condition as a `When:` of that name (§5.3, §5.7). It is not a block: it has
  no expectations (expectations after it, before the first `Element:`, are
  `E021`).
- A screen may have several `Background:` lines. Their conditions are
  established **in source order**. A name repeated in the screen's
  `Background:` lines is `E022`.
- Execution order of every test (block) of the screen: open the screen, then
  establish each `Background:` condition, then the block's own conditions
  (none for the unconditional block, §5.4), then check the expectations.
  With a background, the _base state_ of §5.4 is the screen as reached by its
  screen definition **after** its `Background:` conditions.
- A block's own conditions must not repeat a `Background:` condition of its
  screen (`E022`): it is already established.
- Tags cannot precede `Background:` (`E018`); a background has no tags of its
  own, and it does not change the tags of any test.
- `Background:` does not change test titles (§5.10); a report shows it once
  under its screen.

### 5.10 Combined conditions: `And when:` (v0.2)

`And when: <condition>` lines directly after a `When:` line (and before the
block's expectations) add conditions to that block. The block's expectations
must hold in the state established by **all** its conditions, applied in
source order.

```text
Screen: Checkout
  Element: Pay Button
    When: An address is entered
    And when: A card is entered
    Enable

    When: An address is entered
    Disable
```

- The **conditions of a block** are its `When:` condition followed by each
  `And when:` condition, in order. They are established in that order, after
  the screen's `Background:` conditions (§5.9).
- A name appears at most once among a block's conditions, and not at all when
  it is a `Background:` condition of the screen (`E022`).
- A block is identified by its ordered list of conditions: `When: A` and
  `When: A` + `And when: B` are two different blocks of the same element, but
  two blocks `When: A` + `And when: B` in one element are duplicates
  (`E013`). `When: B` + `And when: A` is a different block (the order of
  establishing conditions can matter).
- The **display name** (title) of a block is its condition names joined with
  `" and "`: `A and B`. Tools name the block `When: A and B` (the generated
  test title, reports, failure messages). The joiner is `" and "` in every
  keyword language, like the `When:` prefix of generated titles: titles are
  language-independent (a `# language: ja` file's block
  `条件: A` + `かつ条件: B` is titled `When: A and B`).
- `And when:` elsewhere is `E023`: in the unconditional block, after an
  expectation, directly under `Screen:` or `Element:`, or outside a screen.
- **No nesting.** A `When:` inside a `When:` (by indentation) is not
  supported: indentation is not significant in Sanmaime (§3.1, D2), so a
  second `When:` always starts a new block. `And when:` is the only way to
  combine conditions; it keeps every block flat, which keeps each test's
  state explicit on consecutive lines.

---

## 6. Consistency rules

These rules are checked by the parser after the grammar in §4 is
satisfied. They keep every fact in exactly one place, which makes
specifications easier to review and makes AI-generated output canonical.

Every expectation keyword belongs to a **family**; opposite keywords share
one (v0.3): _visibility_ (`Show:`, `Hide:`, `And:`), _enabled_ (`Enable`,
`Disable`), _checked_ (`Check`, `Uncheck`), _editable_ (`Editable`,
`ReadOnly`), _focus_ (`Focus`), _empty_ (`Empty`), _text_ (`Text:`),
_contain_ (`Contain:`) and _count_ (`Count:`). A **fact** is a subject (a
target, or the element itself) and a family; for `Contain:` the text is part
of the fact (a target may contain several texts).

1. **Unique fact per target and block.** Within one block (the unconditional
   block or one condition block) a (target, family) pair appears at most once.
   `Show: X` + `And: X`, `Show: X` + `Hide: X`, `Check: X` + `Uncheck: X` or
   two `Text: X` lines are `E014`; `Show: X` + `Text: X = "…"` is fine. (In
   v0–v0.2, where every target keyword was of the visibility family, this read
   "a target name appears at most once per block".)
2. **At most one state per family of the element itself per block.**
   `Enable` + `Enable`, `Enable` + `Disable`, `Check` + `Uncheck` is `E015`;
   `Enable` + `Check` is fine.
3. **Unconditional facts are not repeated.** Because unconditional
   expectations are invariants (§5.4), a condition block of the same element
   must not state a fact that the unconditional block already states (same
   target and family, or same family of the element itself). Either a
   contradiction or a redundant repetition is `E016`.

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

Messages are written in English in every language, but the **keywords they
quote are spelled in the file's language**: in a `# language: ja` file,
`E004` reads `'要素:' must appear inside a '画面:'.` and `E003` reads
`'有効' takes no argument without a colon. Write '有効' on its own line for the element itself, or '有効: X' for a target.` A keyword that
stands for the line itself (`E002`, `E003`, `E006`, `E015`, `E016`, `E021`,
`E023`, `E025`, `E026`, `E027`) is quoted as written; other keywords use the language's primary spelling.

| Code            | Condition                                                                                                                                                                                                                                         | Location                                                | Suggested message                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SANMAIME_E001` | Unrecognised line (§3.8 rule 7): unknown keyword, wrong case, missing colon, free text.                                                                                                                                                           | the line                                                | `Unrecognised line '{text}'. Expected Screen:, Background:, Element:, When:, And when:, an expectation (Show:, Hide:, And:, Enable, Disable, Check, Uncheck, Focus, Editable, ReadOnly, Empty, Text:, Contain:, Count:), a comment (#) or tags (@).` Parsers SHOULD add a hint when the line is a case-insensitive match (`Did you mean 'Show:'?`), lacks the colon (`Did you mean 'Show: Username'?`) or is a keyword of another language (`'Show:' is a keyword of English (en), but this file uses Japanese (ja) keywords. Did you mean '表示:'?`). |
| `SANMAIME_E002` | A name keyword has an empty name.                                                                                                                                                                                                                 | the line                                                | `'{Keyword}:' requires a name.`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `SANMAIME_E003` | A state keyword (`Enable`, `Check`, …) followed by whitespace and an argument, without a colon (§3.5). (Until v0.2 also `Enable:` / `Enable: X`.)                                                                                                 | the line                                                | `'{Keyword}' takes no argument without a colon. Write '{Keyword}' on its own line for the element itself, or '{Keyword}: {argument}' for a target.`                                                                                                                                                                                                                                                                                                                                                                                                    |
| `SANMAIME_E004` | `Element:` before any `Screen:`.                                                                                                                                                                                                                  | the line                                                | `'Element:' must appear inside a 'Screen:'.`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `SANMAIME_E005` | `When:` before any `Element:` of the current screen (or before any `Screen:`).                                                                                                                                                                    | the line                                                | `'When:' must appear inside an 'Element:'.`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `SANMAIME_E006` | `Show:`, `Hide:`, `And:`, `Enable` or `Disable` before any `Element:` of the current screen (or before any `Screen:`).                                                                                                                            | the line                                                | `'{Keyword}' must appear inside an 'Element:'.`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `SANMAIME_E007` | `And:` with no `Show:`/`Hide:` group to continue in the same block (§5.6).                                                                                                                                                                        | the `And:` line                                         | `'And:' must follow 'Show:', 'Hide:' or 'And:' in the same block.`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `SANMAIME_E008` | A `When:` block with no expectations.                                                                                                                                                                                                             | the `When:` line                                        | `Condition '{title}' has no expectations.` ({title}: §5.10)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `SANMAIME_E009` | An `Element:` with no expectations at all (no unconditional block and no `When:` block).                                                                                                                                                          | the `Element:` line                                     | `Element '{name}' has no expectations.`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `SANMAIME_E010` | A `Screen:` with no `Element:`.                                                                                                                                                                                                                   | the `Screen:` line                                      | `Screen '{name}' has no elements.`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `SANMAIME_E011` | Two screens with the same name in one file.                                                                                                                                                                                                       | the second `Screen:` line                               | `Duplicate screen '{name}' (first declared on line {n}).`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `SANMAIME_E012` | Two elements with the same name in one screen.                                                                                                                                                                                                    | the second `Element:` line                              | `Duplicate element '{name}' in screen '{screen}' (first declared on line {n}).`                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `SANMAIME_E013` | Two `When:` blocks with the same conditions (same `When:` name and same `And when:` names, in order) in one element.                                                                                                                              | the second `When:` line                                 | `Duplicate condition '{title}' in element '{element}' (first declared on line {n}). Merge the two blocks.`                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `SANMAIME_E014` | A fact about a target (same target and family) asserted twice in the same block (§6 rule 1).                                                                                                                                                      | the second line                                         | `'{target}' is already asserted in this block (line {n}).`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `SANMAIME_E015` | Two bare state keywords of the same family in the same block (§6 rule 2).                                                                                                                                                                         | the second line                                         | `This block already declares '{Keyword}' (line {n}).`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `SANMAIME_E016` | A condition block re-asserts a target or state already asserted by the element's unconditional block (§6 rule 3).                                                                                                                                 | the line in the condition block                         | `'{target}' is already asserted unconditionally for element '{element}' (line {n}). Unconditional expectations hold in every state.`                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `SANMAIME_E017` | Invalid language directive: unsupported or empty language, or a second directive in the header.                                                                                                                                                   | the directive line                                      | `Unsupported language '{code}'. Supported languages: en, ja.` / `Duplicate language directive (first on line {n}).`                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `SANMAIME_E024` | Invalid status directive (§3.4): a value other than `draft` or `approved` (or empty), or a second one in the header.                                                                                                                              | the directive line                                      | `Unknown status '{value}'. Use 'draft' or 'approved'.` / `Duplicate status directive (first on line {n}).`                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `SANMAIME_E018` | Tag lines not followed by `Screen:`, `Element:` or `When:` (followed by another keyword or by end of file).                                                                                                                                       | the first tag line of the group                         | `Tags must be followed by 'Screen:', 'Element:' or 'When:'.`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `SANMAIME_E019` | _Retired in v0.2._ Was: use of the reserved keyword `Background:` (v0, v0.1). No longer reported.                                                                                                                                                 | —                                                       | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `SANMAIME_E020` | Malformed tag line.                                                                                                                                                                                                                               | the line                                                | `Invalid tag '{token}'. A tag is '@' followed by characters other than whitespace, '@' and '#'.`                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `SANMAIME_E021` | An expectation after `Background:`, before the screen's first `Element:` (§5.9). (Without a `Background:` it is `E006`.)                                                                                                                          | the line                                                | `'{Keyword}' is not allowed under 'Background:': a background takes no expectations. Put expectations under an 'Element:'.`                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `SANMAIME_E022` | A condition established twice for one test (§5.9, §5.10): a name repeated in the screen's `Background:` lines, a name repeated among a block's `When:` / `And when:` lines, or a block condition that is a `Background:` condition of the screen. | the repeated `Background:`, `When:` or `And when:` line | `Duplicate background condition '{name}' in screen '{screen}' (first on line {n}).` / `Condition '{name}' is already part of this block (line {n}).` / `Condition '{name}' is already established by 'Background:' (line {n}). Background conditions apply to every block of the screen.`                                                                                                                                                                                                                                                              |
| `SANMAIME_E023` | `And when:` that does not directly follow `When:` or `And when:` (§5.10).                                                                                                                                                                         | the `And when:` line                                    | `'And when:' must directly follow 'When:' or 'And when:'.`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `SANMAIME_E025` | `Background:` outside a screen, or after the screen's first `Element:` (§5.9).                                                                                                                                                                    | the `Background:` line                                  | `'Background:' must appear directly under a 'Screen:', before its first 'Element:'.`                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `SANMAIME_E026` | A value keyword (`Text:`, `Contain:`, `Count:`) whose name has no standalone `=` (§3.9, v0.3).                                                                                                                                                    | the line                                                | `'{Keyword}:' needs a value after ' = '. Write '{Keyword}: {target} = "<text>"' (with spaces around '=').` (`<number>` for `Count:`)                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `SANMAIME_E027` | An invalid value (§3.9, v0.3): a text that is not in double quotes or has a bad escape, a number that is not ASCII digits.                                                                                                                        | the line                                                | `Invalid text '{value}' for '{Keyword}:'. Write the text in double quotes, e.g. "Welcome"; inside them write \" for a quote and \\ for a backslash.` / `Invalid number '{value}' for '{Keyword}:'. Write a whole number: 0, 1, 2, …`                                                                                                                                                                                                                                                                                                                   |

Codes are never reused. New diagnostics get new numbers.

### 7.3 Error recovery

Parsers SHOULD report **all** diagnostics of a file in source order, and
MUST report at least the first one. To avoid cascades, a parser that
continues after an error SHOULD recover as follows:

| After                  | Recovery                                                        |
| ---------------------- | --------------------------------------------------------------- |
| `E001`, `E020`         | ignore the line (for `E020`, discard the tags of that line).    |
| `E002`                 | treat the line as its keyword with an empty name.               |
| `E003`                 | treat the line as the bare state keyword.                       |
| `E026`, `E027`         | keep the expectation (without a usable value) and continue.     |
| `E004`                 | ignore lines up to the next `Screen:` or tag line.              |
| `E005`, `E006`, `E021` | ignore lines up to the next `Element:`, `Screen:` or tag line.  |
| `E023`, `E025`         | ignore the line.                                                |
| `E007`                 | ignore the line.                                                |
| `E017`                 | continue with the default language (§3.4: configured, or `en`). |
| `E024`                 | continue with the default status (`approved`).                  |
| `E018`                 | discard the tags.                                               |
| others                 | keep the offending construct in the AST and continue.           |

A document with at least one error has no defined meaning; generators MUST
NOT generate tests from it.

Clarifications implemented by the reference parser (`src/parser`):

- Lexical diagnostics (`E001`, `E002`, `E003`, `E020`) are reported
  for every line, including lines skipped after `E004`–`E006`; only the
  structural checks are suppressed while skipping.
- Lines ignored by recovery (`E001`, `E020`) do not end a tag group:
  `@a` / `free text` / `Screen: S` reports `E001` and attaches `@a` to `S`.
- Duplicate checks (`E011`–`E014`, `E022`) are not applied to empty names
  (already `E002`), nor to value lines with `E026` / `E027`. `E013` is checked when the block's condition list ends
  (at its first expectation or at the end of the block) but is located at the
  `When:` line. A block condition that repeats both a `Background:` condition
  and an earlier condition of the block reports only the first `E022`.
  `Background:`, `And when:` and tag lines interact like other keywords: tags
  before them are `E018`. When a target is both repeated in its block and asserted
  unconditionally, only `E014` is reported.
- Diagnostics are sorted by line and column; diagnostics at the same location
  keep the order in which they were detected.

---

## 8. Reserved syntax and future extensions

v0 is intentionally strict: every line that is not listed in §3.8 is an
error. Therefore each extension below can be added later without changing
the meaning of any valid v0 file.

| Extension                                                              | Reserved now                                                                                                                                                                                 | Planned for       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| **More keyword languages**                                             | `# language: <code>` directive (§3.4); v0 defines `en` and `ja`. New languages are added as dictionaries ([i18n.md](./i18n.md)).                                                             | any time          |
| **Description** (free text under a header, like Gherkin's description) | Free-text lines are `E001` in v0. A future version may accept non-keyword lines directly after `Screen:` or `Element:` as a description.                                                     | v1                |
| **Background** (conditions shared by all elements of a screen)         | Implemented in v0.2 (§5.9), together with `And when:` (§5.10). Nested `When:` blocks are not planned (indentation is not significant).                                                       | done (v0.2)       |
| **More expectation kinds** (text, count, value, …)                     | Implemented in v0.3 (the vocabulary v1, [expectations.md](./expectations.md)). Any other `Word:` line is still `E001`, so further keywords can be added under the policy of expectations.md. | v0.3 / more later |
| **Trailing comments**                                                  | `#` inside a line is part of the name in v0; trailing comments will not be introduced in a way that changes existing names without a new language version.                                   | not planned       |

---

## 9. Recommended style

Indentation is not significant, but tools that _write_ Sanmaime (the AI
workflow, formatters, snippet generators) SHOULD produce this canonical
layout, which is the layout used in the README:

- `Screen:` at column 1.
- `Element:` indented by 2 spaces; a blank line before each `Element:`
  except when it directly follows `Screen:` (a blank line there is also fine).
- `Background:` indented by 2 spaces, directly after `Screen:`, followed by
  a blank line.
- `When:`, `And when:` and expectations indented by 4 spaces (neither
  `And when:` nor expectations are indented further than their `When:`).
- A blank line between two `When:` blocks and between the unconditional
  block and the first `When:` block.
- One space after each colon; no trailing whitespace; LF line endings; a
  final newline.
- Use `And:` for every consecutive expectation of the same kind rather than
  repeating `Show:`/`Hide:`.
- Write value keywords with one space on each side of `=`:
  `Text: Title = "Welcome"`, `Count: Results = 3`.
- In a non-English file, put `# language: <code>` on the first line and
  write keywords with their primary spelling and the ASCII colon `:`
  (`表示: ユーザー名`); the full-width colon is accepted on input only.

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
that captures everything the language defines. The implemented AST
(`src/parser/ast.ts`, exported by `nimaime-han/parser`) follows it and adds
`uri`, `languageDirective`, `status` (`'draft' | 'approved'`) and
`statusDirective` to the document, `viaAnd` to `Show:`/`Hide:`
expectations and `severity` to diagnostics. Expectation keywords in the AST
are always the canonical (English) keywords, whatever the file's language,
so that generators and runtimes do not depend on the language:

```ts
interface Location {
  line: number;
  column: number;
} // 1-based

interface SanmaimeDocument {
  language: string; // effective keyword language: "en" | "ja"
  screens: Screen[];
}

interface Tag {
  name: string;
  location: Location;
} // name includes "@"

interface Screen {
  name: string;
  tags: Tag[];
  location: Location;
  background: { name: string; location: Location }[]; // v0.2; may be empty
  elements: Element[];
}

interface Element {
  name: string;
  tags: Tag[];
  location: Location;
  unconditional: Expectation[]; // may be empty
  conditions: ConditionBlock[]; // may be empty (but not both)
}

interface ConditionBlock {
  name: string; // the text after "When:" (the first condition)
  conditions: { name: string; keyword: 'When' | 'AndWhen'; location: Location }[]; // v0.2
  title: string; // v0.2: condition names joined with " and "
  tags: Tag[];
  location: Location;
  expectations: Expectation[];
}

type Expectation =
  | {
      kind: 'show' | 'hide'; // And: already resolved
      target: string;
      keyword: 'Show' | 'Hide' | 'And';
      location: Location;
    }
  | {
      // v0.3: Check … Empty; target absent = the element itself
      kind:
        'enable' | 'disable' | 'check' | 'uncheck' | 'focus' | 'editable' | 'readonly' | 'empty';
      keyword:
        'Enable' | 'Disable' | 'Check' | 'Uncheck' | 'Focus' | 'Editable' | 'ReadOnly' | 'Empty';
      target?: string;
      location: Location;
    }
  | {
      // v0.3
      kind: 'text' | 'contain' | 'count';
      keyword: 'Text' | 'Contain' | 'Count';
      target: string;
      value: string | number; // unquoted text, or the number of Count:
      location: Location;
    };

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

| Screen       | Element          | Condition                      | Expectations                                         |
| ------------ | ---------------- | ------------------------------ | ---------------------------------------------------- |
| User Details | Page Header      | _(unconditional)_              | show Page title, show Back link                      |
| User Details | User Information | Viewing your own profile       | show Username, show Full name, show Email address    |
| User Details | User Information | Viewing another user's profile | show Username, hide Full name, hide Email address    |
| User Details | Edit Button      | _(unconditional)_              | show Edit icon                                       |
| User Details | Edit Button      | Viewing your own profile       | element enabled                                      |
| User Details | Edit Button      | Viewing another user's profile | element disabled                                     |
| Login        | Login Form       | _(unconditional)_              | show Email address, show Password, show Login button |
| Login        | Login Button     | Input is valid                 | element enabled                                      |
| Login        | Login Button     | Input is invalid               | element disabled                                     |

Notes:

- `Viewing your own profile` is used by two elements of _User Details_; it is
  one condition, established once.
- `Email address` on _User Details / User Information_ and on
  _Login / Login Form_ are unrelated targets (different elements).
- _Page Header_ and _Edit Button / Edit icon_ are invariants: they hold in
  the base state and in both condition states.
- The screen _User Details_ carries the tag `@profile`: every test of that
  screen has it (§5.8), so `nimaime-gen --tags @profile` generates only the
  six _User Details_ tests.

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

Valid fixtures named `ja-*.sanmaime` use `# language: ja` (the test suite
checks that they parse as `ja`); all other valid fixtures use English
keywords. `valid/ja-english-names.sanmaime` has the same layout and names as
`valid/readme-user-details.sanmaime`, so both produce the same screens.
Fixtures are parsed without a `language` option.

---

## 13. Design decisions

| #   | Decision                                                                                                                                                                                                             | Reason                                                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Extension `.sanmaime`, UTF-8, BOM ignored, LF/CRLF/CR accepted.                                                                                                                                                      | Mirrors `.feature`; UTF-8 is needed for Japanese names; tolerant line endings avoid Windows friction.                                                                                                         |
| D2  | Line-oriented grammar; **indentation is not significant**; lines are trimmed.                                                                                                                                        | Same as Gherkin. Indentation errors are the most common mistake in hand-written and AI-written text, and the keyword order already determines the structure unambiguously. A formatter can normalise layout.  |
| D3  | Structure by keyword nesting: `Screen:` > `Element:` > `When:` > expectations.                                                                                                                                       | Matches every README example; each keyword has exactly one possible parent.                                                                                                                                   |
| D4  | Keywords are case-sensitive. Their spelling depends on the file's language (`en` default, `ja`); only one language's keywords are recognised per file.                                                               | Predictable tokenising; same model as Gherkin's `# language:`. Mixing languages in a file would make every future keyword a potential clash.                                                                  |
| D5  | Name keywords end with `:` and take the rest of the line as the name; `Enable`/`Disable` have no colon and no argument.                                                                                              | The colon visually marks "a name follows". Bare keywords state a property of the element itself, as in the README Login example.                                                                              |
| D6  | Names are arbitrary text (any script, any punctuation), trimmed, compared exactly, unquoted.                                                                                                                         | Names must read naturally in any language and must match TypeScript definition keys literally (`defineElement("User Information", { "Username": … })`).                                                       |
| D7  | `#` starts a comment only as the first non-whitespace character; no trailing comments.                                                                                                                               | Lets names contain `#` (`Order #1234`), same as Gherkin.                                                                                                                                                      |
| D8  | Blank lines are ignored and never end a block.                                                                                                                                                                       | The README uses blank lines freely inside elements.                                                                                                                                                           |
| D9  | `And:` continues the nearest `Show:`/`Hide:` group in the same block; it cannot start a block or follow `Enable`/`Disable`.                                                                                          | Required by the README (`Hide: Full name` / `And: Email address` means hidden). Forbidding the edge cases removes all ambiguity.                                                                              |
| D10 | Expectations before the first `When:` are an unconditional block with invariant meaning; everything after a `When:` belongs to it until the next `When:`/`Element:`/`Screen:`.                                       | Matches the README Login and AI-draft examples. The "until next header" rule makes blocks unambiguous without indentation.                                                                                    |
| D11 | Multiple `When:` blocks per element; multiple screens per file; the same condition name may appear in several elements of a screen and denotes one condition.                                                        | README examples; lets the runtime set up a state once for several elements.                                                                                                                                   |
| D12 | Duplicates (screen, element, condition, target in a block, state in a block) and re-assertion of unconditional facts are errors.                                                                                     | Keeps one canonical place for every fact, which matters for human review of AI drafts. Strict now, relaxable later without breaking files.                                                                    |
| D13 | Empty screen / element / condition block is an error; an empty file is valid.                                                                                                                                        | A header with nothing under it is almost always a truncated specification; an empty file is harmless (same as an empty `.feature`).                                                                           |
| D14 | Unknown lines are errors (no free-text description in v0); `Background:` reserved (until v0.2).                                                                                                                      | Every future extension (description, background, new expectation kinds) can be added without changing the meaning of existing valid files.                                                                    |
| D15 | Stable diagnostic codes `SANMAIME_Ennn` with line and column; fixtures declare the expected code and location.                                                                                                       | Tests, editors and AI repair loops can match on codes rather than message text.                                                                                                                               |
| D16 | Japanese keywords `画面` `要素` `条件` `表示` `非表示` `かつ` `有効` `無効` (`背景` reserved until v0.1); `かつ` as in Gherkin's `ja`.                                                                               | Short nouns that read naturally as headings; `表示`/`非表示` mirror Show/Hide; `条件` (condition) matches the runtime's "condition" concept better than Gherkin's `もし`.                                     |
| D17 | Japanese keywords accept the full-width colon `：` as well as `:`; English keywords do not.                                                                                                                          | Japanese IMEs type `：` by default, and the two are hard to tell apart visually. English files stay strictly ASCII so nothing changes for them.                                                               |
| D18 | The file's directive beats the configured default language; an unsupported configured language throws instead of producing per-file diagnostics.                                                                     | A file that declares its language must mean the same in every project. A bad config value is one mistake, not one per file.                                                                                   |
| D19 | Messages stay in English; quoted keywords follow the file's language. The AST keeps canonical English keywords.                                                                                                      | Diagnostic codes are the stable interface; quoting the author's own keywords makes messages actionable. Downstream tools stay language-independent.                                                           |
| D20 | Tags (v0.1) go before `Screen:`, `Element:` and `When:`; a test's tags are the union of its screen's, element's and block's tags; selection uses Cucumber tag expressions.                                           | Same model and expression syntax as Gherkin / playwright-bdd, so users and CI setups carry over. Allowing tags only before header lines keeps them unambiguous (the unconditional block inherits).            |
| D21 | The review status is a header directive, `# status: draft` / `# status: approved`; a file without it is approved.                                                                                                    | The status travels with the file and shows up in code review (a PR that approves a spec changes that line); no directory convention or Git metadata is needed, and existing files keep their meaning.         |
| D22 | `Background:` (v0.2) goes directly under `Screen:` and lists condition names only; its conditions run after `open`, before each block's conditions, for every block including the unconditional one.                 | Same role as Gherkin's `Background:`. Naming conditions (not steps or expectations) keeps backgrounds reusable as ordinary `defineCondition()`s, and keeps expectations in exactly one place (`E021`).        |
| D23 | Conditions are combined with `And when:` lines (v0.2), not by nesting `When:` blocks; the block title joins the names with `" and "` in every language.                                                              | Indentation is not significant (D2), so nesting could not be expressed without changing that rule. A flat list is unambiguous, keeps the execution order visible, and gives each test one readable title.     |
| D24 | A condition is established at most once per test: repeating it (in the background, in a block, or both) is `E022`; the runtime also skips a condition already established in the test.                               | One place for every fact (D12); prevents a background from silently running twice.                                                                                                                            |
| D25 | The expectation vocabulary v1 (v0.3) adds only keywords that read as requirements and map 1:1 to a Playwright web-first assertion ([expectations.md](./expectations.md)); the mapping is one table (`EXPECTATIONS`). | Keeps Sanmaime a specification rather than a test script; one table keeps the parser, generator, runtime, reporter and editor grammar in step.                                                                |
| D26 | State keywords take an optional target after a colon (`Check: Remember me`); alone they are about the element itself, as `Enable` always was.                                                                        | Checkboxes and inputs are usually targets of a form element; a `self` locator per checkbox would force one element per control. The bare form keeps every v0 file valid.                                      |
| D27 | Value keywords are `<Keyword>: <target> = <value>`, split at the first standalone `=`; texts are double-quoted with `\"` / `\\` escapes, numbers plain digits.                                                       | One line, readable, unambiguous: names stay unquoted (D6) while values, which may contain anything (spaces, `=`, trailing spaces), are quoted. Splitting at the first standalone `=` lets values contain one. |
| D28 | The one-fact rules (E014–E016) are per family (`Show`/`Hide`, `Check`/`Uncheck`, …), not per target; `And:` continues only `Show:`/`Hide:`.                                                                          | `Show: Title` and `Text: Title = "…"` are two facts; `Check: X` and `Uncheck: X` contradict. `And:` with values would be ambiguous.                                                                           |

---

## 14. 日本語サマリ

- **拡張子**は `.sanmaime`、文字コードは UTF-8(BOM は無視)。改行は LF / CRLF / CR のいずれも可。
- **行指向**の文法。各行は前後の空白(全角スペースを含む)を除去してから解釈する。**インデントは意味を持たない**(Gherkin と同じ)。構造はキーワードの順序 `Screen:` > `Element:` > `When:` > 期待 だけで決まる。
- **キーワード**: `Screen:` `Background:` `Element:` `When:` `And when:` `Show:` `Hide:` `And:`(名前を取る)、状態キーワード `Enable` `Disable` `Check` `Uncheck` `Focus` `Editable` `ReadOnly` `Empty`(単独なら要素自身、`Check: 対象` のようにコロンと対象を書くとその対象の状態。v0.3)、値つきキーワード `Text: 対象 = "文字列"` `Contain: 対象 = "文字列"` `Count: 対象 = 数`(v0.3)。大文字小文字を区別する。期待語彙の一覧と追加方針は [expectations.md](./expectations.md)。
- **日本語キーワード**: ファイル先頭(ヘッダ)に `# language: ja` と書くと、`画面:` `背景:` `要素:` `条件:` `かつ条件:` `表示:` `非表示:` `かつ:` `有効` `無効` `チェック` `未チェック` `フォーカス` `編集可` `読取専用` `空` `テキスト:` `含む:` `件数:` を使う。日本語キーワードの後のコロンは半角 `:` でも全角 `：` でもよい。1 つのファイルでは 1 つの言語のキーワードだけが有効(`ja` のファイルで `Show:` は E001)。設定ファイルの `language` オプションはディレクティブのないファイルの既定言語で、ファイル内の `# language:` が常に優先される。診断メッセージは英語だが、引用するキーワードはファイルの言語で表示する。
- **名前**はコロン以降の行末までの文字列(前後の空白を除去)。日本語・記号・`:`・`#` を含む任意の文字を使える。引用符やエスケープはない。
- **コメント**は行頭(空白の後)が `#` の行のみ。行末コメントはない。**空行**はどこでも無視され、ブロックを終わらせない。
- **`And:`** は同じブロック内の直前の `Show:` / `Hide:` の種類を引き継ぐ。ブロック先頭や `Enable` / `Disable` の直後の `And:` はエラー(E007)。
- **`When:` なしの期待**(要素直下、最初の `When:` より前)は無条件ブロックで、画面のすべての状態で成り立つ不変条件。最低限ベース状態(条件適用前)で検証する。
- 1 つの `Element:` に**複数の `When:`** を書ける。同じ画面内の別要素で同じ `When:` 名を使うと同じ条件を指す。1 ファイルに**複数の `Screen:`** を書ける。
- 重複(画面名・要素名・条件名・同一ブロック内の同じ対象・同じ系統の事実)や、無条件ブロックで宣言済みの事実を条件ブロックで再宣言することはエラー。系統は 表示/非表示、有効/無効、チェック/未チェック、編集可/読取専用、フォーカス、空、テキスト、含む(文字列ごと)、件数(v0.3)。
- **値つきの期待**(v0.3, §3.9): 対象と値は最初の「前後に空白のある `=`」で分ける。文字列は半角の `"` で囲み、`\"` と `\\` だけがエスケープ。`=` がなければ E026、値が不正なら E027。空の画面・要素・条件ブロックもエラー。空ファイルは有効。
- **背景**(v0.2, §5.9): `Screen:` の直下(最初の `Element:` より前)に `Background: <条件名>` を書くと、その画面のすべての要素のすべてのブロック(無条件ブロックを含む)で、画面を開いた後・各ブロックの条件の前に、その条件が順に適用される(Gherkin の Background に相当)。期待は書けない(E021)。複数行可、同名の重複は E022。
- **条件の組み合わせ**(v0.2, §5.10): `When: A` の直後に `And when: B`(日本語 `かつ条件: B`)を書くと、A → B の順に条件を適用した状態での期待になる。テスト名は `When: A and B`(言語によらず `and` で連結)。`When:` の直後以外の `And when:` は E023。インデントに意味がないため `When:` の入れ子はサポートしない。
- **診断**は `SANMAIME_E001`〜`SANMAIME_E027` の安定したコードと行・桁を持つ(§7。E019 は v0.2 で廃止、E024 は `# status:`、E026/E027 は値つきの期待)。
- **ステータス**: ヘッダに `# status: draft` と書いたファイルは下書き(「今アプリがしていること」)、`# status: approved` またはディレクティブなしは承認済み(「アプリがすべきこと」)。`nimaime-gen` は既定で下書きを生成しない(`--include-drafts` で含める)。`nimaime approve` で承認済みに書き換え、`nimaime diff` で承認済み仕様と現在の画面の差分を見る([review-workflow.md](./review-workflow.md))。値の誤りや重複は E024。
- **タグ**(v0.1): `@smoke @wip` のような `@tag` 行を `Screen:` / `Element:` / `When:` の直前に書く。テスト(要素の各ブロック)のタグは画面・要素・`When:` ブロックのタグの和集合。`nimaime-gen --tags "@smoke and not @wip"`(または設定の `tags`)で生成するテストを絞り込める。生成コードは Playwright の `tag` を持つので `npx playwright test --grep @smoke` でも絞れ、定義からは `$tags` フィクスチャで参照できる。タグは言語に依存しない。
- **将来拡張の予約**: `# language: xx`(v0 は `en` と `ja`。言語は辞書の追加で増やせる)、自由記述の Description(v0 ではエラー)。`Background:` は v0.1 まで予約語(E019)で、v0.2 で導入された。
- **テストフィクスチャ**は `examples/sanmaime/valid/` と `examples/sanmaime/invalid/`。無効例は先頭に `# expect: SANMAIME_Ennn` と `# at: 行:桁` を書く。

---

See also: [expectations.md](./expectations.md) (the expectation keywords) ·
[i18n.md](./i18n.md) (keyword languages) · [getting-started.md](./getting-started.md) ·
[api.md](./api.md#nimaime-hanparser) (the parser API) · [documentation index](./README.md)
