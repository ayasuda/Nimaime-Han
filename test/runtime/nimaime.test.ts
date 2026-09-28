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
    assert(kind: ExpectationKind, locator: Locator, value?: string | number) {
      const { testId } = locator as unknown as FakeLocator;
      events.push(
        `assert ${kind} ${testId}${value === undefined ? '' : ` ${JSON.stringify(value)}`}`,
      );
      return failing.has(testId)
        ? Promise.reject(new Error(`expect(locator) failed for ${testId}`))
        : Promise.resolve();
    },
    probe: (kind) =>
      Promise.resolve(
        kind === 'show'
          ? 'hidden'
          : kind === 'text'
            ? 'text "Hello"'
            : kind === 'count'
              ? '2'
              : 'enabled',
      ),
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
  for (const name of ['Logged in', 'Cookies accepted', 'Remember me checked']) {
    defineCondition(name, ({ events }) => {
      events.push(`condition ${name}`);
    });
  }
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

describe('$nimaime.run with Background: and And when: (v0.2)', () => {
  const composed: NimaimePlan = {
    screen: 'Login',
    element: 'Login Button',
    background: ['Logged in', 'Cookies accepted'],
    conditions: ['Input is invalid', 'Remember me checked'],
    expectations: [{ kind: 'disable', location: { line: 9, column: 5 } }],
    file: '../../specs/login.sanmaime',
    locations: {
      screen: { line: 1, column: 1 },
      background: [
        { line: 2, column: 3 },
        { line: 3, column: 3 },
      ],
      conditions: [
        { line: 6, column: 5 },
        { line: 7, column: 5 },
      ],
    },
  };

  it('runs open, each background, each condition, then the expectations, in order', async () => {
    const h = harness();
    await h.nimaime.run(h.fixtures, composed);
    expect(h.events).toEqual([
      'step Screen: Login',
      'open Login',
      'step Background: Logged in',
      'condition Logged in',
      'step Background: Cookies accepted',
      'condition Cookies accepted',
      'step When: Input is invalid',
      'condition Input is invalid',
      'step And when: Remember me checked',
      'condition Remember me checked',
      'step Disable',
      'assert disable button',
    ]);
    const file = '/app/specs/login.sanmaime';
    expect(h.steps.map((s) => [s.title, s.location?.line])).toEqual([
      ['Screen: Login', 1],
      ['Background: Logged in', 2],
      ['Background: Cookies accepted', 3],
      ['When: Input is invalid', 6],
      ['And when: Remember me checked', 7],
      ['Disable', 9],
    ]);
    expect(h.steps[1]?.location?.file).toBe(file);
  });

  it('runs the background before an unconditional block too', async () => {
    const h = harness();
    await h.nimaime.run(h.fixtures, {
      screen: 'Login',
      element: 'User Information',
      background: ['Logged in'],
      expectations: [{ kind: 'show', target: 'Username' }],
    });
    expect(h.events).toEqual([
      'step Screen: Login',
      'open Login',
      'step Background: Logged in',
      'condition Logged in',
      'step Show: Username',
      'assert show username',
    ]);
  });

  it('establishes each condition once per test and prefers conditions over condition', async () => {
    const h = harness();
    await h.nimaime.run(h.fixtures, composed);
    await h.nimaime.run(h.fixtures, {
      ...composed,
      condition: 'Ignored',
      conditions: ['Logged in', 'Input is invalid'],
    });
    expect(h.events.filter((e) => e.startsWith('condition'))).toEqual([
      'condition Logged in',
      'condition Cookies accepted',
      'condition Input is invalid',
      'condition Remember me checked',
    ]);
  });

  it('names the whole block in failure messages', async () => {
    const h = harness();
    h.failing.add('button');
    const error = await h.nimaime.run(h.fixtures, composed).catch((e: unknown) => e);
    expect((error as Error).message).toMatch(
      /^Screen: Login\nElement: Login Button\nWhen: Input is invalid and Remember me checked\n/,
    );
  });

  it('validates every background and condition name before doing anything', async () => {
    const h = harness();
    await expect(
      h.nimaime.run(h.fixtures, { ...composed, background: ['Logged in', 'Nope'] }),
    ).rejects.toThrow(
      'No condition definition for "Background: Nope" in Screen "Login". ' +
        "Define it with defineCondition('Nope', async ({ page }) => { … }).\n" +
        'Location: ../../specs/login.sanmaime:3',
    );
    await expect(
      h.nimaime.run(h.fixtures, { ...composed, conditions: ['Input is invalid', 'Nope'] }),
    ).rejects.toThrow(/No condition definition for "And when: Nope"/);
    expect(h.events).toEqual([]);
  });

  it('background() establishes a condition in a Background: step', async () => {
    const h = harness();
    await h.nimaime.background(h.fixtures, 'Logged in', { screen: 'Login' });
    await h.nimaime.condition(h.fixtures, 'Logged in', { screen: 'Login' });
    expect(h.events).toEqual(['step Background: Logged in', 'condition Logged in']);
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

describe('$nimaime: expectation vocabulary v1 (v0.3)', () => {
  it('checks every kind through the table, on a target or on the element itself', async () => {
    const h = harness();
    const expectations: NimaimePlan['expectations'] = [
      { kind: 'check' },
      { kind: 'uncheck', target: 'Spinner' },
      { kind: 'text', target: 'Spinner', value: 'Loading "all"' },
      { kind: 'contain', target: 'Spinner', value: 'Load' },
      { kind: 'count', target: 'Spinner', value: 0 },
      { kind: 'readonly' },
      { kind: 'enable', target: 'Spinner' },
    ];
    await h.nimaime.run(h.fixtures, { screen: 'Login', element: 'Login Button', expectations });
    expect(h.events.filter((e) => e.startsWith('assert'))).toEqual([
      'assert check button',
      'assert uncheck spinner',
      'assert text spinner "Loading \\"all\\""',
      'assert contain spinner "Load"',
      'assert count spinner 0',
      'assert readonly button',
      'assert enable spinner',
    ]);
    expect(h.steps.map((s) => s.title).slice(1)).toEqual([
      'Check',
      'Uncheck: Spinner',
      'Text: Spinner = "Loading \\"all\\""',
      'Contain: Spinner = "Load"',
      'Count: Spinner = 0',
      'ReadOnly',
      'Enable: Spinner',
    ]);
  });

  it('phrases a failed Text: in the Sanmaime header', async () => {
    const h = harness();
    h.failing.add('spinner');
    const error = await h.nimaime
      .check(
        h.fixtures,
        'Login Button',
        { kind: 'text', target: 'Spinner', value: 'Welcome', location: { line: 7, column: 5 } },
        { screen: 'Login', file: '../../specs/login.sanmaime' },
      )
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NimaimeExpectationError);
    const failure = error as NimaimeExpectationError;
    expect(failure.message.split('\n').slice(0, 5)).toEqual([
      'Screen: Login',
      'Element: Login Button',
      'Expected: Spinner has text "Welcome"',
      'Actual: text "Hello"',
      'Location: specs/login.sanmaime:7',
    ]);
    expect(failure.toJSON().expectation).toEqual({
      kind: 'text',
      target: 'Spinner',
      value: 'Welcome',
    });
    expect(failure.stack?.split('\n    at ')[1]).toBe(
      'Text: Spinner = "Welcome" (/app/specs/login.sanmaime:7:5)',
    );
  });

  it('rejects expectations without the target or value their kind takes', async () => {
    const h = harness();
    const check = (expectation: NimaimePlan['expectations'][number]): Promise<void> =>
      h.nimaime.check(h.fixtures, 'Login Button', expectation);
    await expect(check({ kind: 'count', value: 1 })).rejects.toThrow(
      '"Count:" of element "Login Button" needs a target name.',
    );
    await expect(check({ kind: 'count', target: 'Spinner', value: '1' })).rejects.toThrow(
      '"Count:" of element "Login Button" needs a whole number value.',
    );
    await expect(check({ kind: 'text', target: 'Spinner' })).rejects.toThrow(
      '"Text:" of element "Login Button" needs a text value.',
    );
    await expect(check({ kind: 'visible' as ExpectationKind, target: 'Spinner' })).rejects.toThrow(
      'Unknown expectation kind "visible" for element "Login Button".',
    );
    await expect(
      h.nimaime.run(h.fixtures, {
        screen: 'Login',
        element: 'Login Button',
        expectations: [{ kind: 'contain', target: 'Spinner', location: { line: 3, column: 5 } }],
        file: 'specs/login.sanmaime',
      }),
    ).rejects.toThrow(
      '"Contain:" of element "Login Button" needs a text value.\nLocation: specs/login.sanmaime:3',
    );
    expect(h.events.filter((e) => e.startsWith('assert'))).toEqual([]);
  });
});
