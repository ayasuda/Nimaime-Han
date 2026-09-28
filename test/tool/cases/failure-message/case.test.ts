import { expect, it } from 'vitest';
import { runCase } from '../../harness';

const HEADER = [
  'Screen: Login',
  'Element: Login Button',
  'When: Input is valid',
  'Expected: disabled',
  /Actual: enabled \(after \d+ms\)/,
  'Location: specs/login.sanmaime:6',
];

it('reports a failing expectation with the Sanmaime header', async () => {
  const { playwright } = await runCase(import.meta.dirname, {
    generated: ['.sanmaime-gen/specs/login.spec.ts'],
    playwright: {
      // Playwright's own failure output (line reporter), then the Sanmaime tree.
      reporters: ['line', 'nimaime-han/reporter'],
      passed: 1,
      failed: 1,
      stdout: [
        // Playwright's output: the error message starts with the Sanmaime header ...
        `NimaimeExpectationError: ${HEADER.slice(0, 4).join('\n    ')}`,
        ...HEADER,
        // ... followed by Playwright's assertion, and a code frame of the .sanmaime file.
        'expect(locator).toBeDisabled() failed',
        '> 6 |     Disable',
        // The reporter's ✗ block.
        [
          '  ✗ Element: Login Button',
          '    When: Input is valid',
          '      ✗ disabled',
          '        Expected: disabled',
          '        Actual: enabled',
          '        Location: specs/login.sanmaime:6',
          '',
          '    When: Input is empty',
          '      ✓ disabled',
        ].join('\n'),
        '1 screen, 1 element, 2 expectations: 1 passed, 1 failed, 0 skipped',
      ],
    },
  });

  const failed = playwright?.tests.filter((test) => test.status !== 'passed') ?? [];
  expect(failed.map((test) => test.title)).toEqual([
    'Screen: Login > Element: Login Button > When: Input is valid',
  ]);
  const message = failed[0]?.errors.join('\n') ?? '';
  expect(message.split('\n').slice(0, 7)).toEqual([
    'NimaimeExpectationError: Screen: Login',
    'Element: Login Button',
    'When: Input is valid',
    'Expected: disabled',
    expect.stringMatching(/^Actual: enabled \(after \d+ms\)$/),
    'Location: specs/login.sanmaime:6',
    '',
  ]);
  expect(message).toContain('Details:\n  expect(locator).toBeDisabled() failed');
});
