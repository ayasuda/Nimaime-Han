/**
 * Definition snippets for missing definitions (`generateSnippets`) and the missing-definition /
 * parser-diagnostic reports that print them (`formatMissing`, `formatDiagnostics`).
 */
import path from 'node:path';
import type { Page } from '@playwright/test';
import prettier from 'prettier';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  formatDiagnostics,
  formatMissing,
  generateSnippets,
  matchSpecs,
  type MatchResult,
  type MissingDefinition,
  type ParsedSpec,
} from '../../src/gen';
import { createNimaime } from '../../src/index';
import { parse } from '../../src/parser';
import { getRegistry, resetRegistry } from '../../src/runtime/index';

const root = path.resolve('/project');
const { defineScreen, defineElement } = createNimaime();
const locator = ({ page }: { page: Page }) => page.locator('x');

function spec(source: string, uri = 'specs/test.sanmaime'): ParsedSpec {
  const { document, diagnostics } = parse(source, { uri });
  return { file: path.join(root, uri), source, document, diagnostics };
}

function match(...specs: ParsedSpec[]): MatchResult {
  return matchSpecs(specs, getRegistry());
}

async function expectPrettier(content: string, quotes: 'single' | 'double'): Promise<void> {
  const formatted = await prettier.format(content, {
    parser: 'typescript',
    singleQuote: quotes === 'single',
    trailingComma: 'all',
    printWidth: 100,
  });
  expect(content).toBe(formatted);
}

const USER_DETAILS = `Screen: User Details

  Element: User Information
    Show: Username

    When: Viewing your own profile
    Show: Full name
    And: Email address

  Element: Edit Button
    When: Viewing your own profile
    Enable
`;

beforeEach(() => {
  resetRegistry();
});

describe('generateSnippets', () => {
  it('defines a missing element with every target the specs use, and missing conditions', async () => {
    const result = match(spec(USER_DETAILS));
    const snippets = generateSnippets(result.missing, {
      quotes: 'single',
      documents: result.documents,
    });
    expect(snippets).toBe(
      [
        "// import { createNimaime } from 'nimaime-han';",
        '// const { defineElement, defineCondition } = createNimaime(test);',
        '',
        "defineElement('User Information', {",
        "  Username: ({ page }) => page.getByTestId('TODO'),",
        "  'Full name': ({ page }) => page.getByTestId('TODO'),",
        "  'Email address': ({ page }) => page.getByTestId('TODO'),",
        '});',
        '',
        "defineElement('Edit Button', ({ page }) => page.getByTestId('TODO'));",
        '',
        `// Used on Screen "User Details" (add { screen: 'User Details' } to define it for that screen only).`,
        "defineCondition('Viewing your own profile', async ({ page }) => {",
        '  // TODO: bring the screen into this state',
        '});',
        '',
      ].join('\n'),
    );
    await expectPrettier(snippets, 'single');
  });

  it('uses the self + targets form when an undefined element uses Enable / Disable and targets', async () => {
    const result = match(
      spec('Screen: A\n  Element: Save\n    Show: Label\n\n    When: Dirty\n    Enable\n'),
    );
    const snippets = generateSnippets(result.missing, {
      quotes: 'double',
      documents: result.documents,
    });
    expect(snippets).toContain(
      [
        'defineElement("Save", ({ page }) => page.getByTestId("TODO"), {',
        '  Label: ({ page }) => page.getByTestId("TODO"),',
        '});',
      ].join('\n'),
    );
    expect(snippets).toContain('// import { createNimaime } from "nimaime-han";');
    await expectPrettier(snippets, 'double');
  });

  it('prints the lines to add to an existing element for missing targets and self', () => {
    defineElement('Login Form', { Password: locator });
    const result = match(
      spec(
        'Screen: Login\n  Element: Login Form\n    Show: Password\n    And: Remember me\n    And: Email\n\n    When: Filled\n    Enable\n',
      ),
    );
    const missing = result.missing.filter((entry) => entry.kind !== 'condition');
    expect(generateSnippets(missing, { quotes: 'single', documents: result.documents })).toBe(
      [
        "// import { createNimaime } from 'nimaime-han';",
        '// const { defineElement } = createNimaime(test);',
        '',
        "// The existing defineElement('Login Form', …) has no locator for the element itself,",
        '// which Enable / Disable need. Pass it as the second argument, before the targets:',
        "// defineElement('Login Form', ({ page }) => page.getByTestId('TODO'), { … });",
        "// Add to the existing defineElement('Login Form', { … }):",
        "  'Remember me': ({ page }) => page.getByTestId('TODO'),",
        "  Email: ({ page }) => page.getByTestId('TODO'),",
        '',
      ].join('\n'),
    );
  });

  it('dedupes targets and conditions reported in several files and screens', () => {
    defineElement('Panel', { Title: locator });
    const a = spec(
      'Screen: A\n  Element: Panel\n    Show: Title\n    And: Body\n\n    When: Busy\n    Show: Spinner\n',
      'specs/a.sanmaime',
    );
    const b = spec(
      'Screen: B\n  Element: Panel\n    Show: Body\n\n    When: Busy\n    Show: Spinner\n',
      'specs/b.sanmaime',
    );
    const result = match(a, b);
    expect(result.missing.filter((entry) => entry.kind === 'target')).toHaveLength(4);
    const snippets = generateSnippets(result.missing, { quotes: 'single' });
    expect(snippets.match(/ {2}Body: /g)).toHaveLength(1);
    expect(snippets.match(/ {2}Spinner: /g)).toHaveLength(1);
    expect(snippets.match(/defineCondition\('Busy'/g)).toHaveLength(1);
    expect(snippets).toContain('// Used on Screens "A", "B".\n');
  });

  it('prints defineScreen only when asked', async () => {
    defineElement('Panel', { Title: locator });
    const result = match(spec('Screen: Home\n  Element: Panel\n    Show: Title\n'));
    expect(result.missing.map((entry) => entry.kind)).toEqual(['screen']);
    expect(generateSnippets(result.missing, { quotes: 'single' })).toBe('');
    const snippets = generateSnippets(result.missing, { quotes: 'single', includeScreens: true });
    expect(snippets).toBe(
      [
        "// import { createNimaime } from 'nimaime-han';",
        '// const { defineScreen } = createNimaime(test);',
        '',
        "defineScreen('Home', {",
        '  open: async ({ page }) => {',
        "    await page.goto('/TODO');",
        '  },',
        '});',
        '',
      ].join('\n'),
    );
    await expectPrettier(snippets, 'single');
  });

  it('escapes quotes and keeps Japanese names as they are', async () => {
    const result = match(
      spec(`# language: ja
画面: ユーザー詳細
  要素: ユーザー情報
    表示: 氏名
    かつ: It's "quoted"

    条件: 他のユーザーのプロフィールを閲覧している
    非表示: メールアドレス
`),
    );
    const single = generateSnippets(result.missing, {
      quotes: 'single',
      documents: result.documents,
    });
    expect(single).toContain("defineElement('ユーザー情報', {\n  氏名: ({ page })");
    expect(single).toContain(`  'It\\'s "quoted"': ({ page }) => page.getByTestId('TODO'),`);
    expect(single).toContain(
      "defineCondition('他のユーザーのプロフィールを閲覧している', async ({ page }) => {",
    );
    await expectPrettier(single, 'single');
    const double = generateSnippets(result.missing, {
      quotes: 'double',
      documents: result.documents,
    });
    // Like Prettier: the quote that needs fewer escapes wins over the preferred one.
    expect(double).toContain(`  'It\\'s "quoted"': ({ page }) => page.getByTestId("TODO"),`);
    expect(double).toContain('defineElement("ユーザー情報", {');
    await expectPrettier(double, 'double');
  });

  it('breaks a target line that does not fit as Prettier does', async () => {
    const long = `A ${'very '.repeat(10)}long target`;
    const longer = `A ${'very '.repeat(14)}long target`;
    const result = match(
      spec(`Screen: A\n  Element: Box\n    Show: ${long}\n    And: ${longer}\n`),
    );
    const snippets = generateSnippets(result.missing, {
      quotes: 'single',
      documents: result.documents,
    });
    expect(snippets).toContain(`  '${long}': ({ page }) =>\n    page.getByTestId('TODO'),\n`);
    expect(snippets).toContain(`  '${longer}': ({\n    page,\n  }) => page.getByTestId('TODO'),\n`);
    await expectPrettier(snippets, 'single');
  });

  it('leaves a TODO for an undefined element when the documents are not given', () => {
    const result = match(spec('Screen: A\n  Element: Box\n    Show: Lid\n'));
    expect(generateSnippets(result.missing, { quotes: 'single' })).toContain(
      "defineElement('Box', {\n  // TODO: the targets the specs use\n});",
    );
  });

  it('returns an empty string for nothing', () => {
    expect(generateSnippets([], { quotes: 'single' })).toBe('');
  });
});

/** Every kind of missing definition, in two files, reported out of order. */
function missingFixture(): MatchResult {
  defineScreen('Login', {});
  defineElement('Login Form', { Password: locator });
  defineElement('Login Button', { Label: locator });
  const login = spec(
    `Screen: Login

  Element: Login Form
    Show: Password
    And: Remember me

  Element: Login Button
    When: Input is valid
    Enable

  Element: Banner
    Show: Text
`,
    'specs/login.sanmaime',
  );
  const details = spec(
    `Screen: User Information Page
  Element: Login Form
    When: Viewing your own profile
    Show: Password
`,
    'specs/details.sanmaime',
  );
  return match(login, details);
}

describe('formatMissing', () => {
  it('prints the pretty report with snippets, sorted by file and position', () => {
    const result = missingFixture();
    const lines = formatMissing(result.missing, {
      cwd: root,
      documents: result.documents,
      quotes: 'single',
    });
    expect(lines.join('\n')).toMatchInlineSnapshot(`
      "Missing definitions: 5

        specs/details.sanmaime:3:5
          Condition "Viewing your own profile" is not defined

        specs/login.sanmaime:5:5
          Element "Login Form" has no definition for "Remember me"

        specs/login.sanmaime:8:5
          Condition "Input is valid" is not defined

        specs/login.sanmaime:9:5
          Element "Login Button" has no self locator (needed by Enable/Disable)

        specs/login.sanmaime:11:3
          Element "Banner" is not defined

      Snippets:

      // import { createNimaime } from 'nimaime-han';
      // const { defineElement, defineCondition } = createNimaime(test);

      // Add to the existing defineElement('Login Form', { … }):
        'Remember me': ({ page }) => page.getByTestId('TODO'),

      // The existing defineElement('Login Button', …) has no locator for the element itself,
      // which Enable / Disable need. Pass it as the second argument, before the targets:
      // defineElement('Login Button', ({ page }) => page.getByTestId('TODO'), { … });

      defineElement('Banner', {
        Text: ({ page }) => page.getByTestId('TODO'),
      });

      // Used on Screen "Login" (add { screen: 'Login' } to define it for that screen only).
      defineCondition('Input is valid', async ({ page }) => {
        // TODO: bring the screen into this state
      });

      // Used on Screen "User Information Page" (add { screen: 'User Information Page' } to define it for that screen only).
      defineCondition('Viewing your own profile', async ({ page }) => {
        // TODO: bring the screen into this state
      });
      "
    `);
  });

  it('includes screens without defineScreen (and their snippet) with includeInfo', () => {
    const result = missingFixture();
    const text = formatMissing(result.missing, {
      cwd: root,
      includeInfo: true,
      documents: result.documents,
    }).join('\n');
    expect(text).toMatch(/^Missing definitions: 6\n/);
    expect(text).toContain(
      '  specs/details.sanmaime:1:1\n    Screen "User Information Page" is not defined (optional: without defineScreen it is not opened)\n',
    );
    expect(text).toContain("defineScreen('User Information Page', {");
    expect(text).not.toContain("defineScreen('Login'");
  });

  it('prints the compact one-line form', () => {
    const result = missingFixture();
    expect(formatMissing(result.missing, { cwd: root, format: 'compact' })).toMatchInlineSnapshot(`
      [
        "specs/login.sanmaime:5:5: error: Element "Login Form" has no definition for target "Remember me".",
        "specs/login.sanmaime:8:5: error: Condition "When: Input is valid" (Screen "Login", Element "Login Button") has no definition (defineCondition).",
        "specs/login.sanmaime:9:5: error: Element "Login Button" has no locator for the element itself, which Enable / Disable need (defineElement(name, self, targets)).",
        "specs/login.sanmaime:11:3: error: Element "Banner" of Screen "Login" has no definition (defineElement).",
        "specs/details.sanmaime:3:5: error: Condition "When: Viewing your own profile" (Screen "User Information Page", Element "Login Form") has no definition (defineCondition).",
      ]
    `);
  });

  it('says warning instead of error with asWarnings', () => {
    const result = missingFixture();
    const compact = formatMissing(result.missing, {
      cwd: root,
      format: 'compact',
      asWarnings: true,
    });
    expect(compact.every((line) => line.includes(': warning: '))).toBe(true);
    const pretty = formatMissing(result.missing, { cwd: root, asWarnings: true });
    expect(pretty[0]).toBe('Missing definitions (allowed by --allow-missing): 5');
  });

  it('prints nothing when nothing is missing', () => {
    const entries: MissingDefinition[] = [
      {
        kind: 'screen',
        severity: 'info',
        screen: 'A',
        name: 'A',
        file: path.join(root, 'a.sanmaime'),
        location: { line: 1, column: 1 },
      },
    ];
    expect(formatMissing([], { cwd: root })).toEqual([]);
    expect(formatMissing(entries, { cwd: root })).toEqual([]);
    expect(formatMissing(entries, { cwd: root, format: 'compact' })).toEqual([]);
  });
});

describe('formatDiagnostics', () => {
  const broken = spec('Screen: Broken\n  Element: X\n    Shw: Y\n', 'specs/broken.sanmaime');
  const diagnostics = broken.diagnostics.map((d) => ({ ...d, file: broken.file }));

  it('prints a pretty block reusing the diagnostic messages', () => {
    expect(formatDiagnostics(diagnostics, { cwd: root }).join('\n')).toMatchInlineSnapshot(`
      "Syntax errors: 2

        specs/broken.sanmaime:2:3
          SANMAIME_E009: Element 'X' has no expectations.

        specs/broken.sanmaime:3:5
          SANMAIME_E001: Unrecognised line 'Shw: Y'. Expected Screen:, Background:, Element:, When:, And when:, Show:, Hide:, And:, Enable, Disable, a comment (#) or tags (@).
      "
    `);
  });

  it('prints formatDiagnostic lines in compact form, and nothing for no diagnostics', () => {
    expect(formatDiagnostics(diagnostics, { cwd: root, format: 'compact' })).toEqual([
      "specs/broken.sanmaime:2:3: error SANMAIME_E009: Element 'X' has no expectations.",
      "specs/broken.sanmaime:3:5: error SANMAIME_E001: Unrecognised line 'Shw: Y'. Expected Screen:, Background:, Element:, When:, And when:, Show:, Hide:, And:, Enable, Disable, a comment (#) or tags (@).",
    ]);
    expect(formatDiagnostics([], { cwd: root })).toEqual([]);
  });
});
