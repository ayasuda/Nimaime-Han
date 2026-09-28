import { createNimaime } from '../../../../../../src/index';

const { defineScreen, defineElement, defineCondition } = createNimaime();

// Not referenced by any spec (reported as unused).
defineScreen('Settings', {
  open: async ({ page }) => {
    await page.goto('/settings');
  },
});

defineElement('Footer', { Copyright: ({ page }) => page.getByText('©') });

defineCondition('Logged out', async ({ context }) => {
  await context.clearCookies();
});

// Shadowed inside "Login" by the screen-scoped definition in login.ts, and "Input is valid" is not
// used in any other screen, so this global definition is unused.
defineCondition('Input is valid', async ({ page }) => {
  await page.getByLabel('Name').fill('Alice');
});
