import { createNimaime } from 'nimaime-han';

const { defineElement, defineCondition } = createNimaime();

defineElement('Login Form', {
  'Email address': ({ page }) => page.getByLabel('Email'),
  Password: ({ page }) => page.getByLabel('Password'),
  'Login button': ({ page }) => page.getByRole('button', { name: 'Log in' }),
});
defineElement('Login Button', ({ page }) => page.getByRole('button', { name: 'Log in' }));
defineElement('Header', { Logo: ({ page }) => page.getByRole('img', { name: 'Logo' }) });

defineCondition('Input is valid', async ({ page }) => {
  await page.getByLabel('Email').fill('alice@example.com');
});
defineCondition('Input is invalid', async ({ page }) => {
  await page.getByLabel('Email').fill('nope');
});
