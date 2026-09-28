/** `nimaime approve` (src/draft/approve.ts), in-process on temp files. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseNimaimeArgs } from '../../src/cli/nimaime-args';
import { nimaimeMain } from '../../src/cli/nimaime-main';
import { approveSource } from '../../src/draft';

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function project(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimaime-approve-test-'));
  tempDirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
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

const read = (dir: string, name: string): string => fs.readFileSync(path.join(dir, name), 'utf8');

const DRAFT =
  '# status: draft\n# Draft proposed by nimaime draft.\n\nScreen: S\n  Element: E\n    Show: A\n';
const DRAFT_CRLF = `\uFEFF${DRAFT.replaceAll('\n', '\r\n')}`;
const INVALID = '# status: draft\nScreen: S\n  Element: E\n    Show: A\n    Show: A\n';

describe('parseNimaimeArgs approve', () => {
  it('parses files and options', () => {
    expect(parseNimaimeArgs(['approve', 'a.sanmaime', 'b.sanmaime'])).toEqual({
      command: 'approve',
      files: ['a.sanmaime', 'b.sanmaime'],
      remove: false,
      force: false,
      language: undefined,
    });
    expect(
      parseNimaimeArgs(['approve', 'a.sanmaime', '--remove', '--force', '-l', 'ja']),
    ).toMatchObject({ remove: true, force: true, language: 'ja' });
  });

  it('rejects a missing file argument and options of other commands', () => {
    expect(() => parseNimaimeArgs(['approve'])).toThrow('nimaime approve needs one or more files.');
    expect(() => parseNimaimeArgs(['approve', 'a', '--json'])).toThrow(
      'Option --json is not an option of nimaime approve.',
    );
  });
});

describe('approveSource', () => {
  it('rewrites or removes the directive and reports errors of the result', () => {
    expect(approveSource(DRAFT)).toEqual({
      text: DRAFT.replace('draft\n', 'approved\n'),
      errors: [],
    });
    expect(approveSource(DRAFT, { remove: true }).text).toBe(
      DRAFT.slice('# status: draft\n'.length),
    );
    expect(approveSource(INVALID).errors.map((d) => d.code)).toEqual(['SANMAIME_E014']);
    // A Japanese file without # language: parses with the given default language.
    const ja = '# status: draft\n画面: S\n  要素: E\n    表示: A\n';
    expect(approveSource(ja).errors.length).toBeGreaterThan(0);
    expect(approveSource(ja, { language: 'ja' }).errors).toEqual([]);
  });
});

describe('nimaime approve', () => {
  it('rewrites # status: draft to approved, preserving CRLF and the BOM', async () => {
    const dir = project({ 'specs/a.sanmaime': DRAFT, 'specs/b.sanmaime': DRAFT_CRLF });
    const result = await run(['approve', 'specs/a.sanmaime', 'specs/b.sanmaime'], dir);
    expect(result).toEqual({
      code: 0,
      out: `Approved ${path.join('specs', 'a.sanmaime')}\nApproved ${path.join('specs', 'b.sanmaime')}\n`,
      err: '',
    });
    expect(read(dir, 'specs/a.sanmaime')).toBe(
      DRAFT.replace('# status: draft', '# status: approved'),
    );
    expect(read(dir, 'specs/b.sanmaime')).toBe(
      DRAFT_CRLF.replace('# status: draft', '# status: approved'),
    );
  });

  it('deletes the line with --remove', async () => {
    const dir = project({ 'a.sanmaime': DRAFT_CRLF });
    expect((await run(['approve', '--remove', 'a.sanmaime'], dir)).code).toBe(0);
    expect(read(dir, 'a.sanmaime')).toBe(DRAFT_CRLF.replace('# status: draft\r\n', ''));
  });

  it('leaves approved files alone', async () => {
    const body = 'Screen: S\n  Element: E\n    Show: A\n';
    const dir = project({ 'a.sanmaime': body, 'b.sanmaime': `# status: approved\n${body}` });
    const result = await run(['approve', 'a.sanmaime', 'b.sanmaime'], dir);
    expect(result.code).toBe(0);
    expect(result.out).toBe('a.sanmaime is already approved\nb.sanmaime is already approved\n');
    expect(read(dir, 'a.sanmaime')).toBe(body);
    expect(read(dir, 'b.sanmaime')).toBe(`# status: approved\n${body}`);
  });

  it('refuses a file with errors (exit 1) unless --force is given', async () => {
    const dir = project({ 'bad.sanmaime': INVALID, 'good.sanmaime': DRAFT });
    const result = await run(['approve', 'bad.sanmaime', 'good.sanmaime'], dir);
    expect(result.code).toBe(1);
    expect(result.out).toBe('Approved good.sanmaime\n');
    expect(result.err).toBe(
      "bad.sanmaime:5:5: error SANMAIME_E014: 'A' is already asserted in this block (line 4).\n" +
        'nimaime approve: bad.sanmaime was not approved: 1 error. An approved specification must be valid; fix it, or use --force.\n',
    );
    expect(read(dir, 'bad.sanmaime')).toBe(INVALID);

    const forced = await run(['approve', '--force', 'bad.sanmaime'], dir);
    expect(forced.code).toBe(0);
    expect(forced.err).toContain('warning: approving bad.sanmaime despite its errors (--force).');
    expect(read(dir, 'bad.sanmaime')).toBe(INVALID.replace('draft', 'approved'));
  });

  it('exits with 2 for a missing file and still approves the others', async () => {
    const dir = project({ 'a.sanmaime': DRAFT });
    const result = await run(['approve', 'nope.sanmaime', 'a.sanmaime'], dir);
    expect(result.code).toBe(2);
    expect(result.err).toBe('nimaime approve: No such file: nope.sanmaime\n');
    expect(result.out).toBe('Approved a.sanmaime\n');
  });

  it('prints its help', async () => {
    const result = await run(['approve', '--help'], project({}));
    expect(result.code).toBe(0);
    expect(result.out).toContain('Usage: nimaime approve <file.sanmaime...> [options]');
  });
});
