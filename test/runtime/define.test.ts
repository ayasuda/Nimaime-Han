import { fileURLToPath } from 'node:url';
import { test as base, type Locator, type Page } from '@playwright/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNimaime, NimaimeDefinitionError } from '../../src/index';
import {
  findCondition,
  findElement,
  findScreen,
  listDefinitions,
  resetRegistry,
} from '../../src/runtime/index';

const thisFile = fileURLToPath(import.meta.url);

/** A stand-in for Playwright's `page`: `getByTestId(id)` returns a fake locator carrying the id. */
function fakePage(): Page {
  return { getByTestId: (id: string) => ({ testId: id }) } as unknown as Page;
}

function testIdOf(locator: Locator | undefined): unknown {
  return (locator as unknown as { testId: string } | undefined)?.testId;
}

const { defineScreen, defineElement, defineCondition } = createNimaime();

beforeEach(() => {
  resetRegistry();
});

describe('createNimaime', () => {
  it('works without a test and records that no custom test was used', () => {
    defineScreen('Login');
    expect(findScreen('Login')).toMatchObject({ test: undefined, customTest: false });
  });

  it('stores the custom test on every entry', () => {
    const test = base.extend<{ login: string }>({ login: ['alice', { option: true }] });
    const nimaime = createNimaime(test);
    nimaime.defineScreen('Login');
    nimaime.defineElement('Form', { Email: ({ page }) => page.getByTestId('email') });
    nimaime.defineCondition('Logged in', () => undefined);
    const all = listDefinitions();
    for (const entry of [...all.screens, ...all.elements, ...all.conditions]) {
      expect(entry.test).toBe(test);
      expect(entry.customTest).toBe(true);
    }
  });

  it('rejects something that is not a Playwright test', () => {
    // @ts-expect-error -- not a TestType
    expect(() => createNimaime({})).toThrow(NimaimeDefinitionError);
  });
});

describe('defineScreen', () => {
  it('registers a screen with its open function and source location', () => {
    const open = vi.fn();
    defineScreen('User Details', { open });
    const screen = findScreen('User Details');
    expect(screen?.name).toBe('User Details');
    expect(screen?.open).toBe(open);
    expect(screen?.source).toEqual({
      file: thisFile,
      line: expect.any(Number) as number,
      column: 5,
    });
  });

  it('allows a screen without open', () => {
    defineScreen('Home', {});
    expect(findScreen('Home')?.open).toBeUndefined();
  });

  it('validates its arguments', () => {
    expect(() => {
      defineScreen('');
    }).toThrow(/screen name must be a non-empty string/);
    expect(() => {
      // @ts-expect-error -- open must be a function
      defineScreen('X', { open: '/x' });
    }).toThrow(/`open` must be a function/);
  });
});

describe('defineElement', () => {
  it('registers targets (README form)', () => {
    defineElement('User Information', {
      Username: ({ page }) => page.getByTestId('username'),
      'Full name': ({ page }) => page.getByTestId('real-name'),
    });
    const element = findElement('User Information');
    expect(element?.self).toBeUndefined();
    expect([...(element?.targets.keys() ?? [])]).toEqual(['Username', 'Full name']);
    const locator = element?.targets.get('Full name')?.({ page: fakePage() });
    expect(testIdOf(locator)).toBe('real-name');
  });

  it('registers a locator for the element itself, with or without targets', () => {
    defineElement('Login Button', ({ page }) => page.getByTestId('login'));
    defineElement('Search', ({ page }) => page.getByTestId('search'), {
      'Search box': ({ page }) => page.getByTestId('q'),
    });
    const button = findElement('Login Button');
    expect(testIdOf(button?.self?.({ page: fakePage() }))).toBe('login');
    expect(button?.targets.size).toBe(0);
    const search = findElement('Search');
    expect(testIdOf(search?.self?.({ page: fakePage() }))).toBe('search');
    expect([...(search?.targets.keys() ?? [])]).toEqual(['Search box']);
  });

  it('keeps target names such as "__proto__" and "constructor" as plain names', () => {
    const targets = JSON.parse('{"__proto__": 1, "constructor": 2}') as Record<string, unknown>;
    targets.__proto__ = () => fakePage().getByTestId('p');
    targets.constructor = () => fakePage().getByTestId('c');
    defineElement('Odd', targets as never);
    expect([...(findElement('Odd')?.targets.keys() ?? [])]).toEqual(['__proto__', 'constructor']);
  });

  it('validates its arguments', () => {
    expect(() => {
      defineElement('Empty', {});
    }).toThrow(/define at least one target locator/);
    expect(() => {
      // @ts-expect-error -- a target locator must be a function
      defineElement('Bad', { Username: 'username' });
    }).toThrow(/the locator for target "Username" must be a function/);
    expect(() => {
      // @ts-expect-error -- (name, targets, targets) is not an overload
      defineElement('Bad', { A: () => fakePage().getByTestId('a') }, {});
    }).toThrow(/expected \(name, targets\) or \(name, self, targets\?\)/);
    expect(() => {
      // @ts-expect-error -- targets must be an object
      defineElement('Bad', 42);
    }).toThrow(/targets must be an object/);
    expect(() => {
      defineElement('Bad', { '': () => fakePage().getByTestId('a') });
    }).toThrow(/target name must be a non-empty string/);
  });
});

describe('defineCondition', () => {
  it('registers a global condition by default', () => {
    const fn = vi.fn();
    defineCondition('Logged in', fn);
    expect(findCondition('Logged in')).toMatchObject({ name: 'Logged in', fn, screen: undefined });
    expect(findCondition('Logged in', { screen: 'Any Screen' })?.fn).toBe(fn);
  });

  it('prefers a screen-scoped condition over the global one', () => {
    const global = vi.fn();
    const onLogin = vi.fn();
    defineCondition('Input is invalid', global);
    defineCondition('Input is invalid', onLogin, { screen: 'Login' });
    expect(findCondition('Input is invalid', { screen: 'Login' })?.fn).toBe(onLogin);
    expect(findCondition('Input is invalid', { screen: 'Signup' })?.fn).toBe(global);
    expect(findCondition('Input is invalid')?.fn).toBe(global);
  });

  it('finds a screen-scoped condition only from its screen', () => {
    const fn = vi.fn();
    defineCondition('Cart is empty', fn, { screen: 'Cart' });
    expect(findCondition('Cart is empty', { screen: 'Cart' })).toMatchObject({
      fn,
      screen: 'Cart',
    });
    expect(findCondition('Cart is empty', { screen: 'Home' })).toBeUndefined();
    expect(findCondition('Cart is empty')).toBeUndefined();
    expect(findCondition('Unknown', { screen: 'Cart' })).toBeUndefined();
  });

  it('passes the fixtures to the condition', async () => {
    const page = fakePage();
    const fn = vi.fn(async ({ page: p }: { page: Page }) => {
      await Promise.resolve(p);
    });
    defineCondition('Viewing your own profile', fn);
    await findCondition('Viewing your own profile')?.fn({ page });
    expect(fn).toHaveBeenCalledWith({ page });
  });

  it('validates its arguments', () => {
    expect(() => {
      // @ts-expect-error -- fn must be a function
      defineCondition('X', 'nope');
    }).toThrow(/the second argument must be a function/);
    expect(() => {
      defineCondition('X', vi.fn(), { screen: '' });
    }).toThrow(/screen name must be a non-empty string/);
    expect(() => {
      defineCondition(' ', vi.fn());
    }).toThrow(/condition name must be a non-empty string/);
  });
});

describe('duplicate definitions', () => {
  /** Returns the `file:line:` prefix of the location a definition was registered at. */
  function at(source: { file: string; line: number } | undefined): string {
    return `${source?.file ?? '?'}:${String(source?.line ?? '?')}:`;
  }

  it('throws for a screen defined twice, naming both locations', () => {
    defineScreen('Login', { open: vi.fn() });
    const first = findScreen('Login')?.source;
    let error: unknown;
    try {
      defineScreen('Login', { open: vi.fn() });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(NimaimeDefinitionError);
    const message = (error as Error).message;
    expect(message).toContain('Duplicate screen definition "Login"');
    expect(message).toContain(`First defined at ${at(first)}`);
    expect(message).toMatch(
      new RegExp(`Defined again at ${escape(thisFile)}:${String((first?.line ?? 0) + 4)}:\\d+`),
    );
  });

  it('throws for an element defined twice, naming both locations', () => {
    defineElement('Form', { A: () => fakePage().getByTestId('a') });
    const first = findElement('Form')?.source;
    expect(() => {
      defineElement('Form', { A: () => fakePage().getByTestId('a') });
    }).toThrow(
      new RegExp(
        `Duplicate element definition "Form"\\.\\n  First defined at ${escape(at(first))}\\d+\\n  Defined again at ${escape(thisFile)}:\\d+:\\d+`,
      ),
    );
  });

  it('throws for a condition defined twice in the same scope only', () => {
    defineCondition('Logged in', vi.fn());
    defineCondition('Logged in', vi.fn(), { screen: 'A' });
    defineCondition('Logged in', vi.fn(), { screen: 'B' });
    expect(() => {
      defineCondition('Logged in', vi.fn());
    }).toThrow(/Duplicate condition definition "Logged in" \(global\)/);
    expect(() => {
      defineCondition('Logged in', vi.fn(), { screen: 'A' });
    }).toThrow(/Duplicate condition definition "Logged in" \(screen "A"\)/);
  });

  it('ignores re-registration of an identical definition (same functions)', () => {
    const open = vi.fn();
    const self = () => fakePage().getByTestId('x');
    const targets = { A: () => fakePage().getByTestId('a') };
    const fn = vi.fn();
    defineScreen('S', { open });
    defineElement('E', self, targets);
    defineCondition('C', fn, { screen: 'S' });
    const firstSource = findScreen('S')?.source;
    // Defined again from other call sites, with the same function objects.
    defineScreen('S', { open });
    defineElement('E', self, { ...targets });
    defineCondition('C', fn, { screen: 'S' });
    const all = listDefinitions();
    expect(all.screens).toHaveLength(1);
    expect(all.elements).toHaveLength(1);
    expect(all.conditions).toHaveLength(1);
    // The first registration is kept.
    expect(findScreen('S')?.source).toEqual(firstSource);
  });

  it('ignores re-evaluation of the same call site (e.g. a definition file loaded twice)', () => {
    const load = () => {
      defineScreen('S', { open: () => undefined });
      defineElement('E', { A: () => fakePage().getByTestId('a') });
      defineCondition('C', () => undefined);
    };
    load();
    const first = listDefinitions();
    load();
    const second = listDefinitions();
    expect(second.screens).toEqual(first.screens);
    expect(second.elements).toEqual(first.elements);
    expect(second.conditions).toEqual(first.conditions);
  });

  it('treats elements with different targets as a conflict', () => {
    const a = () => fakePage().getByTestId('a');
    defineElement('E', { A: a });
    expect(() => {
      defineElement('E', { A: a, B: a });
    }).toThrow(/Duplicate element definition "E"/);
  });
});

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
