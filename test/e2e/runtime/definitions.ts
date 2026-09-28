import { createNimaime } from '../../../src/index';
import { test } from './fixtures';

const { defineScreen, defineElement, defineCondition } = createNimaime(test);

defineScreen('Login', {
  open: async ({ page, appHtml, calls }) => {
    calls.push('open');
    await page.setContent(appHtml);
  },
});

defineElement('Login Button', ({ page }) => page.getByTestId('login-button'), {
  'Error message': ({ page }) => page.getByTestId('error'),
});

defineElement('Login Form', {
  'Email address': ({ page }) => page.getByTestId('email'),
  Password: ({ page }) => page.getByTestId('password'),
  'Login button': ({ page }) => page.getByTestId('login-button'),
});

defineElement('User Information', {
  Username: ({ page }) => page.getByTestId('username'),
  'Full name': ({ page }) => page.getByTestId('real-name'),
  Greeting: ({ page }) => page.getByTestId('greeting'),
});

defineCondition('Input is valid', async ({ page, calls }) => {
  calls.push('condition');
  await page.getByTestId('email').fill('alice@example.com');
});

defineCondition(
  'Input is invalid',
  async ({ page, calls }) => {
    calls.push('condition');
    await page.getByTestId('email').fill('not-an-email');
  },
  { screen: 'Login' },
);

defineCondition('Viewing your own profile', async ({ page, fullName, calls }) => {
  calls.push('condition');
  await page.evaluate((name) => {
    (globalThis as unknown as { showOwnProfile: (n: string) => void }).showOwnProfile(name);
  }, fullName);
});
