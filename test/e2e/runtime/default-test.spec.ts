// The `test` exported by nimaime-han/runtime (no custom fixtures).
import { createNimaime } from '../../../src/index';
import { test } from '../../../src/runtime/index';

const { defineElement } = createNimaime();

defineElement('Plain Button', ({ page }) => page.getByRole('button', { name: 'Go' }));

test('the default test provides $nimaime', async ({ $nimaime, page }) => {
  await page.setContent('<button>Go</button>');
  await $nimaime.run(
    { page },
    { screen: 'Scratch', element: 'Plain Button', expectations: [{ kind: 'enable' }] },
  );
});
