// Hand-written specs shaped like the code nimaime-gen emits for ./login.sanmaime: the custom `test`
// (importTestFrom) is extended with $nimaime, definitions are imported for their side effects, and
// each test destructures the fixtures its definitions use and passes them to $nimaime.run().
import {
  collectFixtureNames,
  createNimaimeTest,
  expect,
  NimaimeExpectationError,
  NimaimeRuntimeError,
  type NimaimePlan,
} from '../../../src/runtime/index';
import { test as customTest } from './fixtures';
import './definitions';

const test = createNimaimeTest(customTest);

const file = 'login.sanmaime';
const at = (line: number, column = 5) => ({ line, column });

test.describe('Screen: Login', () => {
  test.describe('Element: Login Form', () => {
    test('base state', async ({ $nimaime, page, appHtml, calls }) => {
      await $nimaime.run(
        { page, appHtml, calls },
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
    test('base state', async ({ $nimaime, page, appHtml, calls }) => {
      await $nimaime.run(
        { page, appHtml, calls },
        {
          screen: 'Login',
          element: 'Login Button',
          expectations: [
            { kind: 'disable', location: at(9) },
            { kind: 'hide', target: 'Error message', location: at(10) },
          ],
          file,
          locations: { screen: at(1, 1), element: at(8, 3) },
        },
      );
    });

    test('When: Input is valid', async ({ $nimaime, page, appHtml, calls }) => {
      await $nimaime.run(
        { page, appHtml, calls },
        {
          screen: 'Login',
          element: 'Login Button',
          condition: 'Input is valid',
          expectations: [{ kind: 'enable', location: at(13) }],
          file,
          locations: { screen: at(1, 1), element: at(8, 3), condition: at(12) },
        },
      );
      expect(calls).toEqual(['open', 'condition']);
    });

    test('When: Input is invalid (screen-scoped condition)', async ({
      $nimaime,
      page,
      appHtml,
      calls,
    }) => {
      await $nimaime.run(
        { page, appHtml, calls },
        {
          screen: 'Login',
          element: 'Login Button',
          condition: 'Input is invalid',
          expectations: [
            { kind: 'disable', location: at(16) },
            { kind: 'show', target: 'Error message', location: at(17) },
          ],
          file,
          locations: { screen: at(1, 1), element: at(8, 3), condition: at(15) },
        },
      );
    });
  });

  test.describe('Element: User Information', () => {
    test('base state', async ({ $nimaime, page, appHtml, calls }) => {
      await $nimaime.run(
        { page, appHtml, calls },
        {
          screen: 'Login',
          element: 'User Information',
          expectations: [
            { kind: 'show', target: 'Username', location: at(20) },
            { kind: 'hide', target: 'Full name', location: at(21) },
            { kind: 'hide', target: 'Greeting', location: at(22) },
          ],
          file,
        },
      );
    });

    test('When: Viewing your own profile (custom fixture in the condition)', async ({
      $nimaime,
      page,
      appHtml,
      calls,
      fullName,
    }) => {
      await $nimaime.run(
        { page, appHtml, calls, fullName },
        {
          screen: 'Login',
          element: 'User Information',
          condition: 'Viewing your own profile',
          expectations: [
            { kind: 'show', target: 'Username', location: at(25) },
            { kind: 'show', target: 'Full name', location: at(26) },
            { kind: 'show', target: 'Greeting', location: at(27) },
          ],
          file,
        },
      );
      // The condition ran after the screen was opened, and before the expectations.
      expect(calls).toEqual(['open', 'condition']);
      await expect(page.getByTestId('greeting')).toHaveText('Welcome back, Alice Liddell');
    });
  });
});

test.describe('runtime behaviour', () => {
  test('opens a screen once per test', async ({ $nimaime, page, appHtml, calls }) => {
    const fixtures = { page, appHtml, calls };
    await $nimaime.run(fixtures, {
      screen: 'Login',
      element: 'Login Form',
      expectations: [{ kind: 'show', target: 'Password' }],
    });
    await $nimaime.run(fixtures, {
      screen: 'Login',
      element: 'Login Button',
      expectations: [{ kind: 'disable' }],
    });
    expect(calls).toEqual(['open']);
  });

  test('low-level methods', async ({ $nimaime, page, appHtml, calls }) => {
    const fixtures = { page, appHtml, calls };
    const ctx = { screen: 'Login', file };
    await $nimaime.screen(fixtures, 'Login', ctx);
    await $nimaime.expectDisable(fixtures, 'Login Button', ctx);
    await $nimaime.condition(fixtures, 'Input is invalid', ctx);
    await $nimaime.expectShow(fixtures, 'Login Button', 'Error message', ctx);
    await $nimaime.condition(fixtures, 'Input is valid', ctx);
    await $nimaime.expectEnable(fixtures, 'Login Button', ctx);
    await $nimaime.expectHide(fixtures, 'Login Button', 'Error message', ctx);
    expect(calls).toEqual(['open', 'condition', 'condition']);
  });

  test('a screen without a definition is not opened', async ({ $nimaime, page, calls }) => {
    await page.setContent('<button data-testid="login-button" disabled>Log in</button>');
    await $nimaime.run(
      { page, calls },
      {
        screen: 'Somewhere Else',
        element: 'Login Button',
        expectations: [{ kind: 'disable' }, { kind: 'hide', target: 'Error message' }],
      },
    );
    expect(calls).toEqual([]);
  });

  test('collectFixtureNames lists the fixtures a plan needs', () => {
    const plan: NimaimePlan = {
      screen: 'Login',
      element: 'User Information',
      condition: 'Viewing your own profile',
      expectations: [{ kind: 'show', target: 'Username' }],
    };
    expect(collectFixtureNames(plan)).toEqual({
      names: ['appHtml', 'calls', 'fullName', 'page'],
      unknown: [],
    });
  });
});

test.describe('failures', () => {
  test('a failing Show: carries the Sanmaime header', async ({
    $nimaime,
    page,
    appHtml,
    calls,
  }) => {
    const error = await $nimaime
      .run(
        { page, appHtml, calls },
        {
          screen: 'Login',
          element: 'User Information',
          expectations: [
            { kind: 'show', target: 'Username', location: at(20) },
            { kind: 'show', target: 'Full name', location: at(21) },
          ],
          file,
        },
      )
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(NimaimeExpectationError);
    const { message, sanmaime } = error as NimaimeExpectationError;
    // Playwright colors its own message when the terminal supports it.
    // eslint-disable-next-line no-control-regex
    expect(message.replace(/\u001b\[[0-9;]*m/g, '')).toMatch(
      new RegExp(
        '^Screen: Login\\nElement: User Information\\nExpected: Full name is shown\\n' +
          'Actual: hidden \\(after 1000ms\\)\\nLocation: \\S*login\\.sanmaime:21\\n\\n' +
          'Details:\\n  expect\\(locator\\)\\.toBeVisible\\(\\) failed\\n',
      ),
    );
    expect(sanmaime).toMatchObject({
      kind: 'show',
      target: 'Full name',
      actual: 'hidden',
      timeout: 1000,
      locator: "getByTestId('real-name')",
    });
    expect((error as NimaimeExpectationError).toJSON()).toMatchObject({
      expectation: { kind: 'show', target: 'Full name' },
      line: 21,
      column: 5,
    });
  });

  test('a failing Enable in a condition names the condition', async ({
    $nimaime,
    page,
    appHtml,
    calls,
  }) => {
    const error = await $nimaime
      .run(
        { page, appHtml, calls },
        {
          screen: 'Login',
          element: 'Login Button',
          condition: 'Input is invalid',
          expectations: [{ kind: 'enable', location: at(16) }],
          file,
        },
      )
      .catch((e: unknown) => e);
    expect((error as Error).message).toMatch(
      /^Screen: Login\nElement: Login Button\nWhen: Input is invalid\nExpected: enabled\nActual: disabled \(after 1000ms\)\n/,
    );
  });

  test('a missing element definition throws NimaimeRuntimeError before opening the screen', async ({
    $nimaime,
    page,
    appHtml,
    calls,
  }) => {
    const run = $nimaime.run(
      { page, appHtml, calls },
      {
        screen: 'Login',
        element: 'Nowhere',
        expectations: [{ kind: 'show', target: 'X' }],
        file,
        locations: { element: at(3, 3) },
      },
    );
    await expect(run).rejects.toThrow(NimaimeRuntimeError);
    await expect(run).rejects.toThrow(
      /"Element: Nowhere" \(Screen: Login\)[\s\S]*login\.sanmaime:3/,
    );
    expect(calls).toEqual([]);
  });

  test('missing targets, self locators and conditions throw NimaimeRuntimeError', async ({
    $nimaime,
    page,
  }) => {
    const plan = (overrides: Partial<NimaimePlan>): NimaimePlan => ({
      screen: 'Somewhere Else',
      element: 'User Information',
      expectations: [],
      ...overrides,
    });
    await expect(
      $nimaime.run({ page }, plan({ expectations: [{ kind: 'show', target: 'Avatar' }] })),
    ).rejects.toThrow(/Element "User Information" has no target "Avatar"/);
    await expect(
      $nimaime.run({ page }, plan({ expectations: [{ kind: 'enable' }] })),
    ).rejects.toThrow(/Element "User Information" has no locator for the element itself/);
    await expect($nimaime.run({ page }, plan({ condition: 'Input is invalid' }))).rejects.toThrow(
      /No condition definition for "When: Input is invalid" in Screen "Somewhere Else"/,
    );
  });

  test('a fixture the test did not pass is reported', async ({ $nimaime, page, calls }) => {
    await expect(
      $nimaime.run(
        { page, calls },
        {
          screen: 'Login',
          element: 'Login Form',
          expectations: [{ kind: 'show', target: 'Password' }],
        },
      ),
    ).rejects.toThrow(/Screen "Login" open uses the fixture "appHtml"/);
  });
});
