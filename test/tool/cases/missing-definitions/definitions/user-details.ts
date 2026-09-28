import { createNimaime } from 'nimaime-han';

const { defineScreen, defineElement, defineCondition } = createNimaime();

const PROFILE_PAGE = /* html */ `
  <h1 data-testid="username">alice</h1>
  <p data-testid="real-name">Alice Liddell</p>
  <p data-testid="email">alice@example.com</p>
  <button id="edit">Edit</button>
`;

defineScreen('User Details', {
  open: ({ page }) => page.setContent(PROFILE_PAGE),
});

defineElement('User Information', {
  Username: ({ page }) => page.getByTestId('username'),
  'Email address': ({ page }) => page.getByTestId('email'),
});

defineCondition("Viewing another user's profile", async ({ page }) => {
  // Only your own profile shows the full name and the email address.
  await page.addStyleTag({
    content: '[data-testid="real-name"], [data-testid="email"] { display: none }',
  });
});
