// Runs Playwright with src/reporter/index.ts as the reporter, in nested processes, and checks the
// README-shaped ✓/✗ tree it prints:
// - the README example against a buggy page (test/e2e/runtime/reporting, owned by the runtime);
// - the runtime e2e specs plus ./project/*.scenario.ts, which fail and skip on purpose.
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const root = resolve(import.meta.dirname, '../../..');
const cli = resolve(root, 'node_modules/@playwright/test/cli.js');
const reporter = resolve(root, 'src/reporter/index.ts');

interface Run {
  code: number;
  output: string;
}

/** Runs Playwright with `config` and the Sanmaime reporter, outside of this worker's environment. */
function runReporter(config: string): Promise<Run> {
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1', FORCE_COLOR: undefined };
  for (const key of Object.keys(env)) {
    if (/^(TEST_|PW_|PWTEST_)/.test(key)) env[key] = undefined;
  }
  return new Promise((done) => {
    execFile(
      process.execPath,
      [cli, 'test', '-c', resolve(root, config), `--reporter=${reporter}`],
      { cwd: root, env, maxBuffer: 16 * 1024 * 1024, timeout: 170_000 },
      (error, stdout) => {
        const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
        done({ code, output: stdout });
      },
    );
  });
}

test.describe.configure({ mode: 'serial', timeout: 180_000 });

test.describe('README example', () => {
  let run: Run;
  test.beforeAll(async () => {
    run = await runReporter('test/e2e/runtime/reporting/playwright.config.ts');
  });

  test('prints the README result', () => {
    expect(run.code, run.output).toBe(1);
    expect(run.output).toMatch(
      new RegExp(
        '^' +
          [
            '',
            '✗ Screen: Login',
            '',
            '  ✗ Element: Login Form',
            '    ✓ Email address is shown',
            '    ✗ Password is shown',
            '      Expected: Password is shown',
            '      Actual: hidden \\(not found\\)',
            '      Location: test/e2e/runtime/reporting/login\\.sanmaime:5',
            '',
            '  ✗ Element: Login Button',
            '    When: Input is valid',
            '      ✓ enabled',
            '',
            '    When: Input is invalid',
            '      ✗ disabled',
            '        Expected: disabled',
            '        Actual: enabled',
            '        Location: test/e2e/runtime/reporting/login\\.sanmaime:13',
            '',
            '1 screen, 2 elements, 4 expectations: 2 passed, 2 failed, 0 skipped \\([\\d.]+m?s\\)',
            '',
          ].join('\\n') +
          '$',
      ),
    );
  });
});

test.describe('runtime specs and scenarios', () => {
  let output = '';
  let status: number | null = null;
  test.beforeAll(async () => {
    const run = await runReporter('test/e2e/reporter/project/playwright.config.ts');
    output = run.output;
    status = run.code;
  });

  test('the run fails because of the failing scenarios', () => {
    expect(status, output).toBe(1);
  });

  test('prints the passing Login Form block like the README', () => {
    expect(output).toContain(
      [
        '✓ Screen: Login',
        '',
        '  ✓ Element: Login Form',
        '    ✓ Email address is shown',
        '    ✓ Password is shown',
        '    ✓ Login button is shown',
        '',
      ].join('\n'),
    );
  });

  test('prints conditional blocks with their When: line', () => {
    expect(output).toContain(
      ['    When: Input is invalid', '      ✓ disabled', '      ✓ Error message is shown'].join(
        '\n',
      ),
    );
  });

  test('prints a failing Show: with Expected / Actual / Location and omits the rest', () => {
    expect(output).toContain(
      [
        '✗ Screen: Profile',
        '',
        '  ✗ Element: User Information',
        '    ✓ Username is shown',
        '    ✗ Full name is shown',
        '      Expected: Full name is shown',
        '      Actual: hidden',
        '      Location: test/e2e/reporter/project/profile.sanmaime:5',
        '',
      ].join('\n'),
    );
    expect(output).not.toContain('Greeting is shown\n\n  ✗ Element: Login Button');
  });

  test('prints a failing expectation of a When: block, and skipped blocks', () => {
    expect(output).toContain(
      [
        '  ✗ Element: Login Button',
        '    When: Input is valid',
        '      ✗ disabled',
        '        Expected: disabled',
        '        Actual: enabled',
        '        Location: test/e2e/reporter/project/profile.sanmaime:10',
        '',
        '    ○ When: Viewing your own profile',
      ].join('\n'),
    );
  });

  test('lists the other tests and prints the summary', () => {
    expect(output).toContain('Other tests\n');
    expect(output).toContain(
      '  ✓ runtime/runtime.spec.ts › runtime behaviour › low-level methods\n',
    );
    // The runtime specs may grow; the scenarios contribute exactly 2 failures and 1 skip.
    expect(output).toMatch(
      /\n\d+ screens, \d+ elements, \d+ expectations: \d+ passed, 2 failed, 1 skipped \(\d+(\.\d)?m?s\)\n\d+ other tests: \d+ passed, 0 failed, 0 skipped\n$/,
    );
    // No ANSI codes with NO_COLOR.
    expect(output).not.toContain('\u001b[');
  });
});
