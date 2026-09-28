import type { Page } from '@playwright/test';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  formatMissing,
  listTests,
  matchSpecs,
  withoutMissingDefinitions,
  type ParsedSpec,
} from '../../src/gen';
import { createNimaime } from '../../src/index';
import { parse } from '../../src/parser';
import { getRegistry, resetRegistry } from '../../src/runtime/index';

const { defineScreen, defineElement, defineCondition } = createNimaime();
const locator = ({ page }: { page: Page }) => page.locator('x');

function spec(source: string, file = '/project/specs/test.sanmaime'): ParsedSpec {
  const { document, diagnostics } = parse(source, { uri: 'specs/test.sanmaime' });
  return { file, source, document, diagnostics };
}

const USER_DETAILS = `Screen: User Details

  Element: User Information

    When: Viewing your own profile
    Show: Username
    And: Full name
    And: Email address

    When: Viewing another user's profile
    Show: Username
    Hide: Full name
    And: Email address
`;

beforeEach(() => {
  resetRegistry();
});

describe('matchSpecs', () => {
  it('resolves the README User Details example', () => {
    const open = () => undefined;
    defineScreen('User Details', { open });
    defineElement('User Information', {
      Username: locator,
      'Full name': locator,
      'Email address': locator,
    });
    const own = () => undefined;
    const other = () => undefined;
    defineCondition('Viewing your own profile', own);
    defineCondition("Viewing another user's profile", other);

    const input = spec(USER_DETAILS);
    const result = matchSpecs([input], getRegistry());

    expect(result.missing).toEqual([]);
    expect(result.unused).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.documents).toHaveLength(1);
    const [document] = result.documents;
    expect(document?.spec).toBe(input);
    expect(document?.uri).toBe('specs/test.sanmaime');

    const [screen] = document?.screens ?? [];
    expect(screen?.name).toBe('User Details');
    expect(screen?.file).toBe('/project/specs/test.sanmaime');
    expect(screen?.location).toEqual({ line: 1, column: 1 });
    expect(screen?.definition?.open).toBe(open);

    const [element] = screen?.elements ?? [];
    expect(element?.name).toBe('User Information');
    expect(element?.definition?.targets.size).toBe(3);
    expect(element?.unconditional).toEqual([]);
    expect(element?.conditions.map((c) => [c.name, c.definition?.fn])).toEqual([
      ['Viewing your own profile', own],
      ["Viewing another user's profile", other],
    ]);
    expect(element?.conditions[1]?.expectations).toEqual([
      {
        kind: 'show',
        target: 'Username',
        keyword: 'Show',
        viaAnd: false,
        targetDefined: true,
        location: { line: 11, column: 5 },
      },
      {
        kind: 'hide',
        target: 'Full name',
        keyword: 'Hide',
        viaAnd: false,
        targetDefined: true,
        location: { line: 12, column: 5 },
      },
      {
        kind: 'hide',
        target: 'Email address',
        keyword: 'And',
        viaAnd: true,
        targetDefined: true,
        location: { line: 13, column: 5 },
      },
    ]);
  });

  it('reports a missing screen with severity info and still resolves its elements', () => {
    defineElement('User Information', {
      Username: locator,
      'Full name': locator,
      'Email address': locator,
    });
    defineCondition('Viewing your own profile', () => undefined);
    defineCondition("Viewing another user's profile", () => undefined);

    const result = matchSpecs([spec(USER_DETAILS)], getRegistry());
    expect(result.missing).toEqual([
      {
        kind: 'screen',
        severity: 'info',
        screen: 'User Details',
        name: 'User Details',
        file: '/project/specs/test.sanmaime',
        location: { line: 1, column: 1 },
      },
    ]);
    expect(result.documents[0]?.screens[0]?.definition).toBeUndefined();
    expect(result.documents[0]?.screens[0]?.elements[0]?.definition).toBeDefined();
  });

  it('reports a missing element once, without reporting its targets or conditions targets', () => {
    defineCondition('Viewing your own profile', () => undefined);
    defineCondition("Viewing another user's profile", () => undefined);
    defineScreen('User Details');

    const result = matchSpecs([spec(USER_DETAILS)], getRegistry());
    expect(result.missing).toEqual([
      {
        kind: 'element',
        severity: 'error',
        screen: 'User Details',
        element: 'User Information',
        name: 'User Information',
        file: '/project/specs/test.sanmaime',
        location: { line: 3, column: 3 },
      },
    ]);
    const element = result.documents[0]?.screens[0]?.elements[0];
    expect(element?.definition).toBeUndefined();
    expect(
      element?.conditions[0]?.expectations.every((e) => 'targetDefined' in e && !e.targetDefined),
    ).toBe(true);
  });

  it('reports each missing target once per file, at its first use', () => {
    defineScreen('User Details');
    defineElement('User Information', { Username: locator });
    defineCondition('Viewing your own profile', () => undefined);
    defineCondition("Viewing another user's profile", () => undefined);

    const result = matchSpecs([spec(USER_DETAILS)], getRegistry());
    expect(result.missing.map((m) => [m.kind, m.element, m.name, m.location.line])).toEqual([
      ['target', 'User Information', 'Full name', 7],
      ['target', 'User Information', 'Email address', 8],
    ]);
    const expectations = result.documents[0]?.screens[0]?.elements[0]?.conditions[0]?.expectations;
    expect(expectations?.map((e) => 'targetDefined' in e && e.targetDefined)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('reports a missing self locator for Enable / Disable, and missing conditions', () => {
    defineScreen('Login');
    defineElement('Login Button', { Label: locator });
    defineCondition('Input is valid', () => undefined);

    const source = `Screen: Login
  Element: Login Button
    Show: Label
    When: Input is valid
    Enable
    When: Input is invalid
    Disable
`;
    const input = spec(source);
    expect(input.diagnostics).toEqual([]);
    const result = matchSpecs([input], getRegistry());
    expect(result.missing.map((m) => [m.kind, m.severity, m.name, m.location])).toEqual([
      ['self', 'error', 'Login Button', { line: 5, column: 5 }],
      ['condition', 'error', 'Input is invalid', { line: 6, column: 5 }],
    ]);
    const element = result.documents[0]?.screens[0]?.elements[0];
    expect(element?.conditions[0]?.expectations).toEqual([
      { kind: 'enable', keyword: 'Enable', selfDefined: false, location: { line: 5, column: 5 } },
    ]);
    expect(element?.conditions[1]?.definition).toBeUndefined();
  });

  it('resolves screen-scoped conditions before global ones', () => {
    const scoped = () => undefined;
    const global = () => undefined;
    defineElement('Login Button', locator);
    defineCondition('Input is invalid', global);
    defineCondition('Input is invalid', scoped, { screen: 'Login' });

    const source = (screen: string) => `Screen: ${screen}
  Element: Login Button
    When: Input is invalid
    Disable
`;
    const result = matchSpecs([spec(source('Login')), spec(source('Signup'))], getRegistry());
    const fnOf = (index: number) =>
      result.documents[index]?.screens[0]?.elements[0]?.conditions[0]?.definition?.fn;
    expect(fnOf(0)).toBe(scoped);
    expect(fnOf(1)).toBe(global);
    expect(result.missing.filter((m) => m.severity === 'error')).toEqual([]);
    expect(result.unused).toEqual([]);
  });

  it('does not use a condition scoped to another screen', () => {
    defineScreen('Signup');
    defineElement('Login Button', locator);
    defineCondition('Input is invalid', () => undefined, { screen: 'Login' });

    const result = matchSpecs(
      [spec('Screen: Signup\n  Element: Login Button\n    When: Input is invalid\n    Disable\n')],
      getRegistry(),
    );
    expect(result.missing.map((m) => [m.kind, m.screen, m.name])).toEqual([
      ['condition', 'Signup', 'Input is invalid'],
    ]);
    expect(result.unused.map((u) => [u.kind, u.name, u.screen])).toEqual([
      ['condition', 'Input is invalid', 'Login'],
    ]);
  });

  it('reports one missing condition per screen and file even when used by several elements', () => {
    defineScreen('S');
    defineElement('A', locator);
    defineElement('B', locator);
    const source = `Screen: S
  Element: A
    When: C
    Enable
  Element: B
    When: C
    Disable
`;
    const result = matchSpecs(
      [spec(source, '/project/one.sanmaime'), spec(source, '/project/two.sanmaime')],
      getRegistry(),
    );
    expect(result.missing.map((m) => [m.kind, m.element, m.file])).toEqual([
      ['condition', 'A', '/project/one.sanmaime'],
      ['condition', 'B', '/project/one.sanmaime'],
      ['condition', 'A', '/project/two.sanmaime'],
      ['condition', 'B', '/project/two.sanmaime'],
    ]);
  });

  it('ignores surrounding whitespace in definition names and target names', () => {
    defineScreen('  User Details ');
    defineElement('\tUser Information ', {
      ' Username': locator,
      'Full name  ': locator,
      'Email address': locator,
    });
    defineCondition(' Viewing your own profile ', () => undefined);
    defineCondition("Viewing another user's profile", () => undefined, {
      screen: ' User Details ',
    });

    const result = matchSpecs([spec(USER_DETAILS)], getRegistry());
    expect(result.missing).toEqual([]);
    expect(result.unused).toEqual([]);
    const element = result.documents[0]?.screens[0]?.elements[0];
    expect(element?.definition?.name).toBe('\tUser Information ');
    expect(element?.conditions.every((c) => c.definition !== undefined)).toBe(true);
  });

  it('is case-sensitive and otherwise exact', () => {
    defineScreen('user details');
    defineElement('User information', { username: locator });
    const result = matchSpecs(
      [spec('Screen: User Details\n  Element: User Information\n    Show: Username\n')],
      getRegistry(),
    );
    expect(result.missing.map((m) => m.kind)).toEqual(['screen', 'element']);
    expect(result.unused.map((u) => [u.kind, u.name])).toEqual([
      ['screen', 'user details'],
      ['element', 'User information'],
    ]);
  });

  it('reports unused screens, elements, targets and conditions with their source', () => {
    defineScreen('User Details');
    defineScreen('Settings');
    defineElement('User Information', {
      Username: locator,
      'Full name': locator,
      'Email address': locator,
      Avatar: locator,
    });
    defineElement('Footer', { Copyright: locator });
    defineCondition('Viewing your own profile', () => undefined);
    defineCondition("Viewing another user's profile", () => undefined);
    defineCondition('Logged out', () => undefined);
    defineCondition('Logged out', () => undefined, { screen: 'Settings' });

    const result = matchSpecs([spec(USER_DETAILS)], getRegistry());
    expect(result.unused.map(({ source: _source, ...rest }) => rest)).toEqual([
      { kind: 'screen', name: 'Settings' },
      { kind: 'target', name: 'Avatar', element: 'User Information' },
      { kind: 'element', name: 'Footer' },
      { kind: 'condition', name: 'Logged out' },
      { kind: 'condition', name: 'Logged out', screen: 'Settings' },
    ]);
    expect(result.unused[0]?.source?.file).toBe(import.meta.filename);
  });

  it('skips specs with error diagnostics', () => {
    defineScreen('S');
    const broken = spec('Screen: S\n  Element: E\n    And: X\n');
    const result = matchSpecs([broken], getRegistry());
    expect(result.skipped).toEqual([broken]);
    expect(result.documents).toEqual([]);
    expect(result.missing).toEqual([]);
    // Definitions are not counted as used by a skipped spec.
    expect(result.unused.map((u) => u.name)).toEqual(['S']);
  });

  it('keeps tags on screens and elements', () => {
    defineScreen('S');
    defineElement('E', { X: locator });
    const result = matchSpecs(
      [spec('@smoke\nScreen: S\n  @slow\n  Element: E\n    Show: X\n')],
      getRegistry(),
    );
    const screen = result.documents[0]?.screens[0];
    expect(screen?.tags.map((t) => t.name)).toEqual(['@smoke']);
    expect(screen?.elements[0]?.tags.map((t) => t.name)).toEqual(['@slow']);
  });

  it('resolves Background: and And when: conditions (v0.2)', () => {
    defineScreen('Cart');
    defineElement('Checkout', ({ page }: { page: Page }) => page.locator('b'), {});
    const loggedIn = () => undefined;
    const items = () => undefined;
    const address = () => undefined;
    defineCondition('Logged in', loggedIn);
    defineCondition('Has items', items);
    defineCondition('Address set', address, { screen: 'Cart' });
    defineCondition('Unused', () => undefined);
    const result = matchSpecs(
      [
        spec(
          'Screen: Cart\nBackground: Logged in\nElement: Checkout\n' +
            'When: Has items\nAnd when: Address set\nEnable\n',
        ),
      ],
      getRegistry(),
    );
    expect(result.missing).toEqual([]);
    expect(result.unused.map((u) => u.name)).toEqual(['Unused']);
    const screen = result.documents[0]?.screens[0];
    expect(screen?.background.map((ref) => [ref.name, ref.location])).toEqual([
      ['Logged in', { line: 2, column: 1 }],
    ]);
    expect(screen?.background[0]?.definition?.fn).toBe(loggedIn);
    const block = screen?.elements[0]?.conditions[0];
    expect(block?.name).toBe('Has items');
    expect(block?.title).toBe('Has items and Address set');
    expect(block?.definition?.fn).toBe(items);
    expect(block?.conditions.map((c) => [c.name, c.location.line, c.definition?.fn])).toEqual([
      ['Has items', 4, items],
      ['Address set', 5, address],
    ]);
  });

  it('reports missing Background: and And when: conditions', () => {
    defineElement('Checkout', ({ page }: { page: Page }) => page.locator('b'), {});
    defineCondition('Has items', () => undefined);
    const result = matchSpecs(
      [
        spec(
          'Screen: Cart\n  Background: Logged in\n  Element: Checkout\n' +
            '    When: Has items\n    And when: Address set\n    Enable\n',
        ),
      ],
      getRegistry(),
    );
    expect(result.missing.filter((m) => m.severity === 'error')).toEqual([
      {
        kind: 'condition',
        severity: 'error',
        screen: 'Cart',
        name: 'Logged in',
        file: '/project/specs/test.sanmaime',
        location: { line: 2, column: 3 },
      },
      {
        kind: 'condition',
        severity: 'error',
        screen: 'Cart',
        element: 'Checkout',
        name: 'Address set',
        file: '/project/specs/test.sanmaime',
        location: { line: 5, column: 5 },
      },
    ]);
    const block = result.documents[0]?.screens[0]?.elements[0]?.conditions[0];
    expect(block?.definition).toBeDefined();
    expect(block?.conditions[1]?.definition).toBeUndefined();
  });

  it('--allow-missing drops the blocks of a missing And when: and the screens of a missing Background:', () => {
    defineElement('B', ({ page }: { page: Page }) => page.locator('b'), {});
    defineCondition('Has items', () => undefined);
    const result = matchSpecs(
      [
        spec(
          'Screen: Cart\nElement: B\nWhen: Nope\nEnable\nWhen: Has items\nAnd when: Nope\nDisable\n' +
            'When: Has items\nDisable\n' +
            'Screen: Other\nBackground: Nope\nElement: B\nEnable\n',
        ),
      ],
      getRegistry(),
    );
    const [doc] = result.documents;
    if (!doc) throw new Error('not resolved');
    expect(listTests(withoutMissingDefinitions(doc)).map((t) => t.titlePath.join(' > '))).toEqual([
      'Screen: Cart > Element: B > When: Has items',
    ]);
    expect(formatMissing(result.missing, { cwd: '/project', format: 'compact' })).toEqual([
      'specs/test.sanmaime:3:1: error: Condition "When: Nope" (Screen "Cart", Element "B") has no definition (defineCondition).',
      'specs/test.sanmaime:11:1: error: Condition "Background: Nope" (Screen "Other") has no definition (defineCondition).',
    ]);
  });
});
