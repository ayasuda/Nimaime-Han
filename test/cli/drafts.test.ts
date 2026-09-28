/**
 * `nimaime-gen` and `# status: draft` specs (docs/review-workflow.md): drafts are skipped by
 * default, included with `--include-drafts` or the `includeDrafts` config option. Runs in-process
 * over throw-away projects (each test writes its own, so that every config is evaluated once).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseCliArgs } from '../../src/cli/args';
import { main } from '../../src/cli/main';
import { isDraft, partitionDrafts, skippedDraftsMessage } from '../../src/gen/status';
import { parse } from '../../src/parser';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const srcIndex = JSON.stringify(path.join(repoRoot, 'src', 'index').split(path.sep).join('/'));
const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

const DEFINITIONS = `import { createNimaime } from ${srcIndex};
const { defineElement } = createNimaime();
defineElement('Login Form', { 'Email address': ({ page }) => page.getByLabel('Email') });
`;

const APPROVED = `Screen: Login
  Element: Login Form
    Show: Email address
`;

// A draft may use names that have no definition yet, and may even be invalid while it is edited.
const DRAFT = `# status: draft
Screen: Sign Up
  Element: Sign-up Form
    Show: Email address
`;

function project(configOptions = ''): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimaime-drafts-test-'));
  tempDirs.push(dir);
  fs.symlinkSync(path.join(repoRoot, 'node_modules'), path.join(dir, 'node_modules'), 'junction');
  const files: Record<string, string> = {
    'package.json': '{ "type": "module" }\n',
    'playwright.config.ts': `import { defineSanmaimeConfig } from ${srcIndex};
export default { testDir: defineSanmaimeConfig({ specs: 'specs/**/*.sanmaime', definitions: 'definitions/**/*.ts'${configOptions} }) };
`,
    'definitions/login.ts': DEFINITIONS,
    'specs/login.sanmaime': APPROVED,
    'specs/sign-up.sanmaime': DRAFT,
    'specs/broken-draft.sanmaime': '# status: draft\nScreen: Broken\n  Show: nothing\n',
  };
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return dir;
}

async function run(argv: string[], cwd: string) {
  let out = '';
  let err = '';
  const code = await main(argv, {
    stdout: { write: (text: string) => (out += text) },
    stderr: { write: (text: string) => (err += text) },
    cwd,
  });
  return { code, out, err };
}

describe('status helpers', () => {
  const spec = (source: string, file: string) => ({
    file,
    source,
    ...parse(source),
  });

  it('partitions specs by status', () => {
    const approved = spec(APPROVED, 'a');
    const draft = spec(DRAFT, 'b');
    expect(isDraft(approved)).toBe(false);
    expect(isDraft(draft)).toBe(true);
    expect(partitionDrafts([approved, draft], false)).toEqual({
      selected: [approved],
      skipped: [draft],
      included: [],
    });
    expect(partitionDrafts([approved, draft], true)).toEqual({
      selected: [approved, draft],
      skipped: [],
      included: [draft],
    });
  });

  it('words the skipped-drafts line', () => {
    expect(skippedDraftsMessage(0)).toBeUndefined();
    expect(skippedDraftsMessage(1)).toBe(
      'nimaime-gen: 1 draft spec skipped (use --include-drafts).',
    );
    expect(skippedDraftsMessage(2)).toBe(
      'nimaime-gen: 2 draft specs skipped (use --include-drafts).',
    );
  });

  it('parses --include-drafts', () => {
    expect(parseCliArgs([]).includeDrafts).toBe(false);
    expect(parseCliArgs(['check', '--include-drafts']).includeDrafts).toBe(true);
  });
});

describe('nimaime-gen with draft specs', () => {
  it('skips drafts by default and says so on stderr', async () => {
    const dir = project();
    const result = await run([], dir);
    expect(result.err).toBe('nimaime-gen: 2 draft specs skipped (use --include-drafts).\n');
    expect(result.code).toBe(0);
    expect(result.out).toBe('Generated 1 spec file (1 test) into .sanmaime-gen\n');
    expect(fs.readdirSync(path.join(dir, '.sanmaime-gen', 'specs'))).toEqual(['login.spec.ts']);
  });

  it('reports drafts as info in check', async () => {
    const dir = project();
    const result = await run(['check'], dir);
    expect(result.code).toBe(0);
    expect(result.err.split('\n')).toEqual([
      'nimaime-gen: 2 draft specs skipped (use --include-drafts).',
      'specs/broken-draft.sanmaime: info: draft (# status: draft), not generated; approve it with "nimaime approve" when reviewed.',
      'specs/sign-up.sanmaime: info: draft (# status: draft), not generated; approve it with "nimaime approve" when reviewed.',
      '',
    ]);
  });

  it('includes drafts with --include-drafts: they are checked like approved specs', async () => {
    const dir = project();
    const result = await run(['check', '--include-drafts', '--format', 'compact'], dir);
    expect(result.code).toBe(1);
    expect(result.err).not.toContain('skipped');
    expect(result.err).toContain(
      'specs/sign-up.sanmaime: info: draft (# status: draft), included by --include-drafts / includeDrafts.',
    );
    expect(result.err).toContain('specs/broken-draft.sanmaime:3:3: error SANMAIME_E006');
    expect(result.err).toContain('Element "Sign-up Form"');
  });

  it('includes drafts with the includeDrafts config option, marked [draft] by export', async () => {
    const dir = project(', includeDrafts: true');
    fs.rmSync(path.join(dir, 'specs', 'broken-draft.sanmaime'));
    fs.appendFileSync(
      path.join(dir, 'definitions', 'login.ts'),
      "defineElement('Sign-up Form', { 'Email address': ({ page }) => page.getByLabel('Email') });\n",
    );
    const result = await run(['export'], dir);
    expect(result.err).toBe('');
    expect(result.code).toBe(0);
    expect(result.out).toBe(
      [
        'specs/login.sanmaime',
        '  Screen: Login > Element: Login Form > Always',
        'specs/sign-up.sanmaime  [draft]',
        '  Screen: Sign Up > Element: Sign-up Form > Always',
        '2 tests in 2 spec files.',
        '',
      ].join('\n'),
    );
  });
});
