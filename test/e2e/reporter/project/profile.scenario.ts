// Generated-shaped tests for ./profile.sanmaime that fail and skip on purpose, so the reporter's
// ✗ and ○ output can be checked (see ../reporter.spec.ts). Uses the runtime e2e definitions.
import { createNimaime } from '../../../../src/index';
import { createNimaimeTest } from '../../../../src/runtime/index';
import { test as customTest } from '../../runtime/fixtures';
import '../../runtime/definitions';

const { defineScreen } = createNimaime(customTest);
defineScreen('Profile', {
  open: async ({ page, appHtml }) => {
    await page.setContent(appHtml);
  },
});

const test = createNimaimeTest(customTest);
const file = 'profile.sanmaime';
const at = (line: number, column = 5) => ({ line, column });

test.describe('Screen: Profile', () => {
  test.describe('Element: User Information', () => {
    test('Always', async ({ $nimaime, page, appHtml }) => {
      await $nimaime.run(
        { page, appHtml },
        {
          screen: 'Profile',
          element: 'User Information',
          expectations: [
            { kind: 'show', target: 'Username', location: at(4) },
            { kind: 'show', target: 'Full name', location: at(5) },
            { kind: 'show', target: 'Greeting', location: at(6) },
          ],
          file,
          locations: { screen: at(1, 1), element: at(3, 3) },
        },
      );
    });
  });

  test.describe('Element: Login Button', () => {
    test('When: Input is valid', async ({ $nimaime, page, appHtml, calls }) => {
      await $nimaime.run(
        { page, appHtml, calls },
        {
          screen: 'Profile',
          element: 'Login Button',
          condition: 'Input is valid',
          expectations: [{ kind: 'disable', location: at(10) }],
          file,
          locations: { screen: at(1, 1), element: at(8, 3), condition: at(9) },
        },
      );
    });

    test.skip('When: Viewing your own profile', async ({
      $nimaime,
      page,
      appHtml,
      calls,
      fullName,
    }) => {
      await $nimaime.run(
        { page, appHtml, calls, fullName },
        {
          screen: 'Profile',
          element: 'Login Button',
          condition: 'Viewing your own profile',
          expectations: [{ kind: 'show', target: 'Greeting', location: at(13) }],
          file,
        },
      );
    });
  });
});
