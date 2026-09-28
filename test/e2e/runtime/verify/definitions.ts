import { createNimaime } from '../../../../src/index';
import { test } from '../fixtures';

const { defineScreen, defineElement, defineCondition } = createNimaime(test);

// $nimaime.verify() must call neither the screen's open nor the conditions: they only record that
// they were called.
defineScreen('Account Profile', {
  open: ({ calls }) => {
    calls.push('open');
  },
});

defineElement('Profile Card', {
  Username: ({ page }) => page.getByTestId('username'),
  'Full name': ({ page }) => page.getByTestId('full-name'),
  'Email address': ({ page }) => page.getByTestId('email'),
});

defineElement('Profile Actions', {
  'Edit button': ({ page }) => page.getByTestId('edit'),
});

defineCondition('Own profile', ({ calls }) => {
  calls.push('condition');
});
