// Sanmaime names → locators. $nimaime.verify() only needs element definitions: it does not open
// screens nor establish conditions (the Given / When steps do that), so there is no defineScreen /
// defineCondition here.
import { createNimaime } from 'nimaime-han';
import { test } from '../fixtures';

const { defineElement } = createNimaime(test);

defineElement('User Information', {
  Username: ({ page }) => page.getByTestId('username'),
  'Full name': ({ page }) => page.getByTestId('full-name'),
  'Email address': ({ page }) => page.getByTestId('email'),
});

defineElement('Edit Action', {
  'Edit button': ({ page }) => page.getByRole('button', { name: 'Edit profile' }),
});
