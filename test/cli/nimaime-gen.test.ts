/**
 * The `nimaime-gen` CLI: argument parsing, and whole runs in-process over throw-away projects in
 * the OS temp directory (each test writes its own project, so that every Playwright config file
 * is evaluated once per process, as in a real CLI run). Projects link the repository's
 * node_modules and import nimaime-han from src/ by absolute path.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CliUsageError, parseCliArgs } from '../../src/cli/args';
import { main } from '../../src/cli/main';
import { runGeneration, type GenerationMode } from '../../src/gen';
import { VERSION } from '../../src/version';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const srcIndex = JSON.stringify(path.join(repoRoot, 'src', 'index').split(path.sep).join('/'));
const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** Writes `files` into a new temp directory and returns it. */
function project(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimaime-gen-test-'));
  tempDirs.push(dir);
  const all: Record<string, string> = { 'package.json': '{ "type": "module" }\n', ...files };
  // Lets the project resolve @playwright/test (Playwright's loader is needed for TS configs).
  fs.symlinkSync(path.join(repoRoot, 'node_modules'), path.join(dir, 'node_modules'), 'junction');
  for (const [name, content] of Object.entries(all)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return dir;
}

function config(options: string): string {
  return `import { defineSanmaimeConfig } from ${srcIndex};
export default { testDir: defineSanmaimeConfig(${options}) };
`;
}

const LOGIN_SPEC = `Screen: Login

  Element: Login Form
    Show: Email address
    And: Password
    And: Login button

  Element: Login Button
    When: Input is valid
    Enable

    When: Input is invalid
    Disable
`;

const LOGIN_DEFINITIONS = `import { createNimaime } from ${srcIndex};
import { test } from '../fixtures';

const { defineScreen, defineElement, defineCondition } = createNimaime(test);

defineScreen('Login', { open: async ({ page, appHtml }) => { await page.setContent(appHtml); } });
defineElement('Login Form', {
  'Email address': ({ page }) => page.getByLabel('Email'),
  Password: ({ page }) => page.getByLabel('Password'),
  'Login button': ({ page }) => page.getByRole('button', { name: 'Log in' }),
});
defineElement('Login Button', ({ page }) => page.getByRole('button', { name: 'Log in' }));
defineCondition('Input is valid', async ({ page }) => {
  await page.getByLabel('Email').fill('alice@example.com');
});
defineCondition('Input is invalid', async ({ page }) => {
  await page.getByLabel('Email').fill('nope');
}, { screen: 'Login' });
defineElement('Footer', { Links: ({ page }) => page.locator('footer a') });
`;

const FIXTURES = `import { test as base } from '@playwright/test';
export const test = base.extend<{ appHtml: string }>({ appHtml: '<p>app</p>' });
`;

function loginProject(extra: Record<string, string> = {}): string {
  return project({
    'playwright.config.ts': config(
      `{ specs: 'specs/**/*.sanmaime', definitions: 'definitions/**/*.ts', importTestFrom: 'fixtures.ts' }`,
    ),
    'fixtures.ts': FIXTURES,
    'specs/auth/login.sanmaime': LOGIN_SPEC,
    'definitions/login.ts': LOGIN_DEFINITIONS,
    ...extra,
  });
}

function capture() {
  let stdout = '';
  let stderr = '';
  return {
    stdout: {
      write: (text: string) => {
        stdout += text;
      },
    },
    stderr: {
      write: (text: string) => {
        stderr += text;
      },
    },
    get out() {
      return stdout;
    },
    get err() {
      return stderr;
    },
  };
}

async function run(
  cwd: string,
  mode: GenerationMode = 'generate',
  verbose = false,
  extra: { allowMissing?: boolean; format?: 'pretty' | 'compact' } = {},
) {
  const io = capture();
  const result = await runGeneration({
    cwd,
    mode,
    verbose,
    ...extra,
    stdout: io.stdout,
    stderr: io.stderr,
  });
  return { ...result, out: io.out, err: io.err };
}

describe('parseCliArgs', () => {
  it('defaults to generate', () => {
    expect(parseCliArgs([])).toEqual({
      command: 'generate',
      config: undefined,
      verbose: false,
      allowMissing: false,
      format: 'pretty',
      help: false,
      version: false,
    });
  });

  it('parses commands and options', () => {
    expect(parseCliArgs(['export', '-c', 'e2e/playwright.config.ts', '--verbose'])).toMatchObject({
      command: 'export',
      config: 'e2e/playwright.config.ts',
      verbose: true,
    });
    expect(parseCliArgs(['--config=dir', 'check'])).toMatchObject({
      command: 'check',
      config: 'dir',
    });
    expect(parseCliArgs(['--allow-missing', '--format', 'compact'])).toMatchObject({
      allowMissing: true,
      format: 'compact',
    });
    expect(parseCliArgs(['-h']).help).toBe(true);
    expect(parseCliArgs(['--version']).version).toBe(true);
  });

  it('rejects unknown commands, options and extra arguments', () => {
    expect(() => parseCliArgs(['build'])).toThrow(CliUsageError);
    expect(() => parseCliArgs(['build'])).toThrow(/Unknown command 'build'/);
    expect(() => parseCliArgs(['--watch'])).toThrow(CliUsageError);
    expect(() => parseCliArgs(['export', 'check'])).toThrow(/Unexpected argument 'check'/);
    expect(() => parseCliArgs(['-c'])).toThrow(CliUsageError);
    expect(() => parseCliArgs(['--config='])).toThrow(/needs a path/);
    expect(() => parseCliArgs(['--format', 'json'])).toThrow(
      /Unknown format 'json'. Formats: pretty, compact\./,
    );
  });
});

describe('main', () => {
  it('prints help and version', async () => {
    const io = capture();
    expect(await main(['--help'], io)).toBe(0);
    expect(io.out).toContain('Usage: nimaime-gen [command] [options]');
    const io2 = capture();
    expect(await main(['-v'], io2)).toBe(0);
    expect(io2.out).toBe(`${VERSION}\n`);
  });

  it('exits with 2 on usage errors', async () => {
    const io = capture();
    expect(await main(['--nope'], io)).toBe(2);
    expect(io.err).toMatch(/^nimaime-gen: Unknown option '--nope'/);
    expect(io.err).toContain(`Run 'nimaime-gen --help' for usage.`);
  });

  it('exits with 2 when there is no Playwright config', async () => {
    const dir = project({});
    const io = capture();
    expect(await main([], { ...io, cwd: dir })).toBe(2);
    expect(io.err).toMatch(/^nimaime-gen: Playwright config not found in /);
    expect(io.err).not.toContain('    at ');
  });

  it('passes -c relative to cwd and the command to runGeneration', async () => {
    const dir = loginProject();
    const io = capture();
    expect(await main(['check', '-c', 'playwright.config.ts'], { ...io, cwd: dir })).toBe(0);
    expect(io.out).toBe('OK: 1 spec file (3 tests) for .sanmaime-gen; nothing was written.\n');
    expect(fs.existsSync(path.join(dir, '.sanmaime-gen'))).toBe(false);
  });
});

describe('runGeneration', () => {
  it('generates spec files, keeping the relative path of each spec', async () => {
    const dir = loginProject();
    const result = await run(dir);
    expect(result.err).toBe('');
    expect(result.out).toBe('Generated 1 spec file (3 tests) into .sanmaime-gen\n');
    expect(result.exitCode).toBe(0);
    const generated = path.join(dir, '.sanmaime-gen', 'specs', 'auth', 'login.spec.ts');
    const content = fs.readFileSync(generated, 'utf8');
    expect(content.split('\n').slice(0, 7).join('\n')).toBe(
      [
        '// Generated by nimaime-gen from specs/auth/login.sanmaime. Do not edit.',
        "import { createNimaimeTest } from 'nimaime-han/runtime';",
        "import { test as base } from '../../../fixtures';",
        "import '../../../definitions/login';",
        '',
        'const test = createNimaimeTest(base);',
        "const file = '../../../specs/auth/login.sanmaime';",
      ].join('\n'),
    );
    // The screen's open destructures the custom fixture.
    expect(content).toContain(`test('Always', async ({ $nimaime, appHtml, page }) => {`);
    expect(result.results[0]?.written).toBe(true);
  });

  it('removes previously generated files but keeps other files', async () => {
    const dir = loginProject({
      '.sanmaime-gen/old/stale.spec.ts':
        '// Generated by nimaime-gen from old.sanmaime. Do not edit.\n',
      '.sanmaime-gen/notes.txt': 'mine\n',
    });
    const result = await run(dir, 'generate', true);
    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(path.join(dir, '.sanmaime-gen', 'old'))).toBe(false);
    expect(fs.readFileSync(path.join(dir, '.sanmaime-gen', 'notes.txt'), 'utf8')).toBe('mine\n');
    expect(result.err).toContain('Kept .sanmaime-gen/notes.txt (not generated by nimaime-gen).');
    // Verbose: generated files, unused definitions, the screen-level info.
    expect(result.out).toContain('  .sanmaime-gen/specs/auth/login.spec.ts\n');
    expect(result.err).toMatch(
      /definitions\/login\.ts:\d+:\d+: warning: unused definition: Element "Footer" is not used by any spec\./,
    );
  });

  it('exports the list of tests without writing', async () => {
    const dir = loginProject();
    const result = await run(dir, 'export');
    expect(result.exitCode).toBe(0);
    expect(result.out).toBe(
      [
        'specs/auth/login.sanmaime',
        '  Screen: Login > Element: Login Form > Always',
        '  Screen: Login > Element: Login Button > When: Input is valid',
        '  Screen: Login > Element: Login Button > When: Input is invalid',
        '3 tests in 1 spec file.',
        '',
      ].join('\n'),
    );
    expect(fs.existsSync(path.join(dir, '.sanmaime-gen'))).toBe(false);
  });

  const BROKEN_SPEC = 'Screen: Broken\n  Element: X\n    Shw: Y\n';
  const MISSING_SPEC = `Screen: Somewhere

  Element: Login Button
    Show: Spinner

  Element: Nowhere
    Show: Anything

  Element: Login Form
    When: Never defined
    Show: Password

    When: Input is valid
    Show: Password
`;

  it('reports parser errors and missing definitions with snippets and writes nothing', async () => {
    const dir = loginProject({
      '.sanmaime-gen/previous.spec.ts': '// Generated by nimaime-gen from x. Do not edit.\n',
      'specs/broken.sanmaime': BROKEN_SPEC,
      'specs/missing.sanmaime': MISSING_SPEC,
    });
    const result = await run(dir);
    expect(result.exitCode).toBe(1);
    expect(result.out).toBe('');
    expect(result.err).toBe(
      [
        'Syntax errors: 2',
        '',
        '  specs/broken.sanmaime:2:3',
        "    SANMAIME_E009: Element 'X' has no expectations.",
        '',
        '  specs/broken.sanmaime:3:5',
        "    SANMAIME_E001: Unrecognised line 'Shw: Y'. Expected Screen:, Element:, When:, Show:, Hide:, And:, Enable, Disable, a comment (#) or tags (@).",
        '',
        'Missing definitions: 3',
        '',
        '  specs/missing.sanmaime:4:5',
        '    Element "Login Button" has no definition for "Spinner"',
        '',
        '  specs/missing.sanmaime:6:3',
        '    Element "Nowhere" is not defined',
        '',
        '  specs/missing.sanmaime:10:5',
        '    Condition "Never defined" is not defined',
        '',
        'Snippets:',
        '',
        "// import { createNimaime } from 'nimaime-han';",
        '// const { defineElement, defineCondition } = createNimaime(test);',
        '',
        "// Add to the existing defineElement('Login Button', { … }):",
        "  Spinner: ({ page }) => page.getByTestId('TODO'),",
        '',
        "defineElement('Nowhere', {",
        "  Anything: ({ page }) => page.getByTestId('TODO'),",
        '});',
        '',
        `// Used on Screen "Somewhere" (add { screen: 'Somewhere' } to define it for that screen only).`,
        "defineCondition('Never defined', async ({ page }) => {",
        '  // TODO: bring the screen into this state',
        '});',
        '',
        'nimaime-gen: nothing was generated into .sanmaime-gen (5 errors).',
        '',
      ].join('\n'),
    );
    // The previous output is left alone.
    expect(fs.existsSync(path.join(dir, '.sanmaime-gen', 'previous.spec.ts'))).toBe(true);
  });

  it('prints one line per problem with --format compact', async () => {
    const dir = loginProject({
      'specs/broken.sanmaime': BROKEN_SPEC,
      'specs/missing.sanmaime': MISSING_SPEC,
    });
    const io = capture();
    expect(await main(['--format', 'compact'], { ...io, cwd: dir })).toBe(1);
    expect(io.err.split('\n')).toEqual([
      "specs/broken.sanmaime:2:3: error SANMAIME_E009: Element 'X' has no expectations.",
      "specs/broken.sanmaime:3:5: error SANMAIME_E001: Unrecognised line 'Shw: Y'. Expected Screen:, Element:, When:, Show:, Hide:, And:, Enable, Disable, a comment (#) or tags (@).",
      'specs/missing.sanmaime:4:5: error: Element "Login Button" has no definition for target "Spinner".',
      'specs/missing.sanmaime:6:3: error: Element "Nowhere" of Screen "Somewhere" has no definition (defineElement).',
      'specs/missing.sanmaime:10:5: error: Condition "When: Never defined" (Screen "Somewhere", Element "Login Form") has no definition (defineCondition).',
      'nimaime-gen: nothing was generated into .sanmaime-gen (5 errors).',
      '',
    ]);
  });

  it('generates the tests without missing definitions with --allow-missing and exits with 0', async () => {
    const dir = loginProject({
      'specs/missing.sanmaime': MISSING_SPEC,
      'specs/all-missing.sanmaime': 'Screen: Void\n  Element: Nothing\n    Show: Here\n',
    });
    const io = capture();
    expect(await main(['--allow-missing'], { ...io, cwd: dir })).toBe(0);
    expect(io.err).toMatch(/^Missing definitions \(allowed by --allow-missing\): 4\n/);
    expect(io.err).toContain("defineCondition('Never defined', async ({ page }) => {");
    expect(io.err).toContain(
      [
        'nimaime-gen: --allow-missing: 4 tests that use missing definitions are not generated:',
        '  specs/all-missing.sanmaime: Screen: Void > Element: Nothing > Always',
        '  specs/missing.sanmaime: Screen: Somewhere > Element: Login Button > Always',
        '  specs/missing.sanmaime: Screen: Somewhere > Element: Nowhere > Always',
        '  specs/missing.sanmaime: Screen: Somewhere > Element: Login Form > When: Never defined',
        '',
      ].join('\n'),
    );
    expect(io.out).toBe('Generated 2 spec files (4 tests) into .sanmaime-gen\n');
    const out = path.join(dir, '.sanmaime-gen', 'specs');
    // A spec whose tests all use missing definitions gets no file.
    expect(fs.existsSync(path.join(out, 'all-missing.spec.ts'))).toBe(false);
    const content = fs.readFileSync(path.join(out, 'missing.spec.ts'), 'utf8');
    expect(content).toContain(`test.describe('Element: Login Form', () => {`);
    expect(content).toContain(`test('When: Input is valid', async ({ $nimaime, page }) => {`);
    expect(content).not.toContain('Never defined');
    expect(content).not.toContain('Nowhere');
    expect(content).not.toContain('Login Button');
    expect(fs.existsSync(path.join(out, 'auth', 'login.spec.ts'))).toBe(true);
  });

  it('lists only the generated tests with export --allow-missing, and marks compact lines as warnings', async () => {
    const dir = loginProject({ 'specs/missing.sanmaime': MISSING_SPEC });
    const result = await run(dir, 'export', false, { allowMissing: true, format: 'compact' });
    expect(result.exitCode).toBe(0);
    expect(result.err.split('\n').slice(0, 3)).toEqual([
      'specs/missing.sanmaime:4:5: warning: Element "Login Button" has no definition for target "Spinner".',
      'specs/missing.sanmaime:6:3: warning: Element "Nowhere" of Screen "Somewhere" has no definition (defineElement).',
      'specs/missing.sanmaime:10:5: warning: Condition "When: Never defined" (Screen "Somewhere", Element "Login Form") has no definition (defineCondition).',
    ]);
    expect(result.out).toContain(
      'specs/missing.sanmaime\n  Screen: Somewhere > Element: Login Form > When: Input is valid\n',
    );
    expect(result.out).toMatch(/\n4 tests in 2 spec files\.\n$/);
    expect(result.results[0]?.skipped).toHaveLength(3);
    expect(fs.existsSync(path.join(dir, '.sanmaime-gen'))).toBe(false);
  });

  it('still fails on parser errors with --allow-missing', async () => {
    const dir = loginProject({
      'specs/broken.sanmaime': BROKEN_SPEC,
      'specs/missing.sanmaime': MISSING_SPEC,
    });
    const result = await run(dir, 'generate', false, { allowMissing: true });
    expect(result.exitCode).toBe(1);
    expect(result.err).toMatch(
      /\nnimaime-gen: nothing was generated into \.sanmaime-gen \(2 errors\)\.\n$/,
    );
    expect(fs.existsSync(path.join(dir, '.sanmaime-gen'))).toBe(false);
  });

  it('reports a definition file that fails to load without a stack trace', async () => {
    const dir = loginProject({ 'definitions/throws.ts': `throw new Error('boom');\n` });
    const result = await run(dir);
    expect(result.exitCode).toBe(1);
    expect(result.err).toMatch(/^error: Failed to load definition file .*throws\.ts: boom\n/);
    expect(result.err).not.toContain('    at ');
  });

  it('warns and requests page when a callback does not destructure its fixtures', async () => {
    const dir = project({
      'playwright.config.ts': config(`{ specs: '*.sanmaime', definitions: '*.ts' }`),
      'home.sanmaime': 'Screen: Home\n  Element: Panel\n    Show: Title\n',
      'defs.ts': `import { createNimaime } from ${srcIndex};
createNimaime().defineElement('Panel', { Title: (fixtures) => fixtures.page.locator('h1') });
`,
    });
    const result = await run(dir);
    expect(result.exitCode).toBe(0);
    expect(result.err).toBe(
      'home.sanmaime: warning: cannot tell which fixtures element "Panel" target "Title" uses ' +
        '(its first parameter is not destructured), so "Screen: Home > Element: Panel > Always" ' +
        'requests "page" for it. Destructure the fixtures it needs, e.g. async ({ page }) => { … }.\n',
    );
    const content = fs.readFileSync(path.join(dir, '.sanmaime-gen', 'home.spec.ts'), 'utf8');
    expect(content).toContain(`test('Always', async ({ $nimaime, page }) => {`);
  });

  it('exits with 2 for an invalid config, without a stack trace', async () => {
    const dir = project({
      'playwright.config.ts': config(`{ specs: 'x', definitions: 'y', language: 'fr' }`),
    });
    const result = await run(dir);
    expect(result.exitCode).toBe(2);
    expect(result.err).toMatch(
      /^nimaime-gen: Failed to load Playwright config .*: Invalid Sanmaime config: option "language" must be one of the supported languages/,
    );
    expect(result.err).not.toContain('    at ');
  });

  it('exits with 2 when the config does not call defineSanmaimeConfig()', async () => {
    const dir = project({ 'playwright.config.ts': 'export default {};\n' });
    const result = await run(dir);
    expect(result.exitCode).toBe(2);
    expect(result.err).toBe(
      'nimaime-gen: playwright.config.ts does not call defineSanmaimeConfig(), so there is nothing to generate.\n',
    );
  });

  it('warns when no spec matches and still succeeds', async () => {
    const dir = project({
      'playwright.config.ts': config(`{ specs: 'none/*.sanmaime', definitions: 'none/*.ts' }`),
    });
    const result = await run(dir);
    expect(result.exitCode).toBe(0);
    expect(result.err).toBe('warning: no .sanmaime files match "specs" (none/*.sanmaime) in ..\n');
    expect(result.out).toBe('Generated 0 spec files (0 tests) into .sanmaime-gen\n');
  });
});

describe('built CLI', () => {
  const bin = path.join(repoRoot, 'dist', 'cli', 'nimaime-gen.js');
  // Skip when there is no build, or when the build predates the CLI sources (a stale dist
  // from an earlier checkout would otherwise fail this test for reasons unrelated to the code).
  const cliSources = ['args.ts', 'main.ts', 'nimaime-gen.ts'].map((f) =>
    path.join(repoRoot, 'src', 'cli', f),
  );
  const built = fs.existsSync(bin) ? fs.statSync(bin).mtimeMs : -1;
  const fresh = built >= 0 && cliSources.every((f) => fs.statSync(f).mtimeMs <= built);

  it.skipIf(!fresh)('runs --help from dist', () => {
    const result = spawnSync(process.execPath, [bin, '--help'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: nimaime-gen [command] [options]');
    const bad = spawnSync(process.execPath, [bin, 'nope'], { encoding: 'utf8' });
    expect(bad.status).toBe(2);
  });
});
