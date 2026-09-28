import { createNimaime } from 'nimaime-han';
import { test } from '../fixtures';

const { defineScreen, defineElement, defineCondition } = createNimaime(test);

defineScreen('Login', {
  open: async ({ page, loginHtml }) => {
    await page.setContent(loginHtml);
  },
});

defineElement('Login Form', {
  'Email address': ({ page }) => page.getByLabel('Email'),
  Password: ({ page }) => page.getByLabel('Password'),
  'Login button': ({ page }) => page.getByRole('button', { name: 'Log in' }),
});

defineElement('Login Button', ({ page }) => page.getByRole('button', { name: 'Log in' }));

defineCondition('Input is valid', async ({ page }) => {
  await page.getByLabel('Email').fill('alice@example.com');
});

defineCondition(
  'Input is invalid',
  async ({ page }) => {
    await page.getByLabel('Email').fill('not-an-email');
  },
  { screen: 'Login' },
);
