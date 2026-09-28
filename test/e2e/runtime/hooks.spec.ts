// Hooks against a real browser: hand-written specs shaped like the code nimaime-gen emits for
// hooks (test.beforeAll / afterAll -> runHooks('beforeScreen' | 'afterScreen'), test.beforeEach /
// afterEach -> runHooks('beforeElement' | 'afterElement')). The Screen names are unique to this
// file, so the hooks do not apply to other specs.
import { test as base } from '@playwright/test';
import { createNimaime } from '../../../src/index';
import { createNimaimeTest, expect, NimaimeHookError, runHooks } from '../../../src/runtime/index';
import { LOGIN_PAGE } from './app';

const custom = base.extend<{ log: string[] }, { workerLog: string[] }>({
  // eslint-disable-next-line no-empty-pattern
  log: async ({}, use) => {
    await use([]);
  },
  workerLog: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await use([]);
    },
    { scope: 'worker' },
  ],
});
const test = createNimaimeTest(custom);

const { defineElement, beforeScreen, afterScreen, beforeElement, afterElement } =
  createNimaime(custom);

const SCREEN = 'Hooks Login';

defineElement('Hooks Login Button', ({ page }) => page.getByTestId('login-button'));

// Screen hooks: worker-scoped fixtures only.
beforeScreen(
  ({ workerLog }, info) => {
    workerLog.push(`beforeScreen ${info.screen}`);
  },
  { screen: SCREEN },
);
afterScreen(
  ({ workerLog }, info) => {
    workerLog.push(`afterScreen ${info.screen}`);
  },
  { screen: SCREEN },
);

// Element hooks, from the least to the most specific scope (registered in reverse on purpose).
beforeElement(
  async ({ page, log }, info) => {
    log.push(`element ${info.element} ${info.condition ?? '(always)'}`);
    // The hook establishes the state the expectations check.
    await page.getByLabel('Email').fill('alice@example.com');
  },
  { element: 'Hooks Login Button' },
);
beforeElement(
  async ({ page, log }) => {
    log.push('screen');
    await page.setContent(LOGIN_PAGE);
  },
  { screen: SCREEN },
);
beforeElement(({ log }) => {
  log.push('global');
});
afterElement(
  ({ log, workerLog }) => {
    workerLog.push(`afterElement after ${log.join(', ')}`);
  },
  { screen: SCREEN },
);
beforeElement(
  () => {
    throw new Error('the backend is down');
  },
  { screen: 'Hooks Failing' },
);

test.describe(`Screen: ${SCREEN}`, () => {
  // Keep the tests of this describe in one worker, in order, so that workerLog sees all of them.
  test.describe.configure({ mode: 'default' });

  test.beforeAll(async ({ workerLog }) => {
    await runHooks('beforeScreen', { workerLog }, { screen: SCREEN });
  });

  test.afterAll(async ({ workerLog }) => {
    await runHooks('afterScreen', { workerLog }, { screen: SCREEN });
  });

  test.afterAll(({ workerLog }) => {
    expect(workerLog).toEqual([
      `beforeScreen ${SCREEN}`,
      'afterElement after global, screen, element Hooks Login Button (always)',
      'afterElement after global, screen, element Hooks Login Button Filled in',
      `afterScreen ${SCREEN}`,
    ]);
  });

  test.describe('Element: Hooks Login Button', () => {
    test.beforeEach(async ({ log, page }) => {
      await runHooks(
        'beforeElement',
        { log, page },
        { screen: SCREEN, element: 'Hooks Login Button' },
      );
    });

    test.afterEach(async ({ log, workerLog }) => {
      await runHooks(
        'afterElement',
        { log, workerLog },
        { screen: SCREEN, element: 'Hooks Login Button' },
      );
    });

    test('Always', async ({ $nimaime, page, log, workerLog }) => {
      expect(workerLog).toEqual([`beforeScreen ${SCREEN}`]);
      expect(log).toEqual(['global', 'screen', 'element Hooks Login Button (always)']);
      await $nimaime.run(
        { page },
        {
          screen: SCREEN,
          element: 'Hooks Login Button',
          expectations: [{ kind: 'enable' }],
        },
      );
    });

    test('When: Filled in', ({ log }) => {
      // Element hooks take the condition from the `When: …` test title.
      expect(log.at(-1)).toBe('element Hooks Login Button Filled in');
    });
  });
});

test('a failing hook fails with the hook and its scope in the message', async () => {
  // The global beforeElement hook above runs first and needs `log`.
  const log: string[] = [];
  const error = await runHooks(
    'beforeElement',
    { log },
    { screen: 'Hooks Failing', element: 'Form' },
  ).then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(NimaimeHookError);
  expect((error as Error).message).toBe(
    'BeforeElement hook for Element "Form" failed: the backend is down',
  );
  expect((error as Error).stack).toContain('hooks.spec.ts');
  expect(log).toEqual(['global']);
});
