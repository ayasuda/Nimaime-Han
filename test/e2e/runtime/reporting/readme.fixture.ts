// Deliberately failing tests shaped like the nimaime-gen output for ./login.sanmaime (the README
// example) against a buggy login page: the password field is missing and the button is always
// enabled. Run in a nested Playwright process by ../reporting.spec.ts; the main e2e config only
// matches *.spec.ts, so it never runs these directly.
import { createNimaime } from '../../../../src/index';
import { test } from '../../../../src/runtime/index';

const BUGGY_LOGIN = `
<label>Email <input data-testid="email" /></label>
<button data-testid="login-button">Log in</button>
`;

const { defineScreen, defineElement, defineCondition } = createNimaime();

defineScreen('Login', {
  open: async ({ page }) => {
    await page.setContent(BUGGY_LOGIN);
  },
});
defineElement('Login Form', {
  'Email address': ({ page }) => page.getByTestId('email'),
  Password: ({ page }) => page.getByTestId('password'),
  'Login button': ({ page }) => page.getByTestId('login-button'),
});
defineElement('Login Button', ({ page }) => page.getByTestId('login-button'));
defineCondition('Input is valid', async ({ page }) => {
  await page.getByTestId('email').fill('alice@example.com');
});
defineCondition('Input is invalid', async ({ page }) => {
  await page.getByTestId('email').fill('alice');
});

const file = 'login.sanmaime';
const at = (line: number, column = 5) => ({ line, column });

test.describe('Screen: Login', () => {
  test.describe('Element: Login Form', () => {
    test('Always', async ({ $nimaime, page }) => {
      await $nimaime.run(
        { page },
        {
          screen: 'Login',
          element: 'Login Form',
          expectations: [
            { kind: 'show', target: 'Email address', location: at(4) },
            { kind: 'show', target: 'Password', location: at(5) },
            { kind: 'show', target: 'Login button', location: at(6) },
          ],
          file,
          locations: { screen: at(1, 1), element: at(3, 3) },
        },
      );
    });
  });

  test.describe('Element: Login Button', () => {
    test('When: Input is valid', async ({ $nimaime, page }) => {
      await $nimaime.run(
        { page },
        {
          screen: 'Login',
          element: 'Login Button',
          condition: 'Input is valid',
          expectations: [{ kind: 'enable', location: at(10) }],
          file,
          locations: { screen: at(1, 1), element: at(8, 3), condition: at(9) },
        },
      );
    });

    test('When: Input is invalid', async ({ $nimaime, page }) => {
      await $nimaime.run(
        { page },
        {
          screen: 'Login',
          element: 'Login Button',
          condition: 'Input is invalid',
          expectations: [{ kind: 'disable', location: at(13) }],
          file,
          locations: { screen: at(1, 1), element: at(8, 3), condition: at(12) },
        },
      );
    });
  });
});
