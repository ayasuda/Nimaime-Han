// The `$tags` fixture: the tags Playwright collects from `{ tag }` details (as generated from
// Sanmaime @tags), available to tests and to definition callbacks.
import { createNimaime } from '../../../src/index';
import { expect, test } from '../../../src/runtime/index';

const { defineElement, defineCondition } = createNimaime();

defineElement('Tagged Button', ({ page }) => page.getByRole('button', { name: 'Tagged' }));
defineCondition('Rendered for the tags', async ({ page, $tags }) => {
  const disabled = $tags.includes('@disabled') ? ' disabled' : '';
  await page.setContent(`<button${disabled}>Tagged</button>`);
});

test.describe('Screen: Tagged', { tag: ['@screen'] }, () => {
  test.describe('Element: Tagged Button', { tag: '@element' }, () => {
    test(
      'When: Rendered for the tags',
      { tag: ['@disabled', '@screen'] },
      async ({ $nimaime, $tags, page }) => {
        expect($tags).toEqual(['@screen', '@element', '@disabled']);
        await $nimaime.run(
          { $tags, page },
          {
            screen: 'Tagged',
            element: 'Tagged Button',
            condition: 'Rendered for the tags',
            expectations: [{ kind: 'disable' }],
          },
        );
      },
    );
  });
});

test('an untagged test has no $tags', ({ $tags }) => {
  expect($tags).toEqual([]);
});
