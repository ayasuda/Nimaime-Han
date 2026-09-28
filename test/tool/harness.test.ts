/** The pure helpers of the harness (the cases exercise the rest). */
import { describe, expect, it } from 'vitest';
import { normalizeOutput, stripAnsi, summarizeJsonReport } from './harness';

describe('normalizeOutput', () => {
  it('normalizes line endings, the project path and durations', () => {
    expect(
      normalizeOutput('at /tmp/p/specs/a.sanmaime:1\r\n1 passed (3.4s) (512ms) (1.2m)\n', '/tmp/p'),
    ).toBe('at <project>/specs/a.sanmaime:1\n1 passed (<duration>) (<duration>) (<duration>)\n');
  });

  it('leaves other parentheses alone', () => {
    expect(normalizeOutput('Generated 1 spec file (2 tests) (after 500ms)')).toBe(
      'Generated 1 spec file (2 tests) (after 500ms)',
    );
  });
});

describe('stripAnsi', () => {
  it('removes colour codes', () => {
    expect(stripAnsi('\u001b[2mexpect(\u001b[22m\u001b[31mlocator\u001b[39m')).toBe(
      'expect(locator',
    );
  });
});

describe('summarizeJsonReport', () => {
  it('reads the counts and flattens the tests below the file suites', () => {
    const report = {
      stats: { expected: 1, unexpected: 1, skipped: 1, flaky: 0 },
      suites: [
        {
          title: 'specs/login.spec.ts',
          suites: [
            {
              title: 'Screen: Login',
              suites: [
                {
                  title: 'Element: Login Button',
                  specs: [
                    {
                      title: 'When: Input is valid',
                      file: 'specs/login.spec.ts',
                      tests: [
                        {
                          projectName: 'chromium',
                          status: 'unexpected',
                          results: [
                            {
                              status: 'failed',
                              errors: [{ message: '\u001b[31mfirst\u001b[39m' }],
                            },
                            { status: 'failed', errors: [{ message: 'Screen: Login' }] },
                          ],
                        },
                      ],
                    },
                    {
                      title: 'When: Input is invalid',
                      file: 'specs/login.spec.ts',
                      tests: [{ projectName: 'chromium', status: 'skipped', results: [] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(summarizeJsonReport(report)).toEqual({
      stats: { passed: 1, failed: 1, skipped: 1, flaky: 0 },
      tests: [
        {
          title: 'Screen: Login > Element: Login Button > When: Input is valid',
          project: 'chromium',
          file: 'specs/login.spec.ts',
          status: 'failed',
          errors: ['Screen: Login'],
        },
        {
          title: 'Screen: Login > Element: Login Button > When: Input is invalid',
          project: 'chromium',
          file: 'specs/login.spec.ts',
          status: 'skipped',
          errors: [],
        },
      ],
    });
  });
});
