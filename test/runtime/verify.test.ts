import type { Locator, Page } from '@playwright/test';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNimaime } from '../../src/index';
import { parse } from '../../src/parser';
import {
  createNimaimeRuntime,
  NimaimeExpectationError,
  NimaimeRuntimeError,
  planVerify,
  registerScreenSpec,
  resetRegistry,
  resetScreenSpecs,
  screenSpecsFromDocument,
  type ExpectationKind,
  type Nimaime,
  type NimaimeDriver,
  type StepLocation,
} from '../../src/runtime/index';

interface FakeLocator {
  testId: string;
  toString(): string;
}

interface Harness {
  nimaime: Nimaime;
  events: string[];
  steps: { title: string; location: StepLocation | undefined; depth: number }[];
  failing: Set<string>;
  fixtures: { page: Page };
}

function harness(): Harness {
  const events: string[] = [];
  const steps: Harness['steps'] = [];
  const failing = new Set<string>();
  let depth = 0;
  const page = {
    getByTestId: (testId: string): FakeLocator => ({
      testId,
      toString: () => `getByTestId('${testId}')`,
    }),
  } as unknown as Page;
  const driver: NimaimeDriver = {
    async step(title, body, location) {
      steps.push({ title, location, depth });
      events.push(`${'  '.repeat(depth)}${title}`);
      depth++;
      try {
        await body();
      } finally {
        depth--;
      }
    },
    assert(kind: ExpectationKind, locator: Locator) {
      const { testId } = locator as unknown as FakeLocator;
      events.push(`${'  '.repeat(depth)}assert ${kind} ${testId}`);
      return failing.has(testId)
        ? Promise.reject(new Error(`expect(locator) failed for ${testId}`))
        : Promise.resolve();
    },
    probe: () => Promise.resolve('hidden'),
    specFile: '/app/.features-gen/features/user-details.feature.spec.js',
    cwd: '/app',
  };
  return { nimaime: createNimaimeRuntime(driver), events, steps, failing, fixtures: { page } };
}

const SPEC = `Screen: User Details

  Element: User Information
    Show: Username

    When: Viewing your own profile
    Show: Full name
    And: Email address

    When: Viewing another user's profile
    Hide: Full name
    And: Email address

  Element: Edit Action
    When: Viewing your own profile
    Show: Edit button
    Enable

  Element: Footer
    Show: Copyright
`;

const opened: string[] = [];

beforeEach(() => {
  resetRegistry();
  resetScreenSpecs();
  opened.length = 0;
  const { defineScreen, defineElement, defineCondition } = createNimaime();
  defineScreen('User Details', {
    open: () => {
      opened.push('open');
    },
  });
  defineElement('User Information', {
    Username: ({ page }) => page.getByTestId('username'),
    'Full name': ({ page }) => page.getByTestId('full-name'),
    'Email address': ({ page }) => page.getByTestId('email'),
  });
  defineElement('Edit Action', ({ page }) => page.getByTestId('edit'), {
    'Edit button': ({ page }) => page.getByTestId('edit'),
  });
  defineElement('Footer', { Copyright: ({ page }) => page.getByTestId('copyright') });
  defineCondition('Viewing your own profile', () => {
    opened.push('condition');
  });
  const { document, diagnostics } = parse(SPEC);
  expect(diagnostics).toEqual([]);
  for (const spec of screenSpecsFromDocument(document, '/app/specs/user-details.sanmaime')) {
    registerScreenSpec(spec);
  }
});

describe('planVerify', () => {
  it('selects the unconditional blocks only without `when`', () => {
    const plan = planVerify('User Details');
    expect(plan.elements.map((e) => [e.element, e.blocks.map((b) => b.condition)])).toEqual([
      ['User Information', [undefined]],
      ['Footer', [undefined]],
    ]);
    expect(plan.file).toBe('/app/specs/user-details.sanmaime');
    expect(plan.location).toEqual({ line: 1, column: 1 });
  });

  it('adds the matching When: blocks of every element, in source order', () => {
    const plan = planVerify(' User Details ', { when: 'Viewing your own profile' });
    expect(plan.elements.map((e) => [e.element, e.blocks.map((b) => b.condition)])).toEqual([
      ['User Information', [undefined, 'Viewing your own profile']],
      ['Edit Action', ['Viewing your own profile']],
      ['Footer', [undefined]],
    ]);
    const block = plan.elements[0]?.blocks[1];
    expect(block).toMatchObject({
      screen: 'User Details',
      element: 'User Information',
      condition: 'Viewing your own profile',
      file: '/app/specs/user-details.sanmaime',
      locations: {
        screen: { line: 1, column: 1 },
        element: { line: 3, column: 3 },
        condition: { line: 6, column: 5 },
      },
    });
    expect(block?.expectations.map((e) => e.target)).toEqual(['Full name', 'Email address']);
  });

  it('restricts to `elements`', () => {
    const plan = planVerify('User Details', {
      when: ['Viewing your own profile'],
      elements: ['Edit Action'],
    });
    expect(plan.elements.map((e) => e.element)).toEqual(['Edit Action']);
  });

  it('rejects an unknown screen, listing the loaded ones', () => {
    expect(() => planVerify('Nope')).toThrow(
      new NimaimeRuntimeError(
        'No Sanmaime spec for "Screen: Nope". Loaded screens: "User Details".',
      ),
    );
    resetScreenSpecs();
    expect(() => planVerify('Nope')).toThrow(/no \.sanmaime file is loaded.*loadSanmaimeSpecs/);
  });

  it('rejects an unknown condition, listing the known ones', () => {
    expect(() => planVerify('User Details', { when: ['Viewing your own profile', 'Nope'] }))
      .toThrow(`Screen "User Details" has no "When: Nope" block. Conditions: \
"Viewing your own profile", "Viewing another user's profile".
Location: /app/specs/user-details.sanmaime:1`);
    expect(() =>
      planVerify('User Details', {
        when: "Viewing another user's profile",
        elements: 'Edit Action',
      }),
    ).toThrow(
      `The selected elements ("Edit Action") of Screen "User Details" have no ` +
        `"When: Viewing another user's profile" block. Conditions: "Viewing your own profile".`,
    );
  });

  it('rejects an unknown element, listing the known ones', () => {
    expect(() => planVerify('User Details', { elements: ['Nope'] })).toThrow(
      'Screen "User Details" has no element "Nope". ' +
        'Elements: "User Information", "Edit Action", "Footer".',
    );
  });

  it('rejects a selection with nothing to check', () => {
    expect(() => planVerify('User Details', { elements: 'Edit Action' })).toThrow(
      /^Nothing to verify in Screen "User Details": the selected elements have no unconditional expectations\. Pass the current state with \{ when: … \}\. Conditions: "Viewing your own profile"\./,
    );
  });
});

describe('$nimaime.verify', () => {
  it('checks the current page in nested steps, without opening or establishing anything', async () => {
    const h = harness();
    await h.nimaime.verify(h.fixtures, 'User Details', { when: 'Viewing your own profile' });
    expect(opened).toEqual([]);
    expect(h.events).toEqual([
      'Screen: User Details',
      '  Element: User Information',
      '    Show: Username',
      '      assert show username',
      '    When: Viewing your own profile',
      '      Show: Full name',
      '        assert show full-name',
      '      Show: Email address',
      '        assert show email',
      '  Element: Edit Action',
      '    When: Viewing your own profile',
      '      Show: Edit button',
      '        assert show edit',
      '      Enable',
      '        assert enable edit',
      '  Element: Footer',
      '    Show: Copyright',
      '      assert show copyright',
    ]);
  });

  it('locates the steps at the .sanmaime lines', async () => {
    const h = harness();
    await h.nimaime.verify(h.fixtures, 'User Details', {
      when: "Viewing another user's profile",
      elements: 'User Information',
    });
    const file = '/app/specs/user-details.sanmaime';
    expect(h.steps.map(({ title, location }) => [title, location])).toEqual([
      ['Screen: User Details', { file, line: 1, column: 1 }],
      ['Element: User Information', { file, line: 3, column: 3 }],
      ['Show: Username', { file, line: 4, column: 5 }],
      ["When: Viewing another user's profile", { file, line: 10, column: 5 }],
      ['Hide: Full name', { file, line: 11, column: 5 }],
      ['Hide: Email address', { file, line: 12, column: 5 }],
    ]);
  });

  it('reports a failure with the Sanmaime header, including When:', async () => {
    const h = harness();
    h.failing.add('email');
    const error = await h.nimaime
      .verify(h.fixtures, 'User Details', { when: 'Viewing your own profile' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NimaimeExpectationError);
    expect((error as Error).message.split('\n\nDetails:')[0]).toBe(
      'Screen: User Details\nElement: User Information\nWhen: Viewing your own profile\n' +
        'Expected: Email address is shown\nActual: hidden\nLocation: specs/user-details.sanmaime:8',
    );
    // Stops at the first failure.
    expect(h.events.at(-1)).toBe('        assert show email');
  });

  it('resolves every definition before touching the browser', async () => {
    registerScreenSpec({
      screen: 'Broken',
      elements: [
        {
          element: 'Footer',
          unconditional: [{ kind: 'show', target: 'Copyright' }],
          conditions: [],
        },
        { element: 'Missing', unconditional: [{ kind: 'show', target: 'X' }], conditions: [] },
      ],
    });
    const h = harness();
    await expect(h.nimaime.verify(h.fixtures, 'Broken')).rejects.toThrow(
      /No element definition for "Element: Missing" \(Screen: Broken\)/,
    );
    expect(h.events).toEqual([]);
  });

  it('does not need condition definitions', async () => {
    resetRegistry();
    const { defineElement } = createNimaime();
    defineElement('Edit Action', ({ page }) => page.getByTestId('edit'), {
      'Edit button': ({ page }) => page.getByTestId('edit'),
    });
    const h = harness();
    await h.nimaime.verify(h.fixtures, 'User Details', {
      when: 'Viewing your own profile',
      elements: ['Edit Action'],
    });
    expect(h.events.filter((e) => e.includes('assert'))).toHaveLength(2);
  });

  it('reports fixtures the caller did not pass', async () => {
    const h = harness();
    await expect(h.nimaime.verify({}, 'User Details')).rejects.toThrow(
      'Element "User Information" target "Username" uses the fixture "page", but the test did not provide it.',
    );
  });
});

describe('verify with Background: and And when: (v0.2)', () => {
  const COMPOSED = `Screen: Cart
  Background: Logged in

  Element: Checkout
    When: Has items
    Show: Total

    When: Has items
    And when: Address set
    Enable
`;

  beforeEach(() => {
    const { defineElement } = createNimaime();
    defineElement('Checkout', ({ page }) => page.getByTestId('checkout'), {
      Total: ({ page }) => page.getByTestId('total'),
    });
    const { document, diagnostics } = parse(COMPOSED);
    expect(diagnostics).toEqual([]);
    const [spec] = screenSpecsFromDocument(document, '/app/specs/cart.sanmaime');
    expect(spec?.background).toEqual(['Logged in']);
    expect(spec?.elements[0]?.conditions.map((c) => [c.name, c.conditions])).toEqual([
      ['Has items', undefined],
      ['Has items', ['Has items', 'Address set']],
    ]);
    if (spec) registerScreenSpec(spec);
  });

  it('checks a composed block only when all its conditions are listed', () => {
    const titles = (when: string[]): (string | undefined)[] =>
      planVerify('Cart', { when }).elements.flatMap((e) =>
        e.blocks.map((b) => b.condition ?? b.conditions?.join(' + ')),
      );
    expect(titles(['Has items'])).toEqual(['Has items']);
    expect(titles(['Has items', 'Address set'])).toEqual(['Has items', 'Has items + Address set']);
    // Background conditions are known names (the page is assumed to be in that state).
    expect(titles(['Logged in', 'Has items'])).toEqual(['Has items']);
    expect(() => planVerify('Cart', { when: ['Nope'] })).toThrow(
      /Conditions: "Has items", "Address set", "Logged in"\./,
    );
  });

  it('titles the step of a composed block like its test', async () => {
    const h = harness();
    await h.nimaime.verify(h.fixtures, 'Cart', { when: ['Has items', 'Address set'] });
    expect(h.events).toEqual([
      'Screen: Cart',
      '  Element: Checkout',
      '    When: Has items',
      '      Show: Total',
      '        assert show total',
      '    When: Has items and Address set',
      '      Enable',
      '        assert enable checkout',
    ]);
    expect(h.steps.find((s) => s.title === 'When: Has items and Address set')?.location).toEqual({
      file: '/app/specs/cart.sanmaime',
      line: 8,
      column: 5,
    });
  });
});
