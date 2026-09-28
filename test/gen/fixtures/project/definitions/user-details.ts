import { createNimaime } from '../../../../../src/index';

const { defineScreen, defineElement, defineCondition } = createNimaime();

defineScreen('User Details', {
  open: async ({ page }) => {
    await page.goto('/users/me');
  },
});

defineElement('User Information', {
  Username: ({ page }) => page.getByTestId('username'),
  'Full name': ({ page }) => page.getByTestId('real-name'),
  'Email address': ({ page }) => page.getByTestId('email'),
});

defineCondition('Viewing your own profile', async ({ page }) => {
  await page.goto('/users/me');
});

defineCondition("Viewing another user's profile", async ({ page }) => {
  await page.goto('/users/42');
});
