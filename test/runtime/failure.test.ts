import type { Locator } from '@playwright/test';
import { describe, expect, it } from 'vitest';
import {
  createExpectationError,
  describeExpected,
  formatExpectationFailure,
  NimaimeExpectationError,
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

function playwrightError(): Error {
  const error = new Error("expect(locator).toBeDisabled() failed\n\nLocator: getByRole('button')");
  error.stack = `Error: ${error.message}\n    at assert (/app/runtime.js:1:2)\n    at run (/app/runtime.js:3:4)`;
  return error;
}

describe('describeExpected', () => {
  it('describes each kind', () => {
    expect(describeExpected('show', 'Username')).toBe('Username is shown');
    expect(describeExpected('hide', 'Full name')).toBe('Full name is hidden');
    expect(describeExpected('enable', undefined)).toBe('enabled');
    expect(describeExpected('disable', undefined)).toBe('disabled');
  });
});

describe('formatExpectationFailure', () => {
  it('starts with the Sanmaime header, then the original message', () => {
    expect(formatExpectationFailure(ctx, playwrightError())).toBe(
      [
        'Screen: Login',
        'Element: Login Button',
        'When: Input is invalid',
        'Expected: disabled',
        'Actual: enabled',
        'Location: specs/login.sanmaime:14',
        '',
        'expect(locator).toBeDisabled() failed',
        '',
        "Locator: getByRole('button')",
      ].join('\n'),
    );
  });

  it('omits unknown parts', () => {
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
    ).toBe('Element: Login Button\nExpected: Username is shown\nActual: unknown\n\nboom');
  });
});

describe('createExpectationError', () => {
  it('keeps the context, the original error and its frames', () => {
    const original = playwrightError();
    const error = createExpectationError(ctx, original);
    expect(error).toBeInstanceOf(NimaimeExpectationError);
    expect(error.name).toBe('NimaimeExpectationError');
    expect(error.sanmaime).toBe(ctx);
    expect(error.original).toBe(original);
    expect(error.cause).toBeUndefined();
    expect(error.stack).toBe(
      `NimaimeExpectationError: ${error.message}\n` +
        '    at assert (/app/runtime.js:1:2)\n    at run (/app/runtime.js:3:4)',
    );
  });

  it('puts the .sanmaime line on top of the stack', () => {
    const error = createExpectationError(ctx, playwrightError(), {
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

  it('works with non-Error values', () => {
    const error = createExpectationError(ctx, 'boom');
    expect(error.message.endsWith('\n\nboom')).toBe(true);
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
