import type { Locator } from '@playwright/test';
import { describe, expect, it } from 'vitest';
import {
  createExpectationError,
  describeExpected,
  describeLocator,
  detectTimeout,
  formatActual,
  formatExpectationFailure,
  formatFailureDetails,
  formatFailureHeader,
  NimaimeExpectationError,
  parseExpectationFailure,
  probeActual,
  type ExpectationFailureContext,
} from '../../src/runtime/index';

const ctx: ExpectationFailureContext = {
  screen: 'Login',
  element: 'Login Button',
  condition: 'Input is invalid',
  kind: 'disable',
  target: undefined,
  file: 'specs/login.sanmaime',
  location: { line: 14, column: 5 },
  expected: 'disabled',
  actual: 'enabled',
};

/** A Playwright 1.5x-shaped web-first assertion error (timed out). */
function timeoutError(matcher = 'toBeDisabled', timeout = 5000): Error {
  const error = new Error(
    [
      `expect(locator).${matcher}() failed`,
      '',
      "Locator:  getByTestId('login-button')",
      'Expected: disabled',
      'Received: enabled',
      `Timeout:  ${String(timeout)}ms`,
      '',
      'Call log:',
      `  - Expect "${matcher}" with timeout ${String(timeout)}ms`,
    ].join('\n'),
  );
  error.stack = `Error: ${error.message}\n    at assert (/app/runtime.js:1:2)\n    at run (/app/runtime.js:3:4)`;
  return error;
}

/** A strict mode violation (fails at once, no `Timeout:` line). */
function strictError(): Error {
  return new Error(
    [
      'expect(locator).toBeDisabled() failed',
      '',
      "Locator: getByTestId('login-button')",
      'Expected: disabled',
      "Error: strict mode violation: getByTestId('login-button') resolved to 2 elements:",
      '',
      'Call log:',
      '  - Expect "toBeDisabled" with timeout 5000ms',
    ].join('\n'),
  );
}

describe('describeExpected', () => {
  it('describes each kind', () => {
    expect(describeExpected('show', 'Username')).toBe('Username is shown');
    expect(describeExpected('hide', 'Full name')).toBe('Full name is hidden');
    expect(describeExpected('enable', undefined)).toBe('enabled');
    expect(describeExpected('disable', undefined)).toBe('disabled');
  });
});

describe('detectTimeout', () => {
  it('reads the timeout of a timed-out assertion', () => {
    expect(detectTimeout(timeoutError('toBeVisible', 1000))).toBe(1000);
    expect(detectTimeout('Timed out 5000ms waiting for expect(locator).toBeVisible()')).toBe(5000);
    expect(detectTimeout('\u001b[2mTimeout: \u001b[22m 750ms')).toBe(750);
  });

  it('is undefined for other failures', () => {
    expect(detectTimeout(strictError())).toBeUndefined();
    expect(detectTimeout('boom')).toBeUndefined();
    expect(detectTimeout(undefined)).toBeUndefined();
  });
});

describe('formatActual', () => {
  it('adds the timeout', () => {
    expect(formatActual('hidden', 5000)).toBe('hidden (after 5000ms)');
    expect(formatActual('hidden (not found)', 5000)).toBe('hidden (not found, after 5000ms)');
    expect(formatActual('2 matching elements (expected exactly one)', 1000)).toBe(
      '2 matching elements (expected exactly one, after 1000ms)',
    );
  });

  it('keeps the state alone without a timeout, and says unknown when not probed', () => {
    expect(formatActual('enabled', undefined)).toBe('enabled');
    expect(formatActual(undefined, 5000)).toBe('unknown');
    expect(formatActual(undefined, undefined)).toBe('unknown');
  });
});

describe('describeLocator', () => {
  it("uses the locator's description", () => {
    expect(describeLocator({ toString: () => "getByRole('button')" })).toBe("getByRole('button')");
  });

  it('ignores objects without a description, and never throws', () => {
    expect(describeLocator({})).toBeUndefined();
    expect(describeLocator({ toString: () => '' })).toBeUndefined();
    expect(describeLocator({ toString: () => 'Locator@abc' })).toBeUndefined();
    expect(
      describeLocator({
        toString: () => {
          throw new Error('no');
        },
      }),
    ).toBeUndefined();
  });
});

describe('formatFailureHeader', () => {
  it('Disable in a condition (the README example)', () => {
    expect(formatFailureHeader(ctx)).toBe(
      [
        'Screen: Login',
        'Element: Login Button',
        'When: Input is invalid',
        'Expected: disabled',
        'Actual: enabled',
        'Location: specs/login.sanmaime:14',
      ].join('\n'),
    );
  });

  it('Enable', () => {
    expect(
      formatFailureHeader({ ...ctx, kind: 'enable', expected: 'enabled', actual: 'disabled' }),
    ).toContain('\nExpected: enabled\nActual: disabled\n');
  });

  it('Show in the base state has no When line', () => {
    expect(
      formatFailureHeader({
        ...ctx,
        element: 'User Information',
        condition: undefined,
        kind: 'show',
        target: 'Username',
        expected: 'Username is shown',
        actual: 'hidden',
        timeout: 5000,
        location: { line: 20, column: 5 },
      }),
    ).toBe(
      [
        'Screen: Login',
        'Element: User Information',
        'Expected: Username is shown',
        'Actual: hidden (after 5000ms)',
        'Location: specs/login.sanmaime:20',
      ].join('\n'),
    );
  });

  it('Hide', () => {
    expect(
      formatFailureHeader({
        ...ctx,
        kind: 'hide',
        target: 'Error message',
        expected: 'Error message is hidden',
        actual: 'shown',
      }),
    ).toContain('\nExpected: Error message is hidden\nActual: shown\n');
  });

  it('omits the screen and the location when unknown, and the line without a position', () => {
    const header = formatFailureHeader({
      ...ctx,
      screen: undefined,
      file: undefined,
      actual: undefined,
    });
    expect(header).toBe(
      'Element: Login Button\nWhen: Input is invalid\nExpected: disabled\nActual: unknown',
    );
    expect(formatFailureHeader({ ...ctx, location: undefined })).toMatch(
      /\nLocation: specs\/login\.sanmaime$/,
    );
  });
});

describe('formatFailureDetails', () => {
  it("keeps Playwright's message, which already names the locator", () => {
    const original = timeoutError();
    expect(formatFailureDetails({ ...ctx, locator: "getByTestId('x')" }, original)).toBe(
      original.message,
    );
  });

  it('adds the locator when the message does not name it', () => {
    expect(formatFailureDetails({ ...ctx, locator: "getByTestId('x')" }, 'boom')).toBe(
      "boom\n\nLocator: getByTestId('x')",
    );
    expect(formatFailureDetails(ctx, 'boom')).toBe('boom');
  });
});

describe('formatExpectationFailure', () => {
  it('is the header, a blank line, then the original message indented under Details:', () => {
    expect(formatExpectationFailure(ctx, timeoutError())).toBe(
      [
        'Screen: Login',
        'Element: Login Button',
        'When: Input is invalid',
        'Expected: disabled',
        'Actual: enabled',
        'Location: specs/login.sanmaime:14',
        '',
        'Details:',
        '  expect(locator).toBeDisabled() failed',
        '',
        "  Locator:  getByTestId('login-button')",
        '  Expected: disabled',
        '  Received: enabled',
        '  Timeout:  5000ms',
        '',
        '  Call log:',
        '    - Expect "toBeDisabled" with timeout 5000ms',
      ].join('\n'),
    );
  });

  it('works with non-Error values', () => {
    expect(
      formatExpectationFailure(
        {
          ...ctx,
          screen: undefined,
          condition: undefined,
          file: undefined,
          kind: 'show',
          target: 'Username',
          expected: 'Username is shown',
          actual: undefined,
        },
        'boom',
      ),
    ).toBe(
      'Element: Login Button\nExpected: Username is shown\nActual: unknown\n\nDetails:\n  boom',
    );
  });
});

describe('createExpectationError', () => {
  it('keeps the context, the original error and its frames', () => {
    const original = timeoutError();
    const error = createExpectationError(ctx, original);
    expect(error).toBeInstanceOf(NimaimeExpectationError);
    expect(error.name).toBe('NimaimeExpectationError');
    expect(error.sanmaime).toEqual({ ...ctx, timeout: 5000 });
    expect(error.original).toBe(original);
    expect(error.cause).toBeUndefined();
    expect(error.stack).toBe(
      `NimaimeExpectationError: ${error.message}\n` +
        '    at assert (/app/runtime.js:1:2)\n    at run (/app/runtime.js:3:4)',
    );
  });

  it('reports the timeout of a timed-out assertion in Actual', () => {
    const error = createExpectationError(ctx, timeoutError());
    expect(error.message).toContain('\nActual: enabled (after 5000ms)\n');
  });

  it('keeps an explicit timeout', () => {
    const error = createExpectationError({ ...ctx, timeout: 42 }, timeoutError());
    expect(error.sanmaime.timeout).toBe(42);
  });

  it('keeps the multiple-match actual of a strict mode violation (no timeout)', () => {
    const error = createExpectationError(
      { ...ctx, actual: '2 matching elements (expected exactly one)' },
      strictError(),
    );
    expect(error.sanmaime.timeout).toBeUndefined();
    expect(error.message).toContain('\nActual: 2 matching elements (expected exactly one)\n');
  });

  it('puts the .sanmaime line on top of the stack', () => {
    const error = createExpectationError(ctx, timeoutError(), {
      title: 'Disable',
      file: '/app/specs/login.sanmaime',
      line: 14,
      column: 5,
    });
    expect(error.stack?.split('\n    at ').slice(1)).toEqual([
      'Disable (/app/specs/login.sanmaime:14:5)',
      'assert (/app/runtime.js:1:2)',
      'run (/app/runtime.js:3:4)',
    ]);
  });

  it('has no message line that Playwright would parse as a stack frame', () => {
    const error = createExpectationError(ctx, timeoutError());
    for (const line of error.message.split('\n')) {
      expect(line).not.toMatch(/^\s+at /);
      expect(line).not.toMatch(/:\d+:\d+\)?$/);
    }
  });

  it('works with non-Error values', () => {
    const error = createExpectationError(ctx, 'boom');
    expect(error.message.endsWith('\n\nDetails:\n  boom')).toBe(true);
    expect(error.stack).toBeDefined();
  });
});

describe('toJSON', () => {
  it('exposes the structured failure', () => {
    const original = timeoutError();
    const error = createExpectationError(
      { ...ctx, locator: "getByTestId('login-button')" },
      original,
    );
    expect(error.toJSON()).toEqual({
      name: 'NimaimeExpectationError',
      screen: 'Login',
      element: 'Login Button',
      condition: 'Input is invalid',
      expectation: { kind: 'disable', target: null },
      expected: 'disabled',
      actual: 'enabled',
      timeout: 5000,
      locator: "getByTestId('login-button')",
      file: 'specs/login.sanmaime',
      line: 14,
      column: 5,
      header: [
        'Screen: Login',
        'Element: Login Button',
        'When: Input is invalid',
        'Expected: disabled',
        'Actual: enabled (after 5000ms)',
        'Location: specs/login.sanmaime:14',
      ].join('\n'),
      details: original.message,
      message: error.message,
    });
    expect(JSON.parse(JSON.stringify(error))).toEqual(error.toJSON());
  });

  it('uses null for unknown values', () => {
    const error = createExpectationError(
      {
        ...ctx,
        screen: undefined,
        condition: undefined,
        kind: 'show',
        target: 'Username',
        expected: 'Username is shown',
        actual: undefined,
        file: undefined,
        location: undefined,
      },
      'boom',
    );
    expect(error.toJSON()).toMatchObject({
      screen: null,
      condition: null,
      expectation: { kind: 'show', target: 'Username' },
      actual: null,
      timeout: null,
      locator: null,
      file: null,
      line: null,
      column: null,
      details: 'boom',
    });
  });
});

describe('parseExpectationFailure', () => {
  it('recovers what toJSON() gives from the message a reporter receives', () => {
    const error = createExpectationError(ctx, timeoutError());
    const parsed = parseExpectationFailure(`NimaimeExpectationError: ${error.message}`);
    expect(parsed).toEqual({ ...error.toJSON(), column: null, locator: null });
  });

  it('parses Show / Hide / Enable, missing parts and ANSI colors', () => {
    const show = createExpectationError(
      {
        ...ctx,
        screen: undefined,
        condition: undefined,
        kind: 'show',
        target: 'Username',
        expected: 'Username is shown',
        actual: 'hidden (not found)',
        file: undefined,
      },
      timeoutError('toBeVisible', 1000),
    );
    expect(parseExpectationFailure(`\u001b[31m${show.message}\u001b[39m`)).toMatchObject({
      screen: null,
      condition: null,
      expectation: { kind: 'show', target: 'Username' },
      actual: 'hidden (not found)',
      timeout: 1000,
      file: null,
      line: null,
    });
    const hide = createExpectationError(
      { ...ctx, kind: 'hide', target: 'Error message', expected: 'Error message is hidden' },
      'boom',
    );
    expect(parseExpectationFailure(hide.message)).toMatchObject({
      expectation: { kind: 'hide', target: 'Error message' },
      actual: 'enabled',
      timeout: null,
      details: 'boom',
    });
    const enable = createExpectationError(
      { ...ctx, kind: 'enable', expected: 'enabled', actual: undefined, location: undefined },
      'boom',
    );
    expect(parseExpectationFailure(enable.message)).toMatchObject({
      expectation: { kind: 'enable', target: null },
      actual: null,
      file: 'specs/login.sanmaime',
      line: null,
    });
  });

  it('rejects other messages', () => {
    expect(parseExpectationFailure('expect(locator).toBeVisible() failed')).toBeUndefined();
    expect(
      parseExpectationFailure('Element: X\nExpected: visible\nActual: hidden'),
    ).toBeUndefined();
    expect(parseExpectationFailure('Element: X\nExpected: enabled')).toBeUndefined();
    expect(
      parseExpectationFailure('Element: X\nElement: Y\nExpected: enabled\nActual: enabled'),
    ).toBeUndefined();
    expect(parseExpectationFailure('Foo: X\nExpected: enabled\nActual: enabled')).toBeUndefined();
  });
});

function fakeLocator(state: { count: number; visible?: boolean; enabled?: boolean }): Locator {
  return {
    count: () => Promise.resolve(state.count),
    isVisible: () => Promise.resolve(state.visible ?? false),
    isEnabled: () =>
      state.enabled === undefined
        ? Promise.reject(new Error('not an element'))
        : Promise.resolve(state.enabled),
  } as unknown as Locator;
}

describe('probeActual', () => {
  it('observes visibility and enablement', async () => {
    expect(await probeActual('show', fakeLocator({ count: 1, visible: false }))).toBe('hidden');
    expect(await probeActual('hide', fakeLocator({ count: 1, visible: true }))).toBe('shown');
    expect(await probeActual('enable', fakeLocator({ count: 1, enabled: false }))).toBe('disabled');
    expect(await probeActual('disable', fakeLocator({ count: 1, enabled: true }))).toBe('enabled');
  });

  it('reports missing and ambiguous elements', async () => {
    expect(await probeActual('show', fakeLocator({ count: 0 }))).toBe('hidden (not found)');
    expect(await probeActual('enable', fakeLocator({ count: 0 }))).toBe('not found');
    expect(await probeActual('show', fakeLocator({ count: 3 }))).toBe(
      '3 matching elements (expected exactly one)',
    );
  });

  it('never throws', async () => {
    expect(await probeActual('enable', fakeLocator({ count: 1 }))).toBeUndefined();
  });
});
