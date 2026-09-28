import { createNimaime } from '../../../../../src/index';

const { defineElement, defineCondition } = createNimaime();

// Names are matched after trim(): surrounding whitespace is ignored.
defineElement(' Login Form ', {
  'Email address': ({ page }) => page.getByLabel('Email'),
  ' Password': ({ page }) => page.getByLabel('Password'),
  'Login button': ({ page }) => page.getByRole('button', { name: 'Log in' }),
});

defineElement('Login Button', ({ page }) => page.getByRole('button', { name: 'Log in' }));

defineCondition(
  'Input is valid',
  async ({ page }) => {
    await page.getByLabel('Email').fill('alice@example.com');
  },
  { screen: 'Login' },
);

defineCondition(
  'Input is invalid',
  async ({ page }) => {
    await page.getByLabel('Email').fill('not-an-email');
  },
  { screen: 'Login' },
);
