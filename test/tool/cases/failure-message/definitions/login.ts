import { createNimaime } from 'nimaime-han';

const { defineScreen, defineElement, defineCondition } = createNimaime();

const LOGIN_PAGE = /* html */ `
  <label>Email <input id="email" /></label>
  <button id="submit" type="button" disabled>Log in</button>
  <script>
    const email = document.getElementById('email');
    email.addEventListener('input', () => {
      document.getElementById('submit').disabled = !email.value.includes('@');
    });
  </script>
`;

defineScreen('Login', {
  open: ({ page }) => page.setContent(LOGIN_PAGE),
});

defineElement('Login Button', ({ page }) => page.getByRole('button', { name: 'Log in' }));

defineCondition('Input is valid', async ({ page }) => {
  await page.getByLabel('Email').fill('alice@example.com');
});

defineCondition('Input is empty', async ({ page }) => {
  await page.getByLabel('Email').fill('');
});
