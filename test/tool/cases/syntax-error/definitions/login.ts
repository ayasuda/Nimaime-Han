import { createNimaime } from 'nimaime-han';

const { defineElement, defineCondition } = createNimaime();

defineElement('Login Button', ({ page }) => page.getByRole('button', { name: 'Log in' }));
defineElement('Name', { Name: ({ page }) => page.getByTestId('name') });
defineCondition('Input is valid', async ({ page }) => {
  await page.getByLabel('Email').fill('alice@example.com');
});
