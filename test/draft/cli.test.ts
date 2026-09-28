/**
 * The `nimaime` command line: argument parsing, and `nimaime draft` runs in-process from saved
 * observations (no browser; the browser path is covered by test/e2e/draft).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { NimaimeUsageError, parseNimaimeArgs, type DraftArgs } from '../../src/cli/nimaime-args';
import { nimaimeMain } from '../../src/cli/nimaime-main';
import { DEFINITIONS_SEPARATOR, proposeSanmaime } from '../../src/draft';
import { VERSION } from '../../src/version';
import { LOGIN } from './fixtures';

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimaime-draft-test-'));
  tempDirs.push(dir);
  return dir;
}

async function run(argv: string[], cwd: string) {
  let out = '';
  let err = '';
  const code = await nimaimeMain(argv, {
    stdout: { write: (text: string) => (out += text) },
    stderr: { write: (text: string) => (err += text) },
    cwd,
    env: {},
  });
  return { code, out, err };
}

describe('parseNimaimeArgs', () => {
  it('parses draft with defaults', () => {
    expect(parseNimaimeArgs(['draft', 'http://localhost:3000/'])).toEqual({
      command: 'draft',
      source: 'http://localhost:3000/',
      screen: undefined,
      language: 'en',
      out: undefined,
      status: 'draft',
      definitions: undefined,
      observation: undefined,
      groupBy: 'region',
      storageState: undefined,
      wait: undefined,
      timeout: 30000,
      testIdAttribute: undefined,
      llm: undefined,
      browser: 'chromium',
      headed: false,
    } satisfies DraftArgs);
  });

  it('parses every option', () => {
    const args = parseNimaimeArgs([
      'draft',
      'page.html',
      '-s',
      'User Details',
      '-l',
      'ja',
      '-o',
      'specs/x.sanmaime',
      '-d',
      '-',
      '--observation',
      'obs.json',
      '--group-by',
      'flat',
      '--storage-state',
      'auth.json',
      '--wait',
      '#app',
      '--timeout',
      '5000',
      '--test-id-attribute',
      'data-test',
      '--llm',
      './llm.mjs',
      '--browser',
      'firefox',
      '--headed',
    ]);
    expect(args).toMatchObject({
      source: 'page.html',
      screen: 'User Details',
      language: 'ja',
      out: 'specs/x.sanmaime',
      definitions: '-',
      observation: 'obs.json',
      groupBy: 'flat',
      storageState: 'auth.json',
      wait: { selector: '#app' },
      timeout: 5000,
      testIdAttribute: 'data-test',
      llm: './llm.mjs',
      browser: 'firefox',
      headed: true,
    });
    expect(parseNimaimeArgs(['draft', 'x', '--wait', '250'])).toMatchObject({ wait: { ms: 250 } });
  });

  it('parses help and version', () => {
    expect(parseNimaimeArgs(['--help'])).toEqual({ command: 'help', topic: undefined });
    expect(parseNimaimeArgs(['help', 'draft'])).toEqual({ command: 'help', topic: 'draft' });
    expect(parseNimaimeArgs(['draft', '-h'])).toEqual({ command: 'help', topic: 'draft' });
    expect(parseNimaimeArgs(['-v'])).toEqual({ command: 'version' });
  });

  it.each([
    [[], 'Missing command.'],
    [['nope'], "Unknown command 'nope'. Commands: draft, diff, approve."],
    [['draft'], 'nimaime draft needs a URL, an HTML file or an observation file.'],
    [['draft', 'a', 'b'], "Unexpected argument 'b'."],
    [['draft', 'a', '--language', 'fr'], "Invalid --language 'fr'. Use one of: en, ja."],
    [
      ['draft', 'a', '--browser', 'edge'],
      "Invalid --browser 'edge'. Use one of: chromium, firefox, webkit.",
    ],
    [['draft', 'a', '--group-by', 'x'], "Invalid --group-by 'x'. Use one of: region, flat."],
    [
      ['draft', 'a', '--timeout', 'soon'],
      "Option --timeout needs a number of milliseconds, got 'soon'.",
    ],
    [['draft', 'a', '--screen', ' '], 'Option --screen needs a name.'],
    [['draft', 'a', '--out', ''], 'Option --out needs a value.'],
    [['draft', 'a', '--bogus'], "Unknown option '--bogus'"],
    [['draft', 'a', '--status', 'done'], "Invalid --status 'done'. Use one of: draft, approved."],
    [['draft', 'a', '--json'], 'Option --json is not an option of nimaime draft.'],
  ])('rejects %j', (argv, message) => {
    expect(() => parseNimaimeArgs(argv)).toThrow(NimaimeUsageError);
    expect(() => parseNimaimeArgs(argv)).toThrow(message);
  });
});

describe('nimaime', () => {
  it('prints help and version', async () => {
    const dir = tempDir();
    const help = await run(['--help'], dir);
    expect(help.code).toBe(0);
    expect(help.out).toContain('Usage: nimaime <command> [options]');
    expect(help.out).toContain('  draft      Observe a live screen');
    const draftHelp = await run(['draft', '--help'], dir);
    expect(draftHelp.out).toContain('Usage: nimaime draft <url | file.html | observation.json>');
    expect((await run(['--version'], dir)).out).toBe(`${VERSION}\n`);
    const bad = await run(['nope'], dir);
    expect(bad.code).toBe(2);
    expect(bad.err).toBe(
      "nimaime: Unknown command 'nope'. Commands: draft, diff, approve.\nRun 'nimaime --help' for usage.\n",
    );
    expect((await run(['help', 'nope'], dir)).code).toBe(2);
  });

  it('drafts from a saved observation to stdout, with definitions after a separator', async () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'login.json'), JSON.stringify(LOGIN));
    const result = await run(['draft', 'login.json', '--screen', 'Login', '-d', '-'], dir);
    expect(result.code).toBe(0);
    const expected = proposeSanmaime(LOGIN, { screen: 'Login' });
    expect(result.out).toBe(
      `# status: draft\n${expected.sanmaime}\n${DEFINITIONS_SEPARATOR}\n\n${expected.definitions}`,
    );
    expect(result.err).toBe(
      'Drafted Screen "Login" from http://localhost:3000/login: 3 elements, 4 targets (rule-based). Review it before committing.\n',
    );
  });

  it('writes the draft, the definitions and the observation to files', async () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'login.json'), JSON.stringify(LOGIN));
    const result = await run(
      [
        'draft',
        'login.json',
        '-l',
        'ja',
        '-o',
        'specs/login.sanmaime',
        '-d',
        'defs/login.ts',
        '--observation',
        'copy.json',
      ],
      dir,
    );
    expect(result.code).toBe(0);
    expect(result.out).toBe('');
    // The screen name defaults to the page title.
    const expected = proposeSanmaime(LOGIN, { screen: 'Log in', language: 'ja' });
    const written = fs.readFileSync(path.join(dir, 'specs/login.sanmaime'), 'utf8');
    expect(written).toBe(`# status: draft\n${expected.sanmaime}`);
    expect(written.split('\n').slice(0, 2)).toEqual(['# status: draft', '# language: ja']);
    expect(fs.readFileSync(path.join(dir, 'defs/login.ts'), 'utf8')).toBe(expected.definitions);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'copy.json'), 'utf8'))).toEqual(LOGIN);
    expect(result.err).toContain('Wrote the Sanmaime draft to specs/login.sanmaime\n');
    expect(result.err).toContain('Wrote the definitions draft to defs/login.ts\n');
  });

  it('refines the draft with an --llm module and reports rejected answers', async () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'login.json'), JSON.stringify(LOGIN));
    fs.writeFileSync(
      path.join(dir, 'llm.mjs'),
      `let calls = 0;
export default async function adapter(request) {
  calls++;
  if (calls === 1) return 'not sanmaime';
  return 'Screen: Login\\n\\n  Element: Login Form\\n    Show: Password\\n';
}
`,
    );
    const result = await run(['draft', 'login.json', '-s', 'Login', '--llm', './llm.mjs'], dir);
    expect(result.code).toBe(0);
    expect(result.out).toBe(
      '# status: draft\nScreen: Login\n\n  Element: Login Form\n    Show: Password\n',
    );
    expect(result.err).toContain('warning: LLM answer 1 rejected:\n  1:1: error SANMAIME_E001');
    expect(result.err).toContain('1 element, 1 target (llm)');
  });

  it('exits with 2 for missing files, bad observations and bad --llm modules', async () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'login.json'), JSON.stringify(LOGIN));
    fs.writeFileSync(path.join(dir, 'other.json'), '{"hello": 1}');
    fs.writeFileSync(path.join(dir, 'broken.json'), '{');
    fs.writeFileSync(path.join(dir, 'nodefault.mjs'), 'export const x = 1;\n');
    const missing = await run(['draft', 'nope.html'], dir);
    expect(missing).toMatchObject({ code: 2, out: '' });
    expect(missing.err).toContain('No such file: nope.html');
    const other = await run(['draft', 'other.json'], dir);
    expect(other.code).toBe(2);
    expect(other.err).toContain('Not an observation: "format" must be "nimaime-observation"');
    expect((await run(['draft', 'broken.json'], dir)).code).toBe(2);
    const noModule = await run(['draft', 'login.json', '--llm', './missing.mjs'], dir);
    expect(noModule.err).toContain("Cannot find the --llm module './missing.mjs'.");
    const noDefault = await run(['draft', 'login.json', '--llm', './nodefault.mjs'], dir);
    expect(noDefault.code).toBe(2);
    expect(noDefault.err).toContain('must export an LlmAdapter function as its default export');
  });

  it('exits with 1 when there is nothing to draft', async () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'empty.json'), JSON.stringify({ ...LOGIN, elements: [] }));
    const result = await run(['draft', 'empty.json', '-s', 'Empty'], dir);
    expect(result.code).toBe(1);
    expect(result.err).toContain('Nothing to propose');
  });
});
