import type { Locator } from '@playwright/test';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNimaime, type NimaimeDefinitions } from '../../src/index';
import {
  collectFixtureNames,
  fixtureNamesOf,
  NimaimeRuntimeError,
  resetRegistry,
  validatePlan,
  type NimaimePlan,
} from '../../src/runtime/index';
import {
  formatSanmaimeLocation,
  guardFixtures,
  resolveCondition,
  resolveElement,
  resolveScreen,
  resolveSelf,
  resolveTarget,
} from '../../src/runtime/resolve';

const locator = {} as Locator;

beforeEach(() => {
  resetRegistry();
  const { defineScreen, defineElement, defineCondition } = createNimaime();
  defineScreen('Login', { open: ({ page }) => page.goto('/login') });
  defineElement('Login Form', { Email: ({ page }) => page.getByTestId('email') });
  defineElement('Login Button', ({ page }) => page.getByRole('button'), {
    Spinner: ({ page }) => page.getByTestId('spinner'),
  });
  defineCondition('Input is valid', async ({ page }) => {
    await page.getByTestId('email').fill('a@b.c');
  });
  defineCondition('Input is invalid', ({ page, baseURL }) => page.goto(`${baseURL ?? ''}/x`), {
    screen: 'Login',
  });
});

function thrown(fn: () => unknown): Error {
  try {
    fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error('expected a throw');
}

describe('resolution', () => {
  it('finds definitions', () => {
    expect(resolveScreen('Login')?.name).toBe('Login');
    expect(resolveScreen('Nowhere')).toBeUndefined();
    expect(resolveElement('Login Form').name).toBe('Login Form');
    expect(resolveTarget('Login Form', 'Email')).toBeTypeOf('function');
    expect(resolveSelf('Login Button')).toBeTypeOf('function');
    expect(resolveCondition('Input is valid').name).toBe('Input is valid');
    expect(resolveCondition('Input is invalid', { screen: 'Login' }).screen).toBe('Login');
  });

  it('throws NimaimeRuntimeError naming the Sanmaime names and location', () => {
    const ctx = { screen: 'Login', file: 'specs/login.sanmaime', location: { line: 4, column: 5 } };
    const missingElement = thrown(() => resolveElement('Nowhere', ctx));
    expect(missingElement).toBeInstanceOf(NimaimeRuntimeError);
    expect(missingElement.name).toBe('NimaimeRuntimeError');
    expect(missingElement.message).toBe(
      'No element definition for "Element: Nowhere" (Screen: Login). ' +
        "Define it with defineElement('Nowhere', …).\nLocation: specs/login.sanmaime:4",
    );
    expect(thrown(() => resolveTarget('Login Form', 'Password')).message).toBe(
      'Element "Login Form" has no target "Password". Defined targets: "Email".',
    );
    expect(thrown(() => resolveSelf('Login Form')).message).toMatch(
      /^Element "Login Form" has no locator for the element itself, which Enable \/ Disable need/,
    );
    expect(thrown(() => resolveCondition('Input is invalid', { screen: 'Home' })).message).toMatch(
      /^No condition definition for "When: Input is invalid" in Screen "Home"/,
    );
    expect(thrown(() => resolveCondition('Input is invalid')).message).toMatch(
      /^No condition definition for "When: Input is invalid"\. /,
    );
  });

  it('formats Sanmaime locations without a column', () => {
    expect(formatSanmaimeLocation(undefined, { line: 1, column: 1 })).toBeUndefined();
    expect(formatSanmaimeLocation('a.sanmaime', undefined)).toBe('a.sanmaime');
    expect(formatSanmaimeLocation('a.sanmaime', { line: 3, column: 5 })).toBe('a.sanmaime:3');
  });

  it('validates a whole plan', () => {
    const plan: NimaimePlan = {
      screen: 'Login',
      element: 'Login Button',
      condition: 'Input is invalid',
      expectations: [{ kind: 'disable' }, { kind: 'hide', target: 'Spinner' }],
    };
    expect(() => {
      validatePlan(plan);
    }).not.toThrow();
    // A missing screen definition is fine.
    expect(() => {
      validatePlan({ ...plan, screen: 'Nowhere', condition: undefined });
    }).not.toThrow();
    expect(() => {
      validatePlan({ ...plan, screen: 'Nowhere' });
    }).toThrow(/No condition definition/);
    expect(() => {
      validatePlan({ ...plan, expectations: [{ kind: 'show' }] });
    }).toThrow(/needs a target name/);
    expect(() => {
      validatePlan({
        ...plan,
        element: 'Login Form',
        condition: undefined,
        expectations: [{ kind: 'enable' }],
      });
    }).toThrow(/no locator for the element itself/);
  });
});

describe('fixtureNamesOf', () => {
  it('reads destructured fixture names like Playwright', () => {
    expect(fixtureNamesOf(() => locator)).toEqual([]);
    expect(fixtureNamesOf(({ page }: { page: unknown }) => page)).toEqual(['page']);
    expect(
      fixtureNamesOf(async ({ page, login: signIn }: { page: unknown; login: () => unknown }) => {
        await Promise.resolve([page, signIn]);
      }),
    ).toEqual(['page', 'login']);
    expect(
      fixtureNamesOf(function named(
        // a comment (with parens)
        { page, baseURL = '/' }: { page: unknown; baseURL?: string },
      ) {
        return [page, baseURL];
      }),
    ).toEqual(['page', 'baseURL']);
    const method = {
      open({ context }: { context: unknown }) {
        return context;
      },
    };
    // eslint-disable-next-line @typescript-eslint/unbound-method -- only its source is read
    expect(fixtureNamesOf(method.open)).toEqual(['context']);
  });

  it('returns undefined when the fixtures cannot be known', () => {
    expect(fixtureNamesOf((fixtures: { page: unknown }) => fixtures.page)).toBeUndefined();
    expect(fixtureNamesOf(({ ...all }: Record<string, unknown>) => all)).toBeUndefined();
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const plain = new Function('f', 'return f.page');
    expect(fixtureNamesOf(plain)).toBeUndefined();
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const makeArrow = new Function('return f => f.page') as () => () => unknown;
    expect(fixtureNamesOf(makeArrow())).toBeUndefined();
  });
});

describe('collectFixtureNames', () => {
  it('unions the fixtures of the callbacks a plan runs', () => {
    expect(
      collectFixtureNames({
        screen: 'Login',
        element: 'Login Button',
        condition: 'Input is invalid',
        expectations: [{ kind: 'disable' }, { kind: 'hide', target: 'Spinner' }],
      }),
    ).toEqual({ names: ['baseURL', 'page'], unknown: [] });
  });

  it('includes the background and every block condition (v0.2)', () => {
    interface Shop {
      login: () => Promise<void>;
      cart: () => Promise<void>;
    }
    const { defineCondition } = createNimaime() as unknown as NimaimeDefinitions<Shop>;
    defineCondition('Logged in', async ({ login }) => {
      await login();
    });
    defineCondition('Has items', async ({ cart }) => {
      await cart();
    });
    expect(
      collectFixtureNames({
        screen: 'Login',
        element: 'Login Button',
        background: ['Logged in'],
        conditions: ['Input is invalid', 'Has items'],
        expectations: [],
      }),
    ).toEqual({ names: ['baseURL', 'cart', 'login', 'page'], unknown: [] });
  });

  it('reports callbacks whose fixtures cannot be analysed', () => {
    const { defineElement } = createNimaime();
    defineElement('Opaque', (fixtures) => fixtures.page.locator('x'));
    expect(
      collectFixtureNames({
        screen: 'Nowhere',
        element: 'Opaque',
        expectations: [{ kind: 'enable' }, { kind: 'disable' }],
      }),
    ).toEqual({ names: [], unknown: ['element "Opaque" self'] });
  });

  it('skips names that do not resolve', () => {
    expect(
      collectFixtureNames({
        screen: 'Nowhere',
        element: 'Nowhere',
        condition: 'Nothing',
        expectations: [{ kind: 'show', target: 'X' }],
      }),
    ).toEqual({ names: [], unknown: [] });
  });
});

describe('guardFixtures', () => {
  it('passes provided fixtures through and rejects missing ones', () => {
    const guarded = guardFixtures({ page: 1, maybe: undefined }, 'Condition "X"') as Record<
      string,
      unknown
    >;
    expect(guarded.page).toBe(1);
    expect(guarded.maybe).toBeUndefined();
    expect(guarded.then).toBeUndefined();
    expect(() => guarded.login).toThrow(
      new NimaimeRuntimeError(
        'Condition "X" uses the fixture "login", but the test did not provide it. ' +
          'Regenerate the specs (nimaime-gen) or pass "login" to $nimaime.',
      ),
    );
    const { page } = guarded;
    expect(page).toBe(1);
  });
});
