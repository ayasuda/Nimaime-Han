import { createNimaime } from 'nimaime-han';
import { test } from '../fixtures';

const { defineScreen, defineElement, defineCondition } = createNimaime(test);

const PREFERENCES_PAGE = /* html */ `
  <h1>Preferences</h1>
  <p data-testid="summary">3 topics</p>
  <ul><li>News</li><li>Sports</li><li>Weather</li></ul>
  <label><input type="checkbox" checked /> Remember me</label>
  <label><input type="checkbox" /> Promotions</label>
  <label><input type="checkbox" id="newsletter" /> Newsletter</label>
  <label>Account ID <input value="A-42" readonly /></label>
  <label>Email <input type="email" /></label>
  <div data-testid="notes"></div>
  <script>
    document.getElementById('newsletter').addEventListener('change', (event) => {
      document.querySelector('[data-testid="summary"]').textContent = event.target.checked
        ? '3 topics, newsletter on'
        : '3 topics';
    });
  </script>
`;

defineScreen('Preferences', { open: ({ page }) => page.setContent(PREFERENCES_PAGE) });

defineElement('Preferences Form', {
  Title: ({ page }) => page.getByRole('heading'),
  Summary: ({ page }) => page.getByTestId('summary'),
  Topics: ({ page }) => page.getByRole('listitem'),
  'Remember me': ({ page }) => page.getByLabel('Remember me'),
  Promotions: ({ page }) => page.getByLabel('Promotions'),
  'Account ID': ({ page }) => page.getByLabel('Account ID'),
  Notes: ({ page }) => page.getByTestId('notes'),
});

defineElement('Newsletter Checkbox', ({ page }) => page.getByLabel('Newsletter'));

defineElement('Email Field', ({ page }) => page.getByLabel('Email'));

defineCondition(
  'The newsletter is chosen',
  async ({ page }) => {
    await page.getByLabel('Newsletter').check();
  },
  { screen: 'Preferences' },
);

defineCondition(
  'The email field is clicked',
  async ({ page }) => {
    await page.getByLabel('Email').click();
  },
  { screen: 'Preferences' },
);
