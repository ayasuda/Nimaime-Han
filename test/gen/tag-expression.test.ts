import { describe, expect, it } from 'vitest';
import { parseTagExpression, TagExpressionError } from '../../src/gen/tag-expression';

describe('parseTagExpression: evaluation', () => {
  // [expression, tags, expected]
  const cases: [string, string[], boolean][] = [
    ['@a', ['@a'], true],
    ['@a', ['@b'], false],
    ['@a', [], false],
    ['@a', ['@A'], false],
    ['not @a', ['@a'], false],
    ['not @a', ['@b'], true],
    ['not not @a', ['@a'], true],
    ['@a and @b', ['@a', '@b'], true],
    ['@a and @b', ['@a'], false],
    ['@a or @b', ['@b'], true],
    ['@a or @b', ['@c'], false],
    ['@smoke and not @wip', ['@smoke'], true],
    ['@smoke and not @wip', ['@smoke', '@wip'], false],
    ['@smoke and not @wip', ['@wip'], false],
    // `and` binds tighter than `or`; `not` binds tighter than both.
    ['@a or @b and @c', ['@a'], true],
    ['@a or @b and @c', ['@b'], false],
    ['(@a or @b) and @c', ['@a'], false],
    ['(@a or @b) and @c', ['@b', '@c'], true],
    ['not @a and @b', ['@b'], true],
    ['not (@a and @b)', ['@a', '@b'], false],
    ['not (@a and @b)', ['@a'], true],
    ['not(@a)', ['@b'], true],
    ['((@a))', ['@a'], true],
    ['@a and (@b or not @c)', ['@a'], true],
    ['@a and (@b or not @c)', ['@a', '@c'], false],
    ['  @a\tand\n@b  ', ['@a', '@b'], true],
    ['@日本語タグ or @owner:team', ['@owner:team'], true],
    ['@日本語タグ', ['@日本語タグ'], true],
    ['', [], true],
    ['   ', ['@a'], true],
  ];

  it.each(cases)('%j with %j is %s', (expression, tags, expected) => {
    expect(parseTagExpression(expression).evaluate(tags)).toBe(expected);
  });
});

describe('parseTagExpression: toString', () => {
  it.each([
    ['@a', '@a'],
    ['@a and @b or @c', '((@a and @b) or @c)'],
    ['@a or @b and @c', '(@a or (@b and @c))'],
    ['not (@a or @b)', 'not (@a or @b)'],
    ['@a and @b and @c', '((@a and @b) and @c)'],
    ['', ''],
  ])('%j -> %j', (expression, printed) => {
    expect(parseTagExpression(expression).toString()).toBe(printed);
  });
});

describe('parseTagExpression: errors', () => {
  // [expression, column, reason]
  const cases: [string, number, string][] = [
    ['@a and', 7, `expected a tag, 'not' or '(' after 'and', found the end of the expression.`],
    ['not', 4, `expected a tag, 'not' or '(' after 'not', found the end of the expression.`],
    ['and @a', 1, `expected a tag, 'not' or '(', found 'and'.`],
    ['@a or or @b', 7, `expected a tag, 'not' or '(' after 'or', found 'or'.`],
    ['@a @b', 4, `expected 'and', 'or' or the end of the expression, found '@b'.`],
    ['(@a', 4, `expected ')' to close the '(' at column 1, found the end of the expression.`],
    ['@a)', 3, `unmatched ')'.`],
    ['()', 2, `expected a tag, 'not' or '(' after '(', found ')'.`],
    [
      'smoke',
      1,
      `'smoke' is not a tag (tags start with '@' and operators are lowercase 'and', 'or' and 'not').`,
    ],
    ['@a AND @b', 4, `expected 'and', 'or' or the end of the expression, found 'AND'.`],
    [
      '@a#b',
      1,
      `'@a#b' is not a tag (a tag is '@' followed by characters other than whitespace, '@', '#', '(' and ')').`,
    ],
    [
      '@',
      1,
      `'@' is not a tag (a tag is '@' followed by characters other than whitespace, '@', '#', '(' and ')').`,
    ],
    ['@日本 and', 8, `expected a tag, 'not' or '(' after 'and', found the end of the expression.`],
  ];

  it.each(cases)('%j fails at column %i', (expression, column, reason) => {
    let caught: unknown;
    try {
      parseTagExpression(expression);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(TagExpressionError);
    const error = caught as TagExpressionError;
    expect(error.name).toBe('TagExpressionError');
    expect(error.reason).toBe(reason);
    expect(error.column).toBe(column);
    expect(error.expression).toBe(expression);
    expect(error.message).toBe(
      `Invalid tag expression '${expression}' (column ${String(column)}): ${reason}`,
    );
  });
});
