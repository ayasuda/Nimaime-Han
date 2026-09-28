import { test as base, type Locator, type Page } from '@playwright/test';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNimaime } from '../../src/index';
import {
  createNimaimeRuntime,
  NimaimeExpectationError,
  NimaimeRuntimeError,
  resetRegistry,
  type ExpectationKind,
  type Nimaime,
  type NimaimeDriver,
  type NimaimePlan,
  type StepLocation,
} from '../../src/runtime/index';

/** A fake locator that remembers which test id it was built from. */
interface FakeLocator {
  testId: string;
  toString(): string;
}

interface Harness {
  nimaime: Nimaime;
  events: string[];
  steps: { title: string; location: StepLocation | undefined }[];
  /** Test ids whose assertion fails. */
  failing: Set<string>;
  fixtures: { page: Page; events: string[] };
}

function harness(): Harness {
  const events: string[] = [];
  const steps: Harness['steps'] = [];
  const failing = new Set<string>();
  const page = {
    getByTestId: (testId: string): FakeLocator => ({
      testId,
      toString: () => `getByTestId('${testId}')`,
    }),
  } as unknown as Page;
  const driver: NimaimeDriver = {
    async step(title, body, location) {
      steps.push({ title, location });
      events.push(`step ${title}`);
      await body();
    },
    assert(kind: ExpectationKind, locator: Locator) {
      const { testId } = locator as unknown as FakeLocator;
      events.push(`assert ${kind} ${testId}`);
      return failing.has(testId)
        ? Promise.reject(new Error(`expect(locator) failed for ${testId}`))
        : Promise.resolve();
    },
    probe: (kind) => Promise.resolve(kind === 'show' ? 'hidden' : 'enabled'),
    specFile: '/app/.sanmaime-gen/specs/login.sanmaime.spec.ts',
    cwd: '/app',
  };
  return {
    nimaime: createNimaimeRuntime(driver),
    events,
    steps,
    failing,
    fixtures: { page, events },
  };
}

// `events` is a custom fixture: definitions log into it.
const test = base.extend<{ events: string[] }>({ events: [] as string[] });

beforeEach(() => {
  resetRegistry();
  const { defineScreen, defineElement, defineCondition } = createNimaime(test);
  defineScreen('Login', {
    open: ({ events }) => {
      events.push('open Login');
    },
  });
  defineElement('Login Button', ({ page }) => page.getByTestId('button'), {
    Spinner: ({ page }) => page.getByTestId('spinner'),
  });
  defineElement('User Information', {
    Username: ({ page }) => page.getByTestId('username'),
    'Full name': ({ page }) => page.getByTestId('real-name'),
  });
  defineCondition('Input is invalid', ({ events }) => {
    events.push('condition Input is invalid');
  });
});

const plan: NimaimePlan = {
  screen: 'Login',
  element: 'Login Button',
  condition: 'Input is invalid',
  expectations: [
    { kind: 'disable', location: { line: 16, column: 5 } },
    { kind: 'show', target: 'Spinner', location: { line: 17, column: 5 } },
  ],
  file: '../../specs/login.sanmaime',
  locations: { screen: { line: 1, column: 1 }, condition: { line: 15, column: 5 } },
};

describe('$nimaime.run', () => {
  it('opens the screen, then establishes the condition, then checks each expectation', async () => {
    const h = harness();
    await h.nimaime.run(h.fixtures, plan);
    expect(h.events).toEqual([
      'step Screen: Login',
      'open Login',
      'step When: Input is invalid',
      'condition Input is invalid',
      'step Disable',
      'assert disable button',
      'step Show: Spinner',
      'assert show spinner',
    ]);
  });

  it('locates steps at the .sanmaime lines (relative to the spec file)', async () => {
    const h = harness();
    await h.nimaime.run(h.fixtures, plan);
    const file = '/app/specs/login.sanmaime';
    expect(h.steps).toEqual([
      { title: 'Screen: Login', location: { file, line: 1, column: 1 } },
      { title: 'When: Input is invalid', location: { file, line: 15, column: 5 } },
      { title: 'Disable', location: { file, line: 16, column: 5 } },
      { title: 'Show: Spinner', location: { file, line: 17, column: 5 } },
    ]);
  });

  it('opens a screen and establishes a condition once per test', async () => {
    const h = harness();
    await h.nimaime.run(h.fixtures, plan);
    await h.nimaime.run(h.fixtures, {
      screen: 'Login',
      element: 'User Information',
      condition: 'Input is invalid',
      expectations: [{ kind: 'hide', target: 'Full name' }],
    });
    expect(h.events.filter((e) => !e.startsWith('step') && !e.startsWith('assert'))).toEqual([
      'open Login',
      'condition Input is invalid',
    ]);
    expect(h.steps.at(-1)).toEqual({ title: 'Hide: Full name', location: undefined });
  });

  it('skips opening a screen without a definition', async () => {
    const h = harness();
    await h.nimaime.run(h.fixtures, {
      screen: 'Elsewhere',
      element: 'User Information',
      expectations: [{ kind: 'show', target: 'Username' }],
    });
    expect(h.events).toEqual(['step Show: Username', 'assert show username']);
  });

  it('validates the plan before doing anything', async () => {
    const h = harness();
    await expect(
      h.nimaime.run(h.fixtures, { ...plan, expectations: [{ kind: 'show', target: 'Nope' }] }),
    ).rejects.toThrow(NimaimeRuntimeError);
    await expect(h.nimaime.run(h.fixtures, { ...plan, element: 'Nope' })).rejects.toThrow(
      /"Element: Nope" \(Screen: Login\)/,
    );
    expect(h.events).toEqual([]);
  });

  it('wraps a failed assertion with the Sanmaime context and stops', async () => {
    const h = harness();
    h.failing.add('button');
    const error = await h.nimaime.run(h.fixtures, plan).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NimaimeExpectationError);
    const { message, sanmaime, stack } = error as NimaimeExpectationError;
    expect(message).toBe(
      'Screen: Login\nElement: Login Button\nWhen: Input is invalid\nExpected: disabled\n' +
        'Actual: enabled\nLocation: specs/login.sanmaime:16\n\n' +
        "Details:\n  expect(locator) failed for button\n\n  Locator: getByTestId('button')",
    );
    expect(sanmaime).toMatchObject({
      kind: 'disable',
      actual: 'enabled',
      file: 'specs/login.sanmaime',
      locator: "getByTestId('button')",
      timeout: undefined,
    });
    expect(stack?.split('\n    at ')[1]).toBe('Disable (/app/specs/login.sanmaime:16:5)');
    expect(h.events.at(-1)).toBe('assert disable button');
  });

  it('reports fixtures the test did not pass', async () => {
    const h = harness();
    await expect(h.nimaime.run({ page: h.fixtures.page }, plan)).rejects.toThrow(
      'Screen "Login" open uses the fixture "events", but the test did not provide it.',
    );
  });
});

describe('low-level methods', () => {
  it('check each kind', async () => {
    const h = harness();
    await h.nimaime.expectShow(h.fixtures, 'User Information', 'Username');
    await h.nimaime.expectHide(h.fixtures, 'User Information', 'Full name');
    await h.nimaime.expectEnable(h.fixtures, 'Login Button');
    await h.nimaime.expectDisable(h.fixtures, 'Login Button');
    expect(h.events.filter((e) => e.startsWith('assert'))).toEqual([
      'assert show username',
      'assert hide real-name',
      'assert enable button',
      'assert disable button',
    ]);
    expect(h.steps.map((s) => s.title)).toEqual([
      'Show: Username',
      'Hide: Full name',
      'Enable',
      'Disable',
    ]);
  });

  it('throw NimaimeRuntimeError for unresolvable names', async () => {
    const h = harness();
    await expect(h.nimaime.expectEnable(h.fixtures, 'User Information')).rejects.toThrow(
      /no locator for the element itself/,
    );
    await expect(h.nimaime.condition(h.fixtures, 'Unknown')).rejects.toThrow(
      /No condition definition for "When: Unknown"/,
    );
    await expect(h.nimaime.check(h.fixtures, 'User Information', { kind: 'hide' })).rejects.toThrow(
      /"Hide:" of element "User Information" needs a target name/,
    );
    expect(h.events).toEqual([]);
  });
});
