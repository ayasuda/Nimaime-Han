import { createNimaime } from 'nimaime-han';
import { test } from '../fixtures';

const { defineScreen, defineElement, defineCondition } = createNimaime(test);

// The signed-in user is "alice"; ?user=<username> selects whose profile is shown.
defineScreen('User Details', {
  open: ({ page, appUrl }) => page.goto(appUrl('user-details.html')),
});

defineElement('User Information', {
  Username: ({ page }) => page.getByTestId('username'),
  'Full name': ({ page }) => page.getByTestId('real-name'),
  'Email address': ({ page }) => page.getByTestId('email'),
});

defineElement('Edit Action', {
  'Edit button': ({ page }) => page.getByTestId('edit-button'),
});

defineCondition('Viewing your own profile', async ({ page, appUrl }) => {
  await page.goto(appUrl('user-details.html', { user: 'alice' }));
});

defineCondition("Viewing another user's profile", async ({ page, appUrl }) => {
  await page.goto(appUrl('user-details.html', { user: 'bob' }));
});

defineCondition('The user can edit the profile', async ({ page, appUrl }) => {
  await page.goto(appUrl('user-details.html', { user: 'alice' }));
});
