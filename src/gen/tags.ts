/**
 * Tag semantics of the generator (docs/sanmaime.md §5.8): the tags of a test are the union of the
 * tags of its screen, its element and its `When:` block; `--tags` / the config's `tags` select the
 * tests to generate.
 */
import type { SanmaimeDocument, Tag } from '../parser';
import type { TagExpression } from './tag-expression';

/** Tag names (with `@`), deduplicated, in order of first appearance. */
export function tagNames(...groups: readonly (readonly Tag[])[]): string[] {
  const names = new Set<string>();
  for (const group of groups) for (const tag of group) names.add(tag.name);
  return [...names];
}

/** The result of `filterDocumentByTags()`. */
export interface TagFilterResult {
  /** The document with only the selected tests (screens and elements left empty are dropped). */
  document: SanmaimeDocument;
  /** Number of tests (blocks) kept. */
  kept: number;
  /** Number of tests (blocks) left out because their tags do not match. */
  removed: number;
}

/**
 * `document` without the blocks (tests) whose tags do not match `expression`. An element's
 * unconditional block has the tags of its screen and element; a `When:` block also has its own.
 * Elements left without blocks and screens left without elements are dropped.
 *
 * Works on the AST so that missing definitions are only reported for the selected tests.
 */
export function filterDocumentByTags(
  document: SanmaimeDocument,
  expression: TagExpression,
): TagFilterResult {
  let kept = 0;
  let removed = 0;
  const count = (selected: boolean): boolean => {
    if (selected) kept++;
    else removed++;
    return selected;
  };
  const screens = document.screens
    .map((screen) => ({
      ...screen,
      elements: screen.elements
        .map((element) => {
          const inherited = tagNames(screen.tags, element.tags);
          const unconditional =
            element.unconditional.length > 0 && count(expression.evaluate(inherited))
              ? element.unconditional
              : [];
          const conditions = element.conditions.filter((condition) =>
            count(expression.evaluate(tagNames(screen.tags, element.tags, condition.tags))),
          );
          return { ...element, unconditional, conditions };
        })
        .filter((element) => element.unconditional.length > 0 || element.conditions.length > 0),
    }))
    .filter((screen) => screen.elements.length > 0);
  return { document: { ...document, screens }, kept, removed };
}
