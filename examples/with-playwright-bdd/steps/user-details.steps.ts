import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Given, Then, When } from '../fixtures';

const APP_URL = pathToFileURL(join(import.meta.dirname, '..', 'app', 'index.html')).href;

// Given / When: drive the app to a state (the journey).

Given('the user is logged in', async ({ page }) => {
  await page.goto(APP_URL);
  await page.getByLabel('Username').fill('alice');
  await page.getByRole('button', { name: 'Log in' }).click();
});

When('the user opens their profile', async ({ page }) => {
  await page.getByRole('link', { name: 'My profile' }).click();
});

When('the user opens the profile of {string}', async ({ page }, username: string) => {
  await page.goto(`${APP_URL}#/users/${username}`);
});

// Then: verify the screen against its Sanmaime specification (the stop along the way). The page
// is already in the named state; verify() neither navigates nor runs condition definitions.

Then('the user details screen is displayed', async ({ $nimaime, page }) => {
  await $nimaime.verify({ page }, 'User Details', { when: 'Viewing your own profile' });
});

Then('the user details screen of another user is displayed', async ({ $nimaime, page }) => {
  await $nimaime.verify({ page }, 'User Details', { when: "Viewing another user's profile" });
});
