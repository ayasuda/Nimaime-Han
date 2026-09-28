/**
 * Snapshot tests of the code generator. Every generated file is also checked to be exactly what
 * Prettier prints for it (with the repository's options and the configured quote style).
 */
import path from 'node:path';
import type { Page } from '@playwright/test';
import prettier from 'prettier';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  generatedSpecPath,
  generateSpecFile,
  importSpecifier,
  listTests,
  matchSpecs,
  quote,
  textWidth,
  type GenerateOptions,
  type ParsedSpec,
  type ResolvedDocument,
} from '../../src/gen';
import { resolveSanmaimeConfig } from '../../src/config';
import { createNimaime, type NimaimeDefinitions } from '../../src/index';
import { parse } from '../../src/parser';
import { getRegistry, resetRegistry } from '../../src/runtime/index';

const root = path.resolve('/project');
const configDir = root;
const outputDir = path.join(root, '.sanmaime-gen');
const snapshots = path.join(import.meta.dirname, '__snapshots__', 'generate');

const LOGIN = `Screen: Login

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

const USER_DETAILS = `Screen: User Details

  Element: User Information

    When: Viewing your own profile
    Show: Username
    And: Full name
    And: Email address

    When: Viewing another user's profile
    Show: Username
    Hide: Full name
    And: Email address
`;

interface Fixtures {
  page: Page;
}

/** Definitions typed for custom fixtures (only their names matter to the generator). */
function definitionsFor<F>(): NimaimeDefinitions<F> {
  return createNimaime() as unknown as NimaimeDefinitions<F>;
}
const locator = ({ page }: Fixtures) => page.locator('x');

function defineLogin(): void {
  const { defineElement, defineCondition } = createNimaime();
  defineElement('Login Form', {
    'Email address': ({ page }) => page.getByLabel('Email'),
    Password: ({ page }) => page.getByLabel('Password'),
    'Login button': ({ page }) => page.getByRole('button', { name: 'Log in' }),
  });
  defineElement('Login Button', ({ page }) => page.getByRole('button', { name: 'Log in' }));
  defineCondition('Input is valid', async ({ page }) => {
    await page.getByLabel('Email').fill('alice@example.com');
  });
  defineCondition(
    'Input is invalid',
    async ({ page }) => {
      await page.getByLabel('Email').fill('not-an-email');
    },
    { screen: 'Login' },
  );
}

function defineUserDetails(): void {
  const { defineScreen, defineElement, defineCondition } = createNimaime();
  defineScreen('User Details', { open: ({ page }) => page.goto('/users/me') });
  defineElement('User Information', {
    Username: locator,
    'Full name': locator,
    'Email address': locator,
  });
  defineCondition('Viewing your own profile', async ({ page }) => {
    await page.goto('/users/me');
  });
  defineCondition("Viewing another user's profile", async ({ page }) => {
    await page.goto('/users/42');
  });
}

/** Parses `source` as `<configDir>/<relative>` and resolves it against the current registry. */
function resolve(source: string, relative: string, language?: string): ResolvedDocument {
  const file = path.join(configDir, relative);
  const uri = relative.split(path.sep).join('/');
  const { document, diagnostics } = parse(source, language ? { uri, language } : { uri });
  expect(diagnostics).toEqual([]);
  const spec: ParsedSpec = { file, source, document, diagnostics };
  const result = matchSpecs([spec], getRegistry());
  expect(result.missing.filter((m) => m.severity === 'error')).toEqual([]);
  const [doc] = result.documents;
  if (!doc) throw new Error('not resolved');
  return doc;
}

const baseOptions: GenerateOptions = {
  outputDir,
  configDir,
  quotes: 'single',
  definitionFiles: [path.join(root, 'definitions', 'login.ts')],
};

async function expectPrettier(content: string, quotes: 'single' | 'double'): Promise<void> {
  const formatted = await prettier.format(content, {
    parser: 'typescript',
    singleQuote: quotes === 'single',
    trailingComma: 'all',
    printWidth: 100,
  });
  expect(content).toBe(formatted);
}

beforeEach(() => {
  resetRegistry();
});

describe('generateSpecFile', () => {
  it('generates the README Login example', async () => {
    defineLogin();
    const doc = resolve(LOGIN, 'specs/login.sanmaime');
    const result = generateSpecFile(doc, {
      ...baseOptions,
      importTestFrom: { file: path.join(root, 'fixtures.ts'), varName: 'test' },
    });
    expect(result.path).toBe(path.join(outputDir, 'specs', 'login.spec.ts'));
    expect(result.tests.map((t) => t.titlePath.join(' > '))).toEqual([
      'Screen: Login > Element: Login Form > Always',
      'Screen: Login > Element: Login Button > When: Input is valid',
      'Screen: Login > Element: Login Button > When: Input is invalid',
    ]);
    expect(result.unknownFixtures).toEqual([]);
    expect(listTests(doc)).toEqual(result.tests);
    await expect(result.content).toMatchFileSnapshot(path.join(snapshots, 'login.spec.ts.snap'));
    await expectPrettier(result.content, 'single');
  });

  it('generates the README User Details example with double quotes', async () => {
    defineUserDetails();
    const doc = resolve(USER_DETAILS, 'specs/user-details.sanmaime');
    const result = generateSpecFile(doc, { ...baseOptions, quotes: 'double' });
    expect(result.content).toContain(`import { test as base } from "@playwright/test";`);
    await expect(result.content).toMatchFileSnapshot(
      path.join(snapshots, 'user-details.double.spec.ts.snap'),
    );
    await expectPrettier(result.content, 'double');
  });

  it('switches quotes like Prettier when a name contains the preferred quote', async () => {
    defineUserDetails();
    const doc = resolve(USER_DETAILS, 'specs/user-details.sanmaime');
    const result = generateSpecFile(doc, baseOptions);
    expect(result.content).toContain(`test("When: Viewing another user's profile", async (`);
    await expect(result.content).toMatchFileSnapshot(
      path.join(snapshots, 'user-details.single.spec.ts.snap'),
    );
    await expectPrettier(result.content, 'single');
  });

  describe('importTestFrom', () => {
    const header = (content: string): string => content.split('\n').slice(0, 6).join('\n');

    it('imports `test` from the file given as a string', async () => {
      defineLogin();
      const config = resolveSanmaimeConfig(
        { specs: 's', definitions: 'd', importTestFrom: 'support/fixtures.ts' },
        configDir,
      );
      const doc = resolve(LOGIN, 'specs/login.sanmaime');
      const result = generateSpecFile(doc, {
        ...baseOptions,
        importTestFrom: config.importTestFrom,
      });
      expect(header(result.content)).toMatchInlineSnapshot(`
        "// Generated by nimaime-gen from specs/login.sanmaime. Do not edit.
        import { createNimaimeTest } from 'nimaime-han/runtime';
        import { test as base } from '../../support/fixtures';
        import '../../definitions/login';

        const test = createNimaimeTest(base);"
      `);
      await expectPrettier(result.content, 'single');
    });

    it('respects varName of { file, varName }', () => {
      defineLogin();
      const config = resolveSanmaimeConfig(
        {
          specs: 's',
          definitions: 'd',
          importTestFrom: { file: './support/fixtures.mjs', varName: 'myTest' },
        },
        configDir,
      );
      const doc = resolve(LOGIN, 'specs/login.sanmaime');
      const result = generateSpecFile(doc, {
        ...baseOptions,
        importTestFrom: config.importTestFrom,
      });
      expect(header(result.content)).toContain(
        `import { myTest as base } from '../../support/fixtures.mjs';`,
      );
    });

    it('does not alias a varName named base, and does not import the fixtures file twice', () => {
      defineLogin();
      const fixtures = path.join(root, 'definitions', 'login.ts');
      const doc = resolve(LOGIN, 'specs/login.sanmaime');
      const result = generateSpecFile(doc, {
        ...baseOptions,
        importTestFrom: { file: fixtures, varName: 'base' },
      });
      expect(header(result.content)).toMatchInlineSnapshot(`
        "// Generated by nimaime-gen from specs/login.sanmaime. Do not edit.
        import { createNimaimeTest } from 'nimaime-han/runtime';
        import { base } from '../../definitions/login';

        const test = createNimaimeTest(base);
        const file = '../../specs/login.sanmaime';"
      `);
    });

    it('uses @playwright/test when not set', () => {
      defineLogin();
      const doc = resolve(LOGIN, 'specs/login.sanmaime');
      const result = generateSpecFile(doc, baseOptions);
      expect(result.content).toContain(`import { test as base } from '@playwright/test';`);
    });
  });

  it('generates an unconditional block and condition blocks, with custom fixtures', async () => {
    interface Custom {
      page: Page;
      appHtml: string;
      calls: string[];
      fullName: string;
    }
    const { defineScreen, defineElement, defineCondition } = definitionsFor<Custom>();
    defineScreen('Login', {
      open: async ({ page, appHtml }: Custom) => {
        await page.setContent(appHtml);
      },
    });
    defineElement('Login Button', ({ page }: Custom) => page.getByTestId('login-button'), {
      'Error message': ({ page }: Custom) => page.getByTestId('error'),
      'Warning icon': ({ page }: Custom) => page.getByTestId('warning'),
    });
    defineCondition('Input is invalid', async ({ page, calls }: Custom) => {
      calls.push('condition');
      await page.getByTestId('email').fill('x');
    });
    const doc = resolve(
      `Screen: Login

  Element: Login Button
    Disable
    Hide: Error message

    When: Input is invalid
    Show: Warning icon
`,
      'specs/login.sanmaime',
    );
    const result = generateSpecFile(doc, baseOptions);
    expect(result.tests.map((t) => t.titlePath.at(-1))).toEqual([
      'Always',
      'When: Input is invalid',
    ]);
    expect(result.content).toContain(`test('Always', async ({ $nimaime, appHtml, page }) => {`);
    expect(result.content).toContain(
      `test('When: Input is invalid', async ({ $nimaime, appHtml, calls, page }) => {`,
    );
    await expect(result.content).toMatchFileSnapshot(
      path.join(snapshots, 'unconditional-and-conditions.spec.ts.snap'),
    );
    await expectPrettier(result.content, 'single');
  });

  it('keeps the relative path of specs in subfolders', async () => {
    defineLogin();
    const doc = resolve(LOGIN, path.join('specs', 'auth', 'deep', 'login.sanmaime'));
    const result = generateSpecFile(doc, {
      ...baseOptions,
      definitionFiles: [
        path.join(root, 'definitions', 'a.ts'),
        path.join(root, 'definitions', 'nested', 'b.tsx'),
        path.join(root, 'definitions', 'c.mjs'),
      ],
    });
    expect(result.path).toBe(path.join(outputDir, 'specs', 'auth', 'deep', 'login.spec.ts'));
    expect(result.content.split('\n').slice(0, 8).join('\n')).toMatchInlineSnapshot(`
      "// Generated by nimaime-gen from specs/auth/deep/login.sanmaime. Do not edit.
      import { createNimaimeTest } from 'nimaime-han/runtime';
      import { test as base } from '@playwright/test';
      import '../../../../definitions/a';
      import '../../../../definitions/nested/b';
      import '../../../../definitions/c.mjs';

      const test = createNimaimeTest(base);"
    `);
    expect(result.content).toContain(`const file = '../../../../specs/auth/deep/login.sanmaime';`);
    await expectPrettier(result.content, 'single');
  });

  it('escapes Japanese names and long titles like Prettier', async () => {
    const { defineScreen, defineElement, defineCondition } = createNimaime();
    defineScreen('ユーザー詳細', { open: ({ page }) => page.goto('/users/me') });
    defineElement(
      'ユーザー情報パネル（プロフィールの見出し、氏名、メールアドレスをまとめて表示する領域）',
      ({ page }) => page.getByTestId('panel'),
      {
        ユーザー名: locator,
        氏名: locator,
        メールアドレス: locator,
        'とても長い対象の名前：ユーザーが自分のプロフィールを閲覧しているときにだけ表示される「編集」ボタン':
          locator,
      },
    );
    defineCondition(
      '自分のプロフィールを閲覧している場合で、なおかつ編集権限を持っていて、さらに "引用符" と \'アポストロフィ\' を含む',
      async ({ page }) => {
        await page.goto('/users/me');
      },
    );
    const source = `# language: ja
画面: ユーザー詳細

  要素: ユーザー情報パネル（プロフィールの見出し、氏名、メールアドレスをまとめて表示する領域）
    表示: ユーザー名
    非表示: 氏名

    条件: 自分のプロフィールを閲覧している場合で、なおかつ編集権限を持っていて、さらに "引用符" と 'アポストロフィ' を含む
    有効
    表示: メールアドレス
    かつ: とても長い対象の名前：ユーザーが自分のプロフィールを閲覧しているときにだけ表示される「編集」ボタン
`;
    const doc = resolve(source, path.join('specs', 'ユーザー', 'ユーザー詳細.sanmaime'));
    for (const quotes of ['single', 'double'] as const) {
      const result = generateSpecFile(doc, { ...baseOptions, quotes });
      expect(result.path).toBe(path.join(outputDir, 'specs', 'ユーザー', 'ユーザー詳細.spec.ts'));
      await expect(result.content).toMatchFileSnapshot(
        path.join(snapshots, `japanese.${quotes}.spec.ts.snap`),
      );
      await expectPrettier(result.content, quotes);
    }
  });

  it('breaks very long English titles and many fixtures like Prettier', async () => {
    type Many = Record<
      'page' | 'alphaFixture' | 'betaFixture' | 'gammaFixture' | 'deltaFixture' | 'epsilon',
      Page
    >;
    const { defineScreen, defineElement, defineCondition } = definitionsFor<Many>();
    const longScreen = `Account Settings ${'and Preferences '.repeat(6)}Screen`;
    const longElement = 'Notification Preferences Panel With Several Toggles';
    defineScreen(longScreen, {
      open: async ({ page, alphaFixture, betaFixture }: Many) => {
        await page.goto(alphaFixture.url() + betaFixture.url());
      },
    });
    defineElement(longElement, ({ gammaFixture }: Many) => gammaFixture.locator('x'), {
      'Email notifications toggle that is only shown for verified accounts with a mailbox': ({
        deltaFixture,
      }: Many) => deltaFixture.locator('y'),
    });
    defineCondition(
      'The user has verified the email address and enabled at least one notification channel',
      async ({ epsilon }: Many) => {
        await epsilon.goto('/');
      },
    );
    defineCondition('Short', async ({ page }: Many) => {
      await page.goto('/');
    });
    const doc = resolve(
      `Screen: ${longScreen}

  Element: ${longElement}
    Show: Email notifications toggle that is only shown for verified accounts with a mailbox

    When: The user has verified the email address and enabled at least one notification channel
    Enable

    When: Short
    Disable
`,
      'specs/settings.sanmaime',
    );
    const result = generateSpecFile(doc, baseOptions);
    await expect(result.content).toMatchFileSnapshot(path.join(snapshots, 'long.spec.ts.snap'));
    await expectPrettier(result.content, 'single');
  });

  it('uses the defined names in plans (names are matched after trim())', async () => {
    const { defineElement, defineCondition } = createNimaime();
    defineElement(' Login Form ', { ' Password': locator });
    defineCondition(' Ready ', async ({ page }: Fixtures) => {
      await page.goto('/');
    });
    const doc = resolve(
      `Screen: Login
  Element: Login Form
    When: Ready
    Show: Password
`,
      'specs/login.sanmaime',
    );
    const result = generateSpecFile(doc, baseOptions);
    expect(result.content).toContain(`test.describe('Element: Login Form', () => {`);
    expect(result.content).toContain(`element: ' Login Form ',`);
    expect(result.content).toContain(`condition: ' Ready ',`);
    expect(result.content).toContain(`target: ' Password'`);
    await expectPrettier(result.content, 'single');
  });

  it('requests page for callbacks whose fixtures cannot be determined', async () => {
    const { defineElement, defineCondition } = definitionsFor<{
      page: Page;
      'my-login': () => Promise<void>;
    }>();
    defineElement('Panel', {
      Title: (fixtures: Fixtures) => fixtures.page.locator('h1'),
      Avatar: ({ page }: Fixtures) => page.locator('img'),
    });
    defineCondition(
      'Logged in',
      async ({ 'my-login': login }: { 'my-login': () => Promise<void> }) => {
        await login();
      },
    );
    const doc = resolve(
      `Screen: Home
  Element: Panel
    Show: Title

    When: Logged in
    Show: Avatar
`,
      'specs/home.sanmaime',
    );
    const result = generateSpecFile(doc, baseOptions);
    expect(result.unknownFixtures).toEqual([
      {
        callback: 'element "Panel" target "Title"',
        titlePath: ['Screen: Home', 'Element: Panel', 'Always'],
      },
    ]);
    expect(result.content).toContain(`test('Always', async ({ $nimaime, page }) => {`);
    expect(result.content).toContain(
      `test('When: Logged in', async ({ $nimaime, 'my-login': fixture1, page }) => {`,
    );
    expect(result.content).toContain(`{ 'my-login': fixture1, page },`);
    await expectPrettier(result.content, 'single');
  });
});

describe('helpers', () => {
  it('quote() escapes like JSON.stringify and picks the quote like Prettier', () => {
    expect(quote('Login', 'single')).toBe(`'Login'`);
    expect(quote('Login', 'double')).toBe(`"Login"`);
    expect(quote(`it's`, 'single')).toBe(`"it's"`);
    expect(quote(`say "hi"`, 'double')).toBe(`'say "hi"'`);
    expect(quote(`a 'b' "c"`, 'single')).toBe(`'a \\'b\\' "c"'`);
    expect(quote(`a 'b' "c"`, 'double')).toBe(`"a 'b' \\"c\\""`);
    expect(quote('back\\slash', 'single')).toBe(`'back\\\\slash'`);
    expect(quote('tab\there ', 'single')).toBe(`'tab\\there\\u2028'`);
    expect(quote('ユーザー名', 'single')).toBe(`'ユーザー名'`);
    for (const value of [`a'b"c\\`, 'x\ny', '日本語 "q"']) {
      for (const style of ['single', 'double'] as const) {
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        const evaluate = new Function(`return ${quote(value, style)};`) as () => unknown;
        expect(evaluate()).toBe(value);
      }
    }
  });

  it('textWidth() counts wide characters twice', () => {
    expect(textWidth('abc')).toBe(3);
    expect(textWidth('ユーザー')).toBe(8);
    expect(textWidth('（）')).toBe(4);
  });

  it('importSpecifier() is relative and omits TS/JS extensions only', () => {
    const from = path.join(root, '.sanmaime-gen', 'specs');
    expect(importSpecifier(from, path.join(root, 'fixtures.ts'))).toBe('../../fixtures');
    expect(importSpecifier(from, path.join(from, 'x.js'))).toBe('./x');
    expect(importSpecifier(from, path.join(root, 'd', 'y.cjs'))).toBe('../../d/y.cjs');
    expect(importSpecifier(from, path.join(root, 'd', 'y.mts'))).toBe('../../d/y.mts');
  });

  it('generatedSpecPath() keeps the relative path inside outputDir', () => {
    expect(generatedSpecPath(path.join(root, 'a', 'b.sanmaime'), configDir, outputDir)).toBe(
      path.join(outputDir, 'a', 'b.spec.ts'),
    );
    expect(generatedSpecPath(path.join(root, 'plain'), configDir, outputDir)).toBe(
      path.join(outputDir, 'plain.spec.ts'),
    );
    expect(
      generatedSpecPath(path.resolve(root, '..', 'shared', 'x.sanmaime'), configDir, outputDir),
    ).toBe(path.join(outputDir, '__', 'shared', 'x.spec.ts'));
  });
});
