import { describe, expect, it } from 'vitest';
import NimaimeReporter, {
  buildReport,
  countReport,
  defaultColors,
  formatDuration,
  renderReport,
  type NimaimeReporterOptions,
  type ReportTest,
} from '../../src/reporter/index';
import { CWD, fakeOutput, fakeSuite, fakeTest, sanmaimeError, step } from './fakes';

/** Runs the reporter over `tests` and returns what it printed. */
function report(
  tests: ReportTest[],
  options: NimaimeReporterOptions = {},
  result: { status: 'passed' | 'failed' | 'timedout' | 'interrupted'; duration: number } = {
    status: 'passed',
    duration: 1234,
  },
): string {
  const output = fakeOutput();
  const reporter = new NimaimeReporter({ colors: false, cwd: CWD, output, ...options });
  reporter.onBegin({}, fakeSuite(tests));
  for (const test of tests) reporter.onTestEnd(test);
  reporter.onEnd(result);
  return output.text;
}

const loginForm = fakeTest({
  path: ['Screen: Login', 'Element: Login Form', 'Always'],
  line: 10,
  steps: [
    step('Screen: Login', { line: 1 }),
    step('Show: Email address', { line: 4 }),
    step('Show: Password', { line: 5 }),
    step('Show: Login button', { line: 6 }),
  ],
});

const buttonValid = fakeTest({
  path: ['Screen: Login', 'Element: Login Button', 'When: Input is valid'],
  line: 20,
  steps: [step('Screen: Login'), step('When: Input is valid', { line: 9 }), step('Enable')],
});

const buttonInvalid = fakeTest({
  path: ['Screen: Login', 'Element: Login Button', 'When: Input is invalid'],
  line: 30,
  status: 'failed',
  steps: [
    step('Screen: Login'),
    step('When: Input is invalid', { line: 12 }),
    step('Disable', {
      line: 13,
      error: sanmaimeError({
        screen: 'Login',
        element: 'Login Button',
        when: 'Input is invalid',
        expected: 'disabled',
        actual: 'enabled',
        location: 'specs/login.sanmaime:13',
      }),
    }),
  ],
  errors: [{ message: 'NimaimeExpectationError: …' }],
});

describe('NimaimeReporter', () => {
  it('prints the README tree', () => {
    expect(report([loginForm, buttonValid, buttonInvalid])).toBe(
      [
        '',
        '✗ Screen: Login',
        '',
        '  ✓ Element: Login Form',
        '    ✓ Email address is shown',
        '    ✓ Password is shown',
        '    ✓ Login button is shown',
        '',
        '  ✗ Element: Login Button',
        '    When: Input is valid',
        '      ✓ enabled',
        '',
        '    When: Input is invalid',
        '      ✗ disabled',
        '        Expected: disabled',
        '        Actual: enabled',
        '        Location: specs/login.sanmaime:13',
        '',
        '1 screen, 2 elements, 5 expectations: 4 passed, 1 failed, 0 skipped (1.2s)',
        '',
      ].join('\n'),
    );
  });

  it('prints unconditional expectations before When: blocks, Hide / Disable wording', () => {
    const always = fakeTest({
      path: ['Screen: Login', 'Element: Login Button', 'base state'],
      line: 15,
      steps: [step('Disable'), step('Hide: Error message')],
    });
    expect(report([buttonValid, always])).toContain(
      [
        '  ✓ Element: Login Button',
        '    ✓ disabled',
        '    ✓ Error message is hidden',
        '',
        '    When: Input is valid',
        '      ✓ enabled',
        '',
      ].join('\n'),
    );
  });

  it('takes the condition name from the When: step, else from the test title', () => {
    const titled = fakeTest({
      path: ['Screen: S', 'Element: E', 'When: Input is valid (extra words)'],
      steps: [step('When: Input is valid'), step('Enable')],
    });
    const failedEarly = fakeTest({
      path: ['Screen: S', 'Element: F', 'When: Logged in'],
      status: 'timedOut',
      errors: [{ message: 'Test timeout of 30000ms exceeded.' }],
    });
    const out = report([titled, failedEarly]);
    expect(out).toContain('    When: Input is valid\n      ✓ enabled');
    expect(out).toContain(
      [
        '  ✗ Element: F',
        '    When: Logged in',
        '      ✗ Timed out',
        '        Error: Test timeout of 30000ms exceeded.',
      ].join('\n'),
    );
  });

  it('prints Background: under the screen and titles composed blocks (v0.2)', () => {
    const always = fakeTest({
      path: ['Screen: Cart', 'Element: Checkout', 'Always'],
      line: 10,
      steps: [
        step('Screen: Cart'),
        step('Background: Logged in'),
        step('Background: Cookies accepted'),
        step('Show: Total'),
      ],
    });
    const composed = fakeTest({
      path: ['Screen: Cart', 'Element: Checkout', 'When: Has items and Address set'],
      line: 20,
      steps: [
        step('Screen: Cart'),
        step('Background: Logged in'),
        step('Background: Cookies accepted'),
        step('When: Has items'),
        step('And when: Address set'),
        step('Enable'),
      ],
    });
    const failedCondition = fakeTest({
      path: ['Screen: Cart', 'Element: Coupon', 'When: Has items and Coupon applied'],
      line: 30,
      status: 'failed',
      steps: [
        step('Screen: Cart'),
        step('Background: Logged in'),
        step('When: Has items'),
        step('And when: Coupon applied', {
          line: 12,
          error: { message: 'Error: no coupon field' },
        }),
      ],
    });
    const out = report([always, composed, failedCondition]);
    expect(out).toContain(
      [
        '✗ Screen: Cart',
        '  Background: Logged in',
        '  Background: Cookies accepted',
        '',
        '  ✓ Element: Checkout',
        '    ✓ Total is shown',
        '',
        '    When: Has items and Address set',
        '      ✓ enabled',
        '',
        '  ✗ Element: Coupon',
        '    When: Has items and Coupon applied',
        '      ✗ And when: Coupon applied',
        '        Error: Error: no coupon field',
      ].join('\n'),
    );
  });

  it('prints an unconditional failure at 4 spaces and omits the expectations after it', () => {
    const test = fakeTest({
      path: ['Screen: Login', 'Element: User Information', 'Always'],
      status: 'failed',
      steps: [
        step('Show: Username'),
        step('Show: Full name', {
          line: 21,
          error: sanmaimeError({ expected: 'Full name is shown', actual: 'hidden', named: false }),
        }),
        step('Show: Greeting'),
      ],
    });
    const out = report([test]);
    expect(out).toContain(
      [
        '  ✗ Element: User Information',
        '    ✓ Username is shown',
        '    ✗ Full name is shown',
        '      Expected: Full name is shown',
        '      Actual: hidden',
        // No Location: header line: the step location is used.
        '      Location: specs/login.sanmaime:21',
        '',
      ].join('\n'),
    );
    expect(out).not.toContain('Greeting');
    expect(out).toContain('2 expectations: 1 passed, 1 failed, 0 skipped');
  });

  it('prints the header When: for a failure outside a When: block', () => {
    const test = fakeTest({
      path: ['Screen: S', 'Element: E', 'Always'],
      status: 'failed',
      steps: [
        step('Enable', {
          error: sanmaimeError({ when: 'Somewhere', expected: 'enabled', actual: 'disabled' }),
        }),
      ],
    });
    expect(report([test])).toContain(
      '    ✗ enabled\n      When: Somewhere\n      Expected: enabled\n      Actual: disabled\n',
    );
  });

  it('reports a failing condition or screen step, and non-header errors', () => {
    const test = fakeTest({
      path: ['Screen: S', 'Element: E', 'When: Logged in'],
      status: 'failed',
      steps: [
        step('Screen: S'),
        step('When: Logged in', {
          line: 7,
          error: { message: 'Error: locator.fill: Timeout 1000ms exceeded.\nCall log: …' },
        }),
      ],
    });
    expect(report([test])).toContain(
      [
        '    When: Logged in',
        '      ✗ When: Logged in',
        '        Error: Error: locator.fill: Timeout 1000ms exceeded.',
        '        Location: specs/login.sanmaime:7',
      ].join('\n'),
    );
  });

  it('shows skipped blocks with ○ and counts them', () => {
    const skipped = fakeTest({
      path: ['Screen: Login', 'Element: Login Button', 'When: Input is valid'],
      status: 'skipped',
    });
    const notRun = fakeTest({
      path: ['Screen: Login', 'Element: Login Button', 'base state'],
      line: 0,
      notRun: true,
    });
    const out = report([skipped, notRun]);
    expect(out).toContain(
      '○ Screen: Login\n\n  ○ Element: Login Button\n    ○ base state\n\n    ○ When: Input is valid\n',
    );
    expect(out).toContain('2 expectations: 0 passed, 0 failed, 2 skipped');
  });

  it('uses the final result of a retried test', () => {
    const flaky = fakeTest({
      path: ['Screen: S', 'Element: E', 'Always'],
      previous: [
        {
          status: 'failed',
          retry: 0,
          errors: [],
          steps: [step('Enable', { error: sanmaimeError({ expected: 'enabled', actual: 'x' }) })],
        },
      ],
      steps: [step('Enable')],
    });
    const out = report([flaky]);
    expect(out).toContain('✓ Screen: S\n\n  ✓ Element: E\n    ✓ enabled\n');
    expect(out).toContain('1 passed, 0 failed');
  });

  it('orders by spec file, then line, and merges a screen spread over files', () => {
    const t = (file: string, line: number, path: string[]) =>
      fakeTest({ file, line, path, steps: [step('Enable')] });
    const out = report([
      t('b.spec.ts', 1, ['Screen: B', 'Element: B1', 'Always']),
      t('a.spec.ts', 20, ['Screen: A', 'Element: A2', 'Always']),
      t('c.spec.ts', 1, ['Screen: A', 'Element: A3', 'Always']),
      t('a.spec.ts', 5, ['Screen: A', 'Element: A1', 'Always']),
    ]);
    const order = [...out.matchAll(/(Screen|Element): (\w+)/g)].map((m) => m[2]);
    expect(order).toEqual(['A', 'A1', 'A2', 'A3', 'B', 'B1']);
  });

  it('finds runtime steps nested in user steps and ignores other categories', () => {
    const test = fakeTest({
      path: ['Screen: S', 'Element: E', 'Always'],
      steps: [
        step('Before Hooks', {
          category: 'hook',
          steps: [step('page.goto', { category: 'pw:api' })],
        }),
        step('my wrapper', {
          steps: [step('Show: Title', { steps: [step('expect', { category: 'expect' })] })],
        }),
        step('Show: Not a runtime step', { category: 'expect' }),
      ],
    });
    const out = report([test]);
    expect(out).toContain('  ✓ Element: E\n    ✓ Title is shown\n\n');
    expect(out).not.toContain('Not a runtime step');
  });

  it('lists tests that are not Nimaime tests under Other tests', () => {
    const plain = fakeTest({ path: ['group', 'does a thing'], file: 'other.spec.ts' });
    const failing = fakeTest({
      path: ['breaks'],
      file: 'other.spec.ts',
      line: 9,
      status: 'failed',
      errors: [{ message: 'Error: expected 1 to be 2\n\nmore' }],
    });
    // A Screen: describe without an Element: describe is not a generated test either.
    const screenOnly = fakeTest({
      path: ['Screen: S', 'loose test'],
      file: 'other.spec.ts',
      line: 12,
    });
    const out = report([plain, failing, screenOnly]);
    expect(out).toBe(
      [
        '',
        'Other tests',
        '  ✓ other.spec.ts › group › does a thing',
        '  ✗ other.spec.ts › breaks',
        '    Error: Error: expected 1 to be 2',
        '  ✓ other.spec.ts › Screen: S › loose test',
        '',
        '0 screens, 0 elements, 0 expectations: 0 passed, 0 failed, 0 skipped (1.2s)',
        '3 other tests: 2 passed, 1 failed, 0 skipped',
        '',
      ].join('\n'),
    );
  });

  it('quiet: prints only failures and the summary', () => {
    const plain = fakeTest({ path: ['ok'], file: 'other.spec.ts' });
    const other = fakeTest({
      path: ['Screen: Other', 'Element: X', 'Always'],
      file: 'z.spec.ts',
      steps: [step('Enable')],
    });
    expect(report([loginForm, buttonValid, buttonInvalid, other, plain], { quiet: true })).toBe(
      [
        '',
        '✗ Screen: Login',
        '',
        '  ✗ Element: Login Button',
        '    When: Input is invalid',
        '      ✗ disabled',
        '        Expected: disabled',
        '        Actual: enabled',
        '        Location: specs/login.sanmaime:13',
        '',
        '2 screens, 3 elements, 6 expectations: 5 passed, 1 failed, 0 skipped (1.2s)',
        '1 other test: 1 passed, 0 failed, 0 skipped',
        '',
      ].join('\n'),
    );
  });

  it('printSteps: false prints only Screen / Element lines and failures', () => {
    const out = report([loginForm, buttonInvalid], { printSteps: false });
    expect(out).toContain('  ✓ Element: Login Form\n\n  ✗ Element: Login Button\n');
    expect(out).not.toContain('Email address');
    expect(out).toContain('      ✗ disabled\n');
  });

  it('printDetails: also prints Playwright’s message', () => {
    const out = report([buttonInvalid], { printDetails: true });
    expect(out).toContain(
      '        Location: specs/login.sanmaime:13\n' +
        '          expect(locator).toBeVisible() failed\n' +
        '\n' +
        "          Locator: getByTestId('x')\n",
    );
    expect(report([buttonInvalid])).not.toContain('toBeVisible');
  });

  it('colours: ANSI codes only when enabled', () => {
    expect(report([loginForm, buttonInvalid])).not.toContain('\u001b[');
    const coloured = report([loginForm, buttonInvalid], { colors: true });
    expect(coloured).toContain('\u001b[32m✓\u001b[39m Email address is shown');
    expect(coloured).toContain('\u001b[31m✗\u001b[39m \u001b[1mScreen: Login\u001b[22m');
  });

  it('labels screens with the project when the run has several projects', () => {
    const t = (project: string) =>
      fakeTest({ project, path: ['Screen: S', 'Element: E', 'Always'], steps: [step('Enable')] });
    const out = report([t('chromium'), t('firefox')]);
    expect(out).toContain('✓ Screen: S [chromium]\n');
    expect(out).toContain('✓ Screen: S [firefox]\n');
    expect(report([t('chromium')])).not.toContain('[chromium]');
  });

  it('mentions an interrupted / timed out run and prints global errors', () => {
    const output = fakeOutput();
    const reporter = new NimaimeReporter({ colors: false, cwd: CWD, output });
    reporter.onError({
      message: 'Error: no tests found',
      location: { file: `${CWD}/playwright.config.ts`, line: 3, column: 1 },
    });
    reporter.onEnd({ status: 'interrupted', duration: 400 });
    expect(output.text).toBe(
      [
        '',
        'Errors',
        '  ✗ Error: no tests found',
        '    Location: playwright.config.ts:3',
        '',
        '0 screens, 0 elements, 0 expectations: 0 passed, 0 failed, 0 skipped (400ms, interrupted)',
        '',
      ].join('\n'),
    );
  });

  it('works without onBegin (tests seen in onTestEnd)', () => {
    const output = fakeOutput();
    const reporter = new NimaimeReporter({ colors: false, cwd: CWD, output });
    reporter.onTestEnd(loginForm);
    reporter.onEnd({ status: 'passed', duration: 10 });
    expect(output.text).toContain('✓ Element: Login Form');
    expect(reporter.printsToStdio()).toBe(false);
    expect(new NimaimeReporter().printsToStdio()).toBe(true);
  });
});

describe('defaultColors', () => {
  it('follows the TTY, NO_COLOR and FORCE_COLOR', () => {
    expect(defaultColors({ write: () => undefined, isTTY: true }, {})).toBe(true);
    expect(defaultColors({ write: () => undefined, isTTY: false }, {})).toBe(false);
    expect(defaultColors({ write: () => undefined }, {})).toBe(false);
    expect(defaultColors({ write: () => undefined, isTTY: true }, { NO_COLOR: '1' })).toBe(false);
    expect(defaultColors({ write: () => undefined }, { FORCE_COLOR: '1' })).toBe(true);
    expect(defaultColors({ write: () => undefined, isTTY: true }, { FORCE_COLOR: '0' })).toBe(
      false,
    );
  });
});

describe('buildReport / countReport / renderReport', () => {
  it('builds the Screen > Element > block structure', () => {
    const run = buildReport([buttonInvalid, loginForm], CWD);
    expect(run.screens).toHaveLength(1);
    expect(run.screens[0]).toMatchObject({
      name: 'Login',
      status: 'failed',
      elements: [
        { name: 'Login Form', status: 'passed' },
        {
          name: 'Login Button',
          status: 'failed',
          blocks: [
            {
              condition: 'Input is invalid',
              status: 'failed',
              expectations: [
                {
                  text: 'disabled',
                  status: 'failed',
                  failure: { header: { expected: 'disabled', actual: 'enabled' } },
                },
              ],
            },
          ],
        },
      ],
    });
    expect(countReport(run)).toMatchObject({ screens: 1, elements: 2, passed: 3, failed: 1 });
    expect(
      renderReport(run, { colors: false, quiet: false, printSteps: true, printDetails: false }),
    ).toMatch(/\n1 screen, 2 elements, 4 expectations: 3 passed, 1 failed, 0 skipped\n$/);
  });

  it('formatDuration', () => {
    expect(formatDuration(850)).toBe('850ms');
    expect(formatDuration(1234)).toBe('1.2s');
    expect(formatDuration(150_000)).toBe('2.5m');
  });
});
