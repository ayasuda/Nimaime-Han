import { createNimaime } from 'nimaime-han';

const { defineScreen, defineElement, defineCondition } = createNimaime();

const SETTINGS_PAGE = /* html */ `
  <h1>Settings</h1>
  <p id="greeting">Hello, Alice</p>
  <nav><a href="#a">Profile</a><a href="#b">Privacy</a><a href="#c">Billing</a></nav>
  <label><input type="checkbox" id="remember" checked /> Remember me</label>
  <label><input type="checkbox" /> Newsletter</label>
  <label>Account ID <input value="A-42" readonly /></label>
  <label>Nickname <input id="nickname" /></label>
  <div id="notes"></div>
  <button id="save" disabled>Save</button>
  <script>
    document.getElementById('nickname').addEventListener('focus', () => {
      document.getElementById('save').disabled = false;
    });
  </script>
`;

defineScreen('Settings', { open: ({ page }) => page.setContent(SETTINGS_PAGE) });

defineElement('Header', {
  Title: ({ page }) => page.getByRole('heading'),
  Greeting: ({ page }) => page.locator('#greeting'),
  Tabs: ({ page }) => page.getByRole('link'),
});

defineElement('Remember Me Checkbox', ({ page }) => page.getByLabel('Remember me'));

defineElement('Account Form', {
  Newsletter: ({ page }) => page.getByLabel('Newsletter'),
  'Account ID': ({ page }) => page.getByLabel('Account ID'),
  Nickname: ({ page }) => page.getByLabel('Nickname'),
  Notes: ({ page }) => page.locator('#notes'),
  'Save button': ({ page }) => page.getByRole('button', { name: 'Save' }),
});

defineElement('Nickname Field', ({ page }) => page.getByLabel('Nickname'));

defineElement('Welcome', {
  Greeting: ({ page }) => page.locator('#greeting'),
});

defineCondition('Nothing was touched', () => {
  // The base state.
});

defineCondition('The nickname is focused', async ({ page }) => {
  await page.getByLabel('Nickname').focus();
});
