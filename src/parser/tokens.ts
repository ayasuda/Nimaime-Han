/**
 * Line-based lexer for Sanmaime (docs/sanmaime.md §3).
 *
 * Every physical line is trimmed and classified on its own (§3.8). The lexer never reports
 * diagnostics itself: malformed lines become dedicated token types that the parser turns into
 * diagnostics, so that all messages live in one place.
 */
import type { Location, Tag } from './ast';

/** Keywords that take a name after their colon (`Show: Username`). */
export const NAME_KEYWORDS = ['Screen', 'Element', 'When', 'Show', 'Hide', 'And'] as const;
export type NameKeyword = (typeof NAME_KEYWORDS)[number];

/** Keywords that stand alone on their line and take no argument. */
export const BARE_KEYWORDS = ['Enable', 'Disable'] as const;
export type BareKeyword = (typeof BARE_KEYWORDS)[number];

/** Keywords reserved for a future version (`SANMAIME_E019`). */
export const RESERVED_KEYWORDS = ['Background'] as const;
export type ReservedKeyword = (typeof RESERVED_KEYWORDS)[number];

/** Blank line (§3.2). */
export interface BlankToken {
  type: 'blank';
  location: Location;
}

/** Comment line (§3.3). `directive` is set when the line has the shape of a language directive. */
export interface CommentToken {
  type: 'comment';
  text: string;
  /** Trimmed value of `# language: <value>`; only meaningful in the header (§3.4). */
  directive: string | undefined;
  location: Location;
}

/** Well-formed tag line (§3.7). */
export interface TagsToken {
  type: 'tags';
  tags: Tag[];
  location: Location;
}

/** Tag line with a token that is not a tag (`SANMAIME_E020`). */
export interface InvalidTagsToken {
  type: 'invalid-tags';
  /** The first offending token. */
  token: string;
  location: Location;
}

/** `Screen:`, `Element:`, `When:`, `Show:`, `Hide:` or `And:`; `name` is `""` when missing (E002). */
export interface NameKeywordToken {
  type: 'name-keyword';
  keyword: NameKeyword;
  name: string;
  location: Location;
}

/** `Enable` / `Disable`. `hasArgument` is set for `Enable: X`, `Disable:` etc. (E003). */
export interface BareKeywordToken {
  type: 'bare-keyword';
  keyword: BareKeyword;
  hasArgument: boolean;
  location: Location;
}

/** A reserved keyword such as `Background:` (E019). */
export interface ReservedToken {
  type: 'reserved';
  keyword: ReservedKeyword;
  location: Location;
}

/** Any other line (E001). */
export interface UnknownToken {
  type: 'unknown';
  text: string;
  location: Location;
}

export type LineToken =
  | BlankToken
  | CommentToken
  | TagsToken
  | InvalidTagsToken
  | NameKeywordToken
  | BareKeywordToken
  | ReservedToken
  | UnknownToken;

/** Tokens that are ignored by the syntactic grammar (§3.8). */
export function isInsignificant(token: LineToken): token is BlankToken | CommentToken {
  return token.type === 'blank' || token.type === 'comment';
}

/**
 * Split source text into physical lines. A leading BOM is dropped; LF, CRLF and lone CR are all
 * line breaks. The returned array always has at least one element.
 */
export function splitLines(source: string): string[] {
  const text = source.startsWith('﻿') ? source.slice(1) : source;
  return text.split(/\r\n|\r|\n/);
}

// `\s` in ECMAScript matches exactly the characters removed by String.prototype.trim() (§3.1).
const DIRECTIVE = /^#\s*language\s*:\s*(.*)$/;
const TAG = /^@[^\s@#]+$/;
const WHITESPACE_RUN = /\s+/;

/** Number of Unicode code points in `text`. */
function codePointLength(text: string): number {
  return Array.from(text).length;
}

/** Classify one physical line (without its line break) according to §3.8. */
export function classifyLine(raw: string, line: number): LineToken {
  const t = raw.trim();
  // Leading whitespace characters are all in the BMP, so UTF-16 length equals code point count.
  const column = raw.length - raw.trimStart().length + 1;
  const location: Location = { line, column };

  // Rule 1: blank.
  if (t === '') return { type: 'blank', location: { line, column: 1 } };

  // Rule 2: comment (or language directive).
  if (t.startsWith('#')) {
    const match = DIRECTIVE.exec(t);
    return { type: 'comment', text: t, directive: match?.[1]?.trim(), location };
  }

  // Rule 3: tag line.
  if (t.startsWith('@')) return classifyTagLine(t, location);

  // Rule 4: name keyword.
  for (const keyword of NAME_KEYWORDS) {
    const prefix = `${keyword}:`;
    if (t.startsWith(prefix)) {
      return { type: 'name-keyword', keyword, name: t.slice(prefix.length).trim(), location };
    }
  }

  // Rules 5 and 6: bare keyword, or bare keyword followed by whitespace or a colon.
  for (const keyword of BARE_KEYWORDS) {
    if (t === keyword) return { type: 'bare-keyword', keyword, hasArgument: false, location };
    if (t.startsWith(keyword)) {
      const next = t.charAt(keyword.length);
      if (next === ':' || /\s/.test(next)) {
        return { type: 'bare-keyword', keyword, hasArgument: true, location };
      }
    }
  }

  // Rule 7: reserved keywords.
  for (const keyword of RESERVED_KEYWORDS) {
    if (t.startsWith(`${keyword}:`)) return { type: 'reserved', keyword, location };
  }

  // Rule 8: anything else.
  return { type: 'unknown', text: t, location };
}

function classifyTagLine(t: string, location: Location): TagsToken | InvalidTagsToken {
  const tags: Tag[] = [];
  let rest = t;
  let offset = 0; // code points consumed from `t`
  while (rest !== '') {
    const ws = WHITESPACE_RUN.exec(rest);
    const tokenText = ws ? rest.slice(0, ws.index) : rest;
    if (!TAG.test(tokenText)) return { type: 'invalid-tags', token: tokenText, location };
    tags.push({
      name: tokenText,
      location: { line: location.line, column: location.column + offset },
    });
    if (!ws) break;
    const consumed = rest.slice(0, ws.index + ws[0].length);
    offset += codePointLength(consumed);
    rest = rest.slice(consumed.length);
  }
  return { type: 'tags', tags, location };
}

/** Split and classify a whole source text. Line numbers are 1-based. */
export function tokenize(source: string): LineToken[] {
  return splitLines(source).map((raw, index) => classifyLine(raw, index + 1));
}
