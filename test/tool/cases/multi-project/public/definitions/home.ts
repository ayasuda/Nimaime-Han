import { createNimaime } from 'nimaime-han';

const { defineScreen, defineElement } = createNimaime();

defineScreen('Home', {
  open: ({ page }) => page.setContent('<h1>Welcome!</h1><nav><a href="#u">Users</a></nav>'),
});

defineElement('Main Menu', {
  Settings: ({ page }) => page.getByRole('link', { name: 'Settings' }),
});

defineElement('Welcome Banner', {
  Greeting: ({ page }) => page.getByRole('heading', { name: 'Welcome!' }),
});
