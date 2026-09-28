// What Playwright's own list reporter prints for Sanmaime failures: runs the deliberately failing
// ./reporting/readme.fixture.ts (the README example against a buggy page) in a nested Playwright
// process and checks the Sanmaime header, the `Details:` section and the .sanmaime code frame.
import { execFile } from 'node:child_process';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const root = resolve(import.meta.dirname, '../../..');
const cli = join(root, 'node_modules', '@playwright', 'test', 'cli.js');
const config = join(import.meta.dirname, 'reporting', 'playwright.config.ts');

interface Run {
  code: number;
  output: string;
}

/** Runs the fixture with `--reporter=list`, outside of this test's worker environment. */
function runFixture(): Promise<Run> {
  const env: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: '0' };
  for (const key of Object.keys(env)) {
    if (/^(TEST_|PW_)/.test(key)) env[key] = undefined;
  }
  return new Promise((done) => {
    execFile(
      process.execPath,
      [cli, 'test', '-c', config, '--reporter=list'],
      { cwd: root, env, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
        // eslint-disable-next-line no-control-regex
        done({ code, output: `${stdout}${stderr}`.replace(/\u001b\[[0-9;]*m/g, '') });
      },
    );
  });
}

test.describe('list reporter', () => {
  test.describe.configure({ mode: 'serial' });
  let run: Run;

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    run = await runFixture();
  });

  test('the fixture fails as intended', () => {
    expect(run.code, run.output).toBe(1);
    expect(run.output).toContain('2 failed');
    expect(run.output).toContain('1 passed');
  });

  test('a failing Show: prints the Sanmaime header, then the details', () => {
    expect(run.output).toContain(
      [
        '    NimaimeExpectationError: Screen: Login',
        '    Element: Login Form',
        '    Expected: Password is shown',
        '    Actual: hidden (not found, after 1000ms)',
        '    Location: test/e2e/runtime/reporting/login.sanmaime:5',
        '',
        '    Details:',
        '      expect(locator).toBeVisible() failed',
        '',
        "      Locator: getByTestId('password')",
      ].join('\n'),
    );
  });

  test('a failing Disable in a When: block reads like the README', () => {
    expect(run.output).toContain(
      [
        '    Element: Login Button',
        '    When: Input is invalid',
        '    Expected: disabled',
        '    Actual: enabled (after 1000ms)',
        '    Location: test/e2e/runtime/reporting/login.sanmaime:13',
      ].join('\n'),
    );
  });

  test('the failure is located at the .sanmaime line, with a code frame of it', () => {
    expect(run.output).toContain('› Element: Login Form › Always › Show: Password');
    expect(run.output).toMatch(/ at \S*login\.sanmaime:5\n/);
    expect(run.output).toContain('> 5 |     And: Password\n');
    expect(run.output).toContain('› Element: Login Button › When: Input is invalid › Disable');
    expect(run.output).toMatch(/ at \S*login\.sanmaime:13\n/);
    expect(run.output).toContain('> 13 |     Disable\n');
  });
});
