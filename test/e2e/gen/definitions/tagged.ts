import { createNimaime } from 'nimaime-han';
import { test } from '../fixtures';

// Elements are global: specs/tagged.sanmaime reuses those of definitions/login.ts.
const { defineScreen, defineCondition } = createNimaime(test);

defineScreen('Tagged Login', {
  open: async ({ page, loginHtml }) => {
    await page.setContent(loginHtml);
  },
});

defineCondition(
  'The tags are known',
  ({ $tags }) => {
    // The tags of the running test: its screen's, element's and When: block's.
    const tags = $tags.join(' ');
    if (tags !== '@smoke @tagged @uses-tags') throw new Error(`Unexpected $tags: ${tags}`);
  },
  { screen: 'Tagged Login' },
);
