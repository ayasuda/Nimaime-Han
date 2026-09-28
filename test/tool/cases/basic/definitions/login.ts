import { createNimaime } from 'nimaime-han';
import { test } from '../fixtures';

const { defineScreen, defineElement, defineCondition } = createNimaime(test);

// Screen: Login — how to open the screen (its base state).
defineScreen('Login', {
  open: ({ page, appUrl }) => page.goto(appUrl('login.html')),
});

// Element: Login Form — one locator per Show: / Hide: / And: target.
defineElement('Login Form', {
  'Email address': ({ page }) => page.getByLabel('Email address'),
  Password: ({ page }) => page.getByLabel('Password'),
  'Login button': ({ page }) => page.getByRole('button', { name: 'Log in' }),
});

// Element: Login Button — Enable / Disable apply to the element itself, so it has a `self` locator.
defineElement('Login Button', ({ page }) => page.getByRole('button', { name: 'Log in' }));

// When: ... — conditions put the opened screen into the named state.
defineCondition(
  'Input is valid',
  async ({ page }) => {
    await page.getByLabel('Email address').fill('alice@example.com');
    await page.getByLabel('Password').fill('correct horse battery staple');
  },
  { screen: 'Login' },
);

defineCondition(
  'Input is invalid',
  async ({ page }) => {
    await page.getByLabel('Email address').fill('not-an-email-address');
    await page.getByLabel('Password').fill('correct horse battery staple');
  },
  { screen: 'Login' },
);
