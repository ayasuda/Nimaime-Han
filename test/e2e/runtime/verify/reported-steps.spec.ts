// What reporters see of $nimaime.verify(): runs ./scenario.fixture.ts in a nested Playwright
// process with the JSON reporter and checks the step tree and the failure message. Lives in this
// directory so that the reporter e2e project (which runs runtime/*.spec.ts) does not nest it.
import { execFile } from 'node:child_process';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const root = resolve(import.meta.dirname, '../../../..');
const cli = join(root, 'node_modules', '@playwright', 'test', 'cli.js');
const config = join(import.meta.dirname, 'playwright.config.ts');

interface JsonStep {
  title: string;
  steps?: JsonStep[];
  error?: { message?: string };
}
interface JsonResult {
  status: string;
  steps: JsonStep[];
  errors: { message?: string }[];
}
interface JsonSpec {
  title: string;
  tests: { results: JsonResult[] }[];
}
interface JsonReport {
  suites: { specs: JsonSpec[] }[];
}

function runFixture(): Promise<JsonReport> {
  const env: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: '0' };
  for (const key of Object.keys(env)) {
    if (/^(TEST_|PW_)/.test(key)) env[key] = undefined;
  }
  return new Promise((done, fail) => {
    execFile(
      process.execPath,
      [cli, 'test', '-c', config, '--reporter=json'],
      { cwd: root, env, maxBuffer: 16 * 1024 * 1024 },
      (_error, stdout, stderr) => {
        try {
          done(JSON.parse(stdout) as JsonReport);
        } catch {
          fail(new Error(`Unexpected output:\n${stdout}${stderr}`));
        }
      },
    );
  });
}

/** Step titles as an indented outline, leaving out Playwright's own hooks and fixtures. */
function outline(steps: JsonStep[] | undefined, depth = 0): string[] {
  return (steps ?? [])
    .filter((s) => !/^(Before Hooks|After Hooks|Fixture|Worker Cleanup)/.test(s.title))
    .flatMap((s) => [`${'  '.repeat(depth)}${s.title}`, ...outline(s.steps, depth + 1)])
    .filter((line) => !/^\s*(Set content|Expect )/.test(line));
}

test.describe('reported steps', () => {
  test.describe.configure({ mode: 'serial' });
  let results: Map<string, JsonResult | undefined>;

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    const report = await runFixture();
    results = new Map(
      report.suites
        .flatMap((suite) => suite.specs)
        .map((spec) => [spec.title, spec.tests[0]?.results[0]]),
    );
  });

  test('verify reports Screen > Element > When: > Show: steps', () => {
    const result = results.get('own profile');
    expect(result?.status).toBe('passed');
    expect(outline(result?.steps)).toEqual([
      'When the user opens their profile',
      'Then the account profile screen is displayed',
      '  Screen: Account Profile',
      '    Element: Profile Card',
      '      Show: Username',
      '      When: Own profile',
      '        Show: Full name',
      '        Show: Email address',
      '    Element: Profile Actions',
      '      When: Own profile',
      '        Show: Edit button',
    ]);
  });

  test('a failed verify is reported with the Sanmaime header', () => {
    const result = results.get("another user's profile");
    expect(result?.status).toBe('failed');
    const message = result?.errors[0]?.message ?? '';
    expect(message).toContain(
      "Element: Profile Card\nWhen: Another user's profile\nExpected: Email address is hidden",
    );
    expect(message).toContain('Location: test/e2e/runtime/verify/profile.sanmaime:13');
  });
});
