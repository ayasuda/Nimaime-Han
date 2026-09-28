/**
 * Type-level tests for `createNimaime(test)`: `npm run typecheck` verifies the `expectTypeOf`
 * assertions and `@ts-expect-error` lines; vitest additionally runs the callbacks with fake fixtures.
 */
import {
  test as base,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import {
  createNimaime,
  type ConditionFn,
  type DefaultFixtures,
  type DefaultWorkerFixtures,
  type ElementHookInfo,
  type FixturesOf,
  type LocatorFn,
  type NimaimeDefinitions,
  type OpenScreenFn,
  type ScreenHookInfo,
  type WorkerFixturesOf,
} from '../../src/index';
import { findCondition, findElement, findScreen, resetRegistry } from '../../src/runtime/index';

interface Account {
  name: string;
}

const test = base.extend<{ login: (user: string) => Promise<Account> }, { tenant: string }>({
  tenant: ['acme', { scope: 'worker', option: true }],
  login: async ({ page }, use) => {
    await use((user) => Promise.resolve({ name: `${user}@${page.url()}` }));
  },
});

beforeEach(() => {
  resetRegistry();
});

describe('createNimaime(test) typing', () => {
  it('uses the built-in Playwright fixtures by default', () => {
    const nimaime = createNimaime();
    expectTypeOf(nimaime).toEqualTypeOf<NimaimeDefinitions>();
    expectTypeOf<FixturesOf<typeof base>>().toEqualTypeOf<DefaultFixtures>();

    nimaime.defineScreen('Home', {
      open: async ({ page, baseURL }) => {
        expectTypeOf(page).toEqualTypeOf<Page>();
        expectTypeOf(baseURL).toEqualTypeOf<string | undefined>();
        await page.goto('/');
      },
    });
    nimaime.defineElement('Header', ({ page, context }) => {
      expectTypeOf(context).toEqualTypeOf<BrowserContext>();
      return page.getByRole('banner');
    });
    nimaime.defineCondition('Anything', ({ request }) => {
      expectTypeOf(request).toEqualTypeOf<APIRequestContext>();
    });

    // @ts-expect-error -- `login` is not a fixture of the default test
    nimaime.defineCondition('Logged in', ({ login }) => {
      // eslint-disable-next-line @typescript-eslint/no-meaningless-void-operator -- only the typing matters
      void login;
    });
  });

  it('flows custom fixtures of test.extend() into every callback', async () => {
    const { defineScreen, defineElement, defineCondition } = createNimaime(test);
    expectTypeOf<FixturesOf<typeof test>>().toHaveProperty('login');
    expectTypeOf<FixturesOf<typeof test>>().toHaveProperty('tenant');

    defineScreen('User Details', {
      open: async ({ page, tenant }) => {
        expectTypeOf(tenant).toEqualTypeOf<string>();
        await page.goto(`/${tenant}/users/me`);
      },
    });
    defineElement('User Information', {
      Username: ({ page }) => {
        expectTypeOf(page).toEqualTypeOf<Page>();
        return page.getByTestId('username');
      },
    });
    defineElement('Edit Action', ({ page }) => page.getByRole('button'), {
      'Edit button': ({ page }) => page.getByTestId('edit'),
    });
    defineCondition('Viewing your own profile', async ({ login, page }) => {
      expectTypeOf(login).toEqualTypeOf<(user: string) => Promise<Account>>();
      expectTypeOf(page).toEqualTypeOf<Page>();
      const account = await login('alice');
      expectTypeOf(account).toEqualTypeOf<Account>();
    });

    // The stored callbacks receive whatever fixtures the runtime passes.
    const calls: string[] = [];
    const login = (user: string) => {
      calls.push(user);
      return Promise.resolve({ name: user });
    };
    await findCondition('Viewing your own profile')?.fn({ login, page: {} });
    expect(calls).toEqual(['alice']);
    expect(findScreen('User Details')?.customTest).toBe(true);
    expect(findElement('Edit Action')?.targets.has('Edit button')).toBe(true);
  });

  it('rejects callbacks of the wrong shape', () => {
    const { defineElement, defineCondition } = createNimaime(test);
    // @ts-expect-error -- a target locator must return a Locator
    defineElement('Wrong', { Username: () => 'username' });
    // @ts-expect-error -- `logout` is not a fixture of this test
    defineCondition('Wrong 2', ({ logout }) => {
      // eslint-disable-next-line @typescript-eslint/no-meaningless-void-operator -- only the typing matters
      void logout;
    });
    // @ts-expect-error -- condition options only accept `screen`
    defineCondition('Wrong 3', () => undefined, { scope: 'Login' });
    resetRegistry();
  });

  it('exports the callback types', () => {
    expectTypeOf<LocatorFn>().toEqualTypeOf<(fixtures: DefaultFixtures) => Locator>();
    expectTypeOf<ConditionFn<{ a: 1 }>>().toEqualTypeOf<(fixtures: { a: 1 }) => unknown>();
    expectTypeOf<OpenScreenFn<{ a: 1 }>>().toEqualTypeOf<(fixtures: { a: 1 }) => unknown>();
  });

  it('accepts open / condition callbacks that return any promise (e.g. page.goto)', () => {
    const { defineScreen, defineCondition } = createNimaime();
    // page.goto() resolves to `Response | null`, page.click() to `void`: both are accepted.
    defineScreen('User Details', { open: ({ page }) => page.goto('/users/me') });
    defineCondition('Anywhere', ({ page }) => page.goto('/x'));
    defineCondition('Clicked', ({ page }) => page.click('#go'));
    const custom = createNimaime(test);
    custom.defineScreen('Home', { open: ({ page, tenant }) => page.goto(`/${tenant}`) });
    custom.defineCondition('Logged in', ({ login }) => login('alice'));
    expect(findScreen('User Details')?.open).toBeTypeOf('function');
    expect(findCondition('Anywhere')?.fn).toBeTypeOf('function');
  });

  it('gives screen hooks worker-scoped fixtures only and element hooks every fixture', () => {
    expectTypeOf<WorkerFixturesOf<typeof base>>().toEqualTypeOf<DefaultWorkerFixtures>();
    expectTypeOf<WorkerFixturesOf<typeof test>>().toHaveProperty('tenant');
    const { beforeScreen, afterScreen, beforeElement, afterElement } = createNimaime(test);
    beforeScreen(async ({ browser, tenant }, info) => {
      expectTypeOf(browser).toEqualTypeOf<Browser>();
      expectTypeOf(tenant).toEqualTypeOf<string>();
      expectTypeOf(info).toEqualTypeOf<ScreenHookInfo>();
      await Promise.resolve();
    });
    // @ts-expect-error -- `page` is test-scoped: not available in screen hooks (test.beforeAll)
    afterScreen(({ page }) => page, { screen: 'Login' });
    // @ts-expect-error -- `login` is test-scoped: not available in screen hooks
    beforeScreen(({ login }) => login);
    beforeElement(
      async ({ page, login, tenant }, info) => {
        expectTypeOf(info).toEqualTypeOf<ElementHookInfo>();
        expectTypeOf(info.condition).toEqualTypeOf<string | undefined>();
        await login(tenant);
        await page.goto('/');
      },
      { screen: 'Login', element: 'Login Form' },
    );
    afterElement(({ page }) => page.close(), { element: 'Login Form', tags: '@smoke' });
    expect(() => {
      // @ts-expect-error -- screen hooks take no `element` option
      beforeScreen(() => undefined, { element: 'Login Form' });
    }).toThrow(/no `element`/);
    resetRegistry();
  });
});
