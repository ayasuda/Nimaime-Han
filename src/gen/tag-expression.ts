/**
 * Tag expressions for `nimaime-gen --tags` and the config's `tags` option: the Cucumber syntax
 * (the counterpart of playwright-bdd's `--tags`), e.g. `@smoke and not @wip`,
 * `(@a or @b) and not @slow`. See docs/cli.md, "Tags".
 *
 * Grammar (precedence `not` > `and` > `or`; `and` and `or` are left-associative):
 *
 *   expression = or ;
 *   or         = and , { "or" , and } ;
 *   and        = not , { "and" , not } ;
 *   not        = "not" , not | primary ;
 *   primary    = "(" , expression , ")" | tag ;
 *   tag        = "@" , tag-char , { tag-char } ;   (* as in .sanmaime files *)
 *
 * Tokens are separated by whitespace; `(` and `)` are tokens on their own and need no spaces.
 * Keywords are lowercase. An empty expression matches everything. Pure: no I/O.
 */

/** A parsed tag expression. */
export interface TagExpression {
  /** Whether a test with these tags (each including its `@`) is selected. */
  evaluate(tags: readonly string[]): boolean;
  /** Normalized text of the expression, fully parenthesized (for messages); `''` if empty. */
  toString(): string;
}

/** A syntax error in a tag expression (the CLI exits with code 2). */
export class TagExpressionError extends Error {
  override name = 'TagExpressionError';

  constructor(
    /** The expression as given. */
    readonly expression: string,
    /** What is wrong. */
    readonly reason: string,
    /** 1-based column of the offending token (or one past the end). */
    readonly column: number,
  ) {
    super(`Invalid tag expression '${expression}' (column ${String(column)}): ${reason}`);
  }
}

type Node =
  | { type: 'tag'; name: string }
  | { type: 'not'; operand: Node }
  | { type: 'and' | 'or'; left: Node; right: Node };

interface Token {
  text: string;
  /** 1-based column. */
  column: number;
}

const KEYWORDS = new Set(['and', 'or', 'not']);
/** A tag: `@` followed by characters other than whitespace, `@`, `#`, `(` and `)`. */
const TAG = /^@[^\s@#()]+$/;

/** Length in code points (columns count code points, like parser locations). */
function codePointLength(text: string): number {
  let length = 0;
  for (const _ of text) length++;
  return length;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /[()]|[^\s()]+/gu;
  for (const match of text.matchAll(pattern)) {
    const column = codePointLength(text.slice(0, match.index)) + 1;
    tokens.push({ text: match[0], column });
  }
  return tokens;
}

function describeToken(token: Token | undefined): string {
  return token === undefined ? 'the end of the expression' : `'${token.text}'`;
}

class TagExpressionParser {
  private index = 0;
  private readonly tokens: Token[];
  private readonly end: number;

  constructor(private readonly text: string) {
    this.tokens = tokenize(text);
    this.end = codePointLength(text) + 1;
  }

  parse(): Node | undefined {
    if (this.tokens.length === 0) return undefined;
    const node = this.or();
    const extra = this.peek();
    if (extra !== undefined) {
      const reason =
        extra.text === ')'
          ? `unmatched ')'.`
          : `expected 'and', 'or' or the end of the expression, found ${describeToken(extra)}.`;
      this.fail(reason, extra);
    }
    return node;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private fail(reason: string, token: Token | undefined): never {
    throw new TagExpressionError(this.text, reason, token?.column ?? this.end);
  }

  private or(): Node {
    let left = this.and();
    while (this.peek()?.text === 'or') {
      this.index++;
      left = { type: 'or', left, right: this.and() };
    }
    return left;
  }

  private and(): Node {
    let left = this.not();
    while (this.peek()?.text === 'and') {
      this.index++;
      left = { type: 'and', left, right: this.not() };
    }
    return left;
  }

  private not(): Node {
    if (this.peek()?.text === 'not') {
      this.index++;
      return { type: 'not', operand: this.not() };
    }
    return this.primary();
  }

  private primary(): Node {
    const token = this.peek();
    const previous = this.tokens[this.index - 1];
    const after = previous === undefined ? '' : ` after '${previous.text}'`;
    if (token === undefined) {
      this.fail(`expected a tag, 'not' or '('${after}, found the end of the expression.`, token);
    }
    if (token.text === '(') {
      this.index++;
      const node = this.or();
      const close = this.peek();
      if (close?.text !== ')') {
        this.fail(
          `expected ')' to close the '(' at column ${String(token.column)}, found ${describeToken(close)}.`,
          close,
        );
      }
      this.index++;
      return node;
    }
    if (TAG.test(token.text)) {
      this.index++;
      return { type: 'tag', name: token.text };
    }
    if (KEYWORDS.has(token.text) || token.text === ')') {
      this.fail(`expected a tag, 'not' or '('${after}, found '${token.text}'.`, token);
    }
    const hint = token.text.startsWith('@')
      ? `a tag is '@' followed by characters other than whitespace, '@', '#', '(' and ')'`
      : `tags start with '@' and operators are lowercase 'and', 'or' and 'not'`;
    this.fail(`'${token.text}' is not a tag (${hint}).`, token);
  }
}

function evaluate(node: Node, tags: ReadonlySet<string>): boolean {
  switch (node.type) {
    case 'tag':
      return tags.has(node.name);
    case 'not':
      return !evaluate(node.operand, tags);
    case 'and':
      return evaluate(node.left, tags) && evaluate(node.right, tags);
    case 'or':
      return evaluate(node.left, tags) || evaluate(node.right, tags);
  }
}

function print(node: Node): string {
  switch (node.type) {
    case 'tag':
      return node.name;
    case 'not':
      return `not ${print(node.operand)}`;
    case 'and':
    case 'or':
      return `(${print(node.left)} ${node.type} ${print(node.right)})`;
  }
}

/**
 * Parses a Cucumber-style tag expression (`@a and not (@b or @c)`).
 *
 * @throws TagExpressionError for a syntax error.
 */
export function parseTagExpression(text: string): TagExpression {
  const node = new TagExpressionParser(text).parse();
  if (node === undefined) {
    return { evaluate: () => true, toString: () => '' };
  }
  return {
    evaluate: (tags) => evaluate(node, new Set(tags)),
    toString: () => print(node),
  };
}
