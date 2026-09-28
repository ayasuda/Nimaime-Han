import { describe, expect, it } from 'vitest';
import { parseTagExpression } from '../../src/gen/tag-expression';
import { filterDocumentByTags, tagNames } from '../../src/gen/tags';
import { parse, type SanmaimeDocument } from '../../src/parser';

const SOURCE = `@screen
Screen: A
  @e1
  Element: One
    Show: X

    @c1
    When: C1
    Hide: W

    When: C2
    Hide: W

  Element: Two
    @c1 @c2
    When: C1
    Show: Y

Screen: B
  Element: Three
    Show: Z
`;

function doc(): SanmaimeDocument {
  const { document, diagnostics } = parse(SOURCE);
  expect(diagnostics).toEqual([]);
  return document;
}

/** `Screen > Element > block` of every test left in `document`. */
function tests(document: SanmaimeDocument): string[] {
  return document.screens.flatMap((s) =>
    s.elements.flatMap((e) => [
      ...(e.unconditional.length > 0 ? [`${s.name} > ${e.name} > Always`] : []),
      ...e.conditions.map((c) => `${s.name} > ${e.name} > ${c.name}`),
    ]),
  );
}

describe('tagNames', () => {
  it('merges tag groups, dropping duplicates and keeping the first order', () => {
    const tag = (name: string) => ({ name, location: { line: 1, column: 1 } });
    expect(tagNames([tag('@a'), tag('@b')], [], [tag('@b'), tag('@c'), tag('@a')])).toEqual([
      '@a',
      '@b',
      '@c',
    ]);
    expect(tagNames()).toEqual([]);
  });
});

describe('filterDocumentByTags', () => {
  it.each([
    ['@screen', ['A > One > Always', 'A > One > C1', 'A > One > C2', 'A > Two > C1'], 1],
    ['not @screen', ['B > Three > Always'], 4],
    ['@e1', ['A > One > Always', 'A > One > C1', 'A > One > C2'], 2],
    ['@c1', ['A > One > C1', 'A > Two > C1'], 3],
    ['@c1 and not @c2', ['A > One > C1'], 4],
    ['@e1 and not @c1', ['A > One > Always', 'A > One > C2'], 3],
    ['@none', [], 5],
  ])('%s', (expression, expected, removed) => {
    const result = filterDocumentByTags(doc(), parseTagExpression(expression));
    expect(tests(result.document)).toEqual(expected);
    expect(result.kept).toBe(expected.length);
    expect(result.removed).toBe(removed);
  });

  it('drops elements and screens left empty and does not modify the input', () => {
    const input = doc();
    const before = JSON.stringify(input);
    const result = filterDocumentByTags(input, parseTagExpression('@c2'));
    expect(result.document.screens.map((s) => s.name)).toEqual(['A']);
    expect(result.document.screens[0]?.elements.map((e) => e.name)).toEqual(['Two']);
    expect(JSON.stringify(input)).toBe(before);
  });
});
