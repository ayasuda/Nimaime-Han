import { describe, expect, it } from 'vitest';
import { parseSanmaimeHeader, stripAnsi } from '../../src/reporter/header';

describe('parseSanmaimeHeader', () => {
  const message = [
    'Screen: Login',
    'Element: Login Button',
    'When: Input is invalid',
    'Expected: disabled',
    'Actual: enabled (after 5000ms)',
    'Location: specs/login.sanmaime:14',
    '',
    'Details:',
    '  expect(locator).toBeDisabled() failed',
    '',
    '  Locator: x',
  ].join('\n');

  it('splits the header from Playwright’s message', () => {
    expect(parseSanmaimeHeader(message)).toEqual({
      header: {
        screen: 'Login',
        element: 'Login Button',
        when: 'Input is invalid',
        expected: 'disabled',
        actual: 'enabled',
        location: 'specs/login.sanmaime:14',
      },
      body: 'expect(locator).toBeDisabled() failed\n\nLocator: x',
    });
  });

  it('accepts the error name Playwright puts in front of the message, and ANSI codes', () => {
    const parsed = parseSanmaimeHeader(`NimaimeExpectationError: \u001b[31m${message}\u001b[39m`);
    expect(parsed.header?.screen).toBe('Login');
  });

  it('leaves out absent fields', () => {
    expect(
      parseSanmaimeHeader(
        'Element: E\nExpected: Username is shown\nActual: unknown\n\nDetails:\n  boom',
      ),
    ).toEqual({ header: { element: 'E', expected: 'Username is shown' }, body: 'boom' });
  });

  it('returns the whole message when there is no header', () => {
    expect(parseSanmaimeHeader('Error: \u001b[2mTimeout 1000ms exceeded.\u001b[22m')).toEqual({
      header: undefined,
      body: 'Error: Timeout 1000ms exceeded.',
    });
    // `Screen:` alone (e.g. a NimaimeRuntimeError) is not an expectation header.
    expect(parseSanmaimeHeader('Screen: Login\nboom').header).toBeUndefined();
  });

  it('stripAnsi removes colour codes', () => {
    expect(stripAnsi('\u001b[2mdim\u001b[22m')).toBe('dim');
  });
});
