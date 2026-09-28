/**
 * `nimaime diff` and `nimaime approve` against a real page in Chromium: the login page of
 * examples/basic is observed again and compared with hand-written specifications.
 *
 * Run with `npm run test:e2e:draft`. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to use an already
 * installed Chromium whose revision differs from Playwright's.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { nimaimeMain } from '../../../src/cli/nimaime-main';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const LOGIN_HTML = path.join(repoRoot, 'examples', 'basic', 'app', 'login.html');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimaime-diff-e2e-'));

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

async function run(argv: string[]) {
  let out = '';
  let err = '';
  const code = await nimaimeMain(argv, {
    stdout: { write: (text: string) => (out += text) },
    stderr: { write: (text: string) => (err += text) },
    cwd: dir,
    env: process.env,
  });
  return { code, out, err };
}

// What the login page shows, as a reviewer would keep it, with one deliberate difference: the
// spec expects a "Remember me" check box that the page does not have.
const SPEC = `Screen: Login

  Element: Log in
    Show: Log in heading

  Element: Login Form
    Show: Email address
    And: Password
    And: Log in button
    And: Remember me

  Element: Log in button
    When: Input is valid
    Enable

    When: Input is invalid
    Disable
`;

describe('nimaime diff against the login page of examples/basic', () => {
  it('reports the difference with exit code 1', async () => {
    fs.writeFileSync(path.join(dir, 'login.sanmaime'), SPEC);
    const result = await run(['diff', 'login.sanmaime', LOGIN_HTML]);
    expect(result.err).toBe('');
    expect(result.code).toBe(1);
    const url = pathToFileURL(LOGIN_HTML).href;
    expect(result.out).toBe(`Screen: Login  (login.sanmaime vs ${url})

  Element: Log in
    = Show: Log in heading

  Element: Login Form
    = Show: Email address
    = Show: Password
    = Show: Log in button
    - Show: Remember me  (in spec, not observed)

  Not compared (only expectations outside When: blocks are compared):
    Element: Log in button > When: Input is valid
    Element: Log in button > When: Input is invalid

1 expectation differs.
`);
  });

  it('reports no difference (exit 0) once the spec matches, and --json', async () => {
    fs.writeFileSync(path.join(dir, 'fixed.sanmaime'), SPEC.replace('    And: Remember me\n', ''));
    const result = await run(['diff', 'fixed.sanmaime', LOGIN_HTML, '--json']);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out)).toMatchObject({
      identical: true,
      counts: { screens: 0, elements: 0, expectations: 0 },
    });
  });

  it('drafts, approves and compares a draft saved earlier', async () => {
    const draft = await run(['draft', LOGIN_HTML, '-s', 'Login', '-o', 'draft.sanmaime']);
    expect(draft.code).toBe(0);
    const text = fs.readFileSync(path.join(dir, 'draft.sanmaime'), 'utf8');
    expect(text.startsWith('# status: draft\n')).toBe(true);

    const approved = await run(['approve', 'draft.sanmaime']);
    expect(approved).toMatchObject({ code: 0, out: 'Approved draft.sanmaime\n' });
    expect(fs.readFileSync(path.join(dir, 'draft.sanmaime'), 'utf8')).toBe(
      text.replace('# status: draft\n', '# status: approved\n'),
    );

    // The approved draft describes the page as it is: no drift.
    expect((await run(['diff', 'draft.sanmaime', LOGIN_HTML])).code).toBe(0);
    // Two files: the reviewed spec against the draft.
    const files = await run(['diff', 'login.sanmaime', 'draft.sanmaime']);
    expect(files.code).toBe(1);
    expect(files.out).toContain('    - Show: Remember me  (in spec, not in draft.sanmaime)\n');
    // The spec's "Log in button" has only When: blocks; the draft's Disable is not compared.
    expect(files.out).toContain('1 expectation differs.\n');
  });
});
