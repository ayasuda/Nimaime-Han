import { createNimaime } from 'nimaime-han';

const { defineScreen, defineElement } = createNimaime();

defineScreen('Dashboard', {
  open: ({ page }) =>
    page.setContent('<nav><a href="#u">Users</a> <a href="#s">Settings</a></nav>'),
});

defineElement('Admin Menu', {
  Users: ({ page }) => page.getByRole('link', { name: 'Users' }),
  Settings: ({ page }) => page.getByRole('link', { name: 'Settings' }),
});
