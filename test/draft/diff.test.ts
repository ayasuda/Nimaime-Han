/**
 * `nimaime diff`: the comparison of two documents (pure, on hand-written documents), its text
 * rendering, and the command in-process — two `.sanmaime` files, or a spec and a saved observation
 * (no browser; the browser path is covered by test/e2e/draft).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseNimaimeArgs, type DiffArgs } from '../../src/cli/nimaime-args';
import { nimaimeMain } from '../../src/cli/nimaime-main';
import { diffDocuments, diffSummary, formatDiff, type SanmaimeDiff } from '../../src/draft';
import { parse, type SanmaimeDocument } from '../../src/parser';
import { LOGIN } from './fixtures';

function doc(source: string): SanmaimeDocument {
  const { document, diagnostics } = parse(source);
  expect(diagnostics).toEqual([]);
  return document;
}

const lines = (...ls: string[]): string => `${ls.join('\n')}\n`;

const SPEC = lines(
  'Screen: Login',
  '  Element: Login Form',
  '    Show: Email address',
  '    And: Password',
  '    And: Login button',
);

describe('diffDocuments', () => {
  it('finds nothing in identical documents', () => {
    const diff = diffDocuments(doc(SPEC), doc(SPEC));
    expect(diff).toEqual({
      identical: true,
      counts: { screens: 0, elements: 0, expectations: 0 },
      screens: [
        {
          name: 'Login',
          change: 'matched',
          notCompared: [],
          elements: [
            {
              name: 'Login Form',
              change: 'matched',
              expectations: [
                { change: 'same', kind: 'show', target: 'Email address' },
                { change: 'same', kind: 'show', target: 'Password' },
                { change: 'same', kind: 'show', target: 'Login button' },
              ],
            },
          ],
        },
      ],
    } satisfies SanmaimeDiff);
  });

  it('reports removed and added targets', () => {
    const other = lines(
      'Screen: Login',
      '  Element: Login Form',
      '    Show: Email address',
      '    And: Password',
      '    And: Remember me',
    );
    const diff = diffDocuments(doc(SPEC), doc(other));
    expect(diff.identical).toBe(false);
    expect(diff.counts).toEqual({ screens: 0, elements: 0, expectations: 2 });
    expect(diff.screens[0]?.elements[0]?.expectations).toEqual([
      { change: 'same', kind: 'show', target: 'Email address' },
      { change: 'same', kind: 'show', target: 'Password' },
      { change: 'removed', kind: 'show', target: 'Login button' },
      { change: 'added', kind: 'show', target: 'Remember me' },
    ]);
  });

  it('compares Enable/Disable only when both sides state one, and Hide: with Show:', () => {
    const spec = lines(
      'Screen: S',
      '  Element: Button',
      '    Disable',
      '  Element: Stateless',
      '    Show: Label',
      '  Element: Form',
      '    Hide: Error',
      '    Hide: Spinner',
    );
    const other = lines(
      'Screen: S',
      '  Element: Button',
      '    Enable',
      '  Element: Stateless',
      '    Show: Label',
      '    Enable',
      '  Element: Form',
      '    Show: Error',
    );
    const diff = diffDocuments(doc(spec), doc(other));
    expect(diff.counts).toEqual({ screens: 0, elements: 0, expectations: 2 });
    expect(diff.screens[0]?.elements.map((e) => e.expectations)).toEqual([
      [{ change: 'changed', kind: 'disable', otherKind: 'enable' }],
      [{ change: 'same', kind: 'show', target: 'Label' }],
      [
        { change: 'changed', kind: 'hide', target: 'Error', otherKind: 'show' },
        // A draft lists what is visible: a target it does not mention agrees with Hide:.
        { change: 'same', kind: 'hide', target: 'Spinner' },
      ],
    ]);
  });

  it('reports elements on one side only, and counts them once', () => {
    const other = lines(
      'Screen: Login',
      '  Element: Sign-up link',
      '    Show: Sign up',
      '  Element: Login Form',
      '    Show: Email address',
      '    And: Password',
      '    And: Login button',
    );
    const spec = `${SPEC}  Element: Footer\n    Show: Terms\n`;
    const diff = diffDocuments(doc(spec), doc(other));
    expect(diff.counts).toEqual({ screens: 0, elements: 2, expectations: 0 });
    expect(diff.screens[0]?.elements.map((e) => [e.name, e.change, e.expectations])).toEqual([
      ['Login Form', 'matched', expect.any(Array)],
      ['Footer', 'removed', [{ change: 'removed', kind: 'show', target: 'Terms' }]],
      ['Sign-up link', 'added', [{ change: 'added', kind: 'show', target: 'Sign up' }]],
    ]);
  });

  it('does not compare When: blocks, and does not report their targets as added', () => {
    const spec = lines(
      'Screen: Login',
      '  Element: Login Form',
      '    Show: Email address',
      '    When: Remembered',
      '    Show: Remember me',
      '  Element: Login Button',
      '    When: Input is valid',
      '    Enable',
    );
    const other = lines(
      'Screen: Login',
      '  Element: Login Form',
      '    Show: Email address',
      '    And: Remember me',
      '  Element: Login Button',
      '    Disable',
    );
    const diff = diffDocuments(doc(spec), doc(other));
    expect(diff.identical).toBe(true);
    expect(diff.screens[0]?.notCompared).toEqual([
      { side: 'spec', element: 'Login Form', condition: 'Remembered' },
      { side: 'spec', element: 'Login Button', condition: 'Input is valid' },
    ]);
    // The element with nothing but When: blocks is matched but has nothing to compare.
    expect(diff.screens[0]?.elements.map((e) => e.name)).toEqual(['Login Form']);
  });

  it('matches screens by name', () => {
    const diff = diffDocuments(doc(SPEC), doc(SPEC.replace('Login', 'Sign in')));
    expect(diff.counts).toEqual({ screens: 2, elements: 0, expectations: 0 });
    expect(diff.screens.map((s) => [s.name, s.change])).toEqual([
      ['Login', 'removed'],
      ['Sign in', 'added'],
    ]);
  });
});

describe('formatDiff', () => {
  it('renders the example of docs/review-workflow.md', () => {
    const spec = lines(
      'Screen: Login',
      '  Element: Login Form',
      '    Show: Email address',
      '    And: Password',
      '    And: Login button',
      '  Element: Login Button',
      '    When: Input is valid',
      '    Enable',
      '    When: Input is invalid',
      '    Disable',
    );
    const other = lines(
      'Screen: Login',
      '  Element: Login Form',
      '    Show: Email address',
      '    And: Password',
      '    And: Remember me',
      '  Element: Sign-up link',
      '    Show: Sign up',
    );
    const text = formatDiff(diffDocuments(doc(spec), doc(other)), {
      spec: 'specs/login.sanmaime',
      other: 'http://localhost:3000/login',
    });
    expect(text).toBe(
      lines(
        'Screen: Login  (specs/login.sanmaime vs http://localhost:3000/login)',
        '',
        '  Element: Login Form',
        '    = Show: Email address',
        '    = Show: Password',
        '    - Show: Login button  (in spec, not observed)',
        '    + Show: Remember me   (observed, not in spec)',
        '',
        '  Element: Sign-up link   (observed, not in spec)',
        '    + Show: Sign up',
        '',
        '  Not compared (only expectations outside When: blocks are compared):',
        '    Element: Login Button > When: Input is valid',
        '    Element: Login Button > When: Input is invalid',
        '',
        '1 element and 2 expectations differ.',
      ),
    );
  });

  it("uses the spec's keywords and names the other file", () => {
    const spec = lines('# language: ja', '画面: ログイン', '  要素: ボタン', '    無効');
    const other = lines('# language: ja', '画面: ログイン', '  要素: ボタン', '    有効');
    const text = formatDiff(diffDocuments(doc(spec), doc(other)), {
      spec: 'a.sanmaime',
      other: 'b.sanmaime',
      otherWord: 'b.sanmaime',
      language: 'ja',
    });
    expect(text).toBe(
      lines(
        '画面: ログイン  (a.sanmaime vs b.sanmaime)',
        '',
        '  要素: ボタン',
        '    ! 無効  (in spec; b.sanmaime: 有効)',
        '',
        '1 expectation differs.',
      ),
    );
  });

  it('summarises', () => {
    expect(diffSummary({ screens: 0, elements: 0, expectations: 0 })).toBe('No differences.');
    expect(diffSummary({ screens: 1, elements: 2, expectations: 1 })).toBe(
      '1 screen, 2 elements and 1 expectation differ.',
    );
  });
});

// ---------------------------------------------------------------------------------------------
// The command
// ---------------------------------------------------------------------------------------------

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function project(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimaime-diff-test-'));
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

describe('parseNimaimeArgs diff', () => {
  it('parses the two sources and the options', () => {
    expect(parseNimaimeArgs(['diff', 'a.sanmaime', 'http://x/'])).toEqual({
      command: 'diff',
      spec: 'a.sanmaime',
      other: 'http://x/',
      screen: undefined,
      language: undefined,
      json: false,
      observation: undefined,
      groupBy: 'region',
      storageState: undefined,
      wait: undefined,
      timeout: 30000,
      testIdAttribute: undefined,
      browser: 'chromium',
      headed: false,
    } satisfies DiffArgs);
    expect(
      parseNimaimeArgs(['diff', 'a', 'b', '--json', '-s', 'Login', '-l', 'ja', '--wait', '10']),
    ).toMatchObject({ json: true, screen: 'Login', language: 'ja', wait: { ms: 10 } });
  });

  it.each([
    [['diff'], 'nimaime diff needs a specification and'],
    [['diff', 'a'], 'nimaime diff needs a specification and'],
    [['diff', 'a', 'b', 'c'], "Unexpected argument 'c'."],
    [['diff', 'a', 'b', '--llm', 'x'], 'Option --llm is not an option of nimaime diff.'],
    [['diff', 'a', 'b', '--out', 'x'], 'Option --out is not an option of nimaime diff.'],
  ])('rejects %j', (argv, message) => {
    expect(() => parseNimaimeArgs(argv)).toThrow(message);
  });
});

describe('nimaime diff', () => {
  const DRAFT = lines(
    '# status: draft',
    'Screen: Login',
    '  Element: Login Form',
    '    Show: Email address',
    '    And: Password',
    '    And: Remember me',
  );

  it('compares two .sanmaime files: exit 1 with differences, 0 without', async () => {
    const dir = project({ 'specs/login.sanmaime': SPEC, 'login.draft.sanmaime': DRAFT });
    const result = await run(['diff', 'specs/login.sanmaime', 'login.draft.sanmaime'], dir);
    expect(result.err).toBe('');
    expect(result.code).toBe(1);
    expect(result.out).toBe(
      lines(
        `Screen: Login  (${path.join('specs', 'login.sanmaime')} vs login.draft.sanmaime)`,
        '',
        '  Element: Login Form',
        '    = Show: Email address',
        '    = Show: Password',
        '    - Show: Login button  (in spec, not in login.draft.sanmaime)',
        '    + Show: Remember me   (in login.draft.sanmaime, not in spec)',
        '',
        '2 expectations differ.',
      ),
    );
    const same = await run(['diff', 'specs/login.sanmaime', 'specs/login.sanmaime'], dir);
    expect(same.code).toBe(0);
    expect(same.out.endsWith('\nNo differences.\n')).toBe(true);
  });

  it('prints JSON with --json', async () => {
    const dir = project({ 'a.sanmaime': SPEC, 'b.sanmaime': DRAFT });
    const result = await run(['diff', 'a.sanmaime', 'b.sanmaime', '--json'], dir);
    expect(result.code).toBe(1);
    const json = JSON.parse(result.out) as SanmaimeDiff & { spec: string; other: string };
    expect(json).toMatchObject({
      spec: 'a.sanmaime',
      other: 'b.sanmaime',
      identical: false,
      counts: { screens: 0, elements: 0, expectations: 2 },
    });
  });

  it('re-proposes from a saved observation with the spec screen name', async () => {
    const spec = lines(
      'Screen: Login',
      '  Element: Log in',
      '    Show: Log in heading',
      '  Element: Login Form',
      '    Show: Email address',
      '    And: Password',
      '    And: Log in button',
      '  Element: Log in button',
      '    Disable',
    );
    const dir = project({ 'login.sanmaime': spec, 'login.json': JSON.stringify(LOGIN) });
    const result = await run(['diff', 'login.sanmaime', 'login.json'], dir);
    expect(result.err).toBe('');
    expect(result.out).toContain('Screen: Login  (login.sanmaime vs http://localhost:3000/login)');
    expect(result.out).toContain('    = Disable\n');
    expect(result.out.endsWith('\nNo differences.\n')).toBe(true);
    expect(result.code).toBe(0);
  });

  it('exits with 2 when it cannot compare', async () => {
    const dir = project({
      'bad.sanmaime': 'Screen: S\n',
      'two.sanmaime': `${SPEC}Screen: Other\n  Element: E\n    Enable\n`,
      'ok.sanmaime': SPEC,
      'login.json': JSON.stringify(LOGIN),
    });
    const bad = await run(['diff', 'bad.sanmaime', 'ok.sanmaime'], dir);
    expect(bad.code).toBe(2);
    expect(bad.err).toBe(
      "bad.sanmaime:1:1: error SANMAIME_E010: Screen 'S' has no elements.\n" +
        'nimaime diff: bad.sanmaime has errors; fix them before comparing.\n',
    );
    const missing = await run(['diff', 'nope.sanmaime', 'ok.sanmaime'], dir);
    expect(missing).toMatchObject({ code: 2, err: 'nimaime diff: No such file: nope.sanmaime\n' });
    const several = await run(['diff', 'two.sanmaime', 'login.json'], dir);
    expect(several.code).toBe(2);
    expect(several.err).toContain('has several screens (Login, Other); choose one with --screen.');
    const chosen = await run(['diff', 'two.sanmaime', 'login.json', '-s', 'Login'], dir);
    expect(chosen.code).toBe(1);
    const unknown = await run(['diff', 'two.sanmaime', 'login.json', '-s', 'Nope'], dir);
    expect(unknown.err).toContain('has no Screen "Nope"');
    const noSource = await run(['diff', 'ok.sanmaime', 'nope.html'], dir);
    expect(noSource.code).toBe(2);
    expect(noSource.err).toContain('No such file: nope.html');
    expect((await run(['diff', '--help'], dir)).out).toContain('Usage: nimaime diff');
  });
});
