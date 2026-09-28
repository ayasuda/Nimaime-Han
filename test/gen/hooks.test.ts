/**
 * Hooks in generated specs: `documentHooks(doc)` (which hooks apply where, which fixtures they
 * need) and the `test.beforeAll` / `test.afterAll` / `test.beforeEach` / `test.afterEach` calls
 * `generateSpecFile` emits for them. Every generated file is checked against Prettier.
 */
import path from 'node:path';
import type { Browser, Page } from '@playwright/test';
import prettier from 'prettier';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  documentHooks,
  generateSpecFile,
  matchSpecs,
  type GenerateOptions,
  type ParsedSpec,
  type ResolvedDocument,
} from '../../src/gen';
import { createNimaime, type NimaimeDefinitions } from '../../src/index';
import { parse } from '../../src/parser';
import { getRegistry, resetRegistry } from '../../src/runtime/index';

const root = path.resolve('/project');
const outputDir = path.join(root, '.sanmaime-gen');
const snapshots = path.join(import.meta.dirname, '__snapshots__', 'generate');

const LOGIN = `Screen: Login

  Element: Login Form
    Show: Email address

  Element: Login Button
    When: Input is valid
    Enable
`;

interface Fixtures {
  page: Page;
  browser: Browser;
  seed: (name: string) => Promise<void>;
  server: { url: string };
}

/** Definitions typed for custom fixtures (only their names matter to the generator). */
function definitionsFor<F, W = F>(): NimaimeDefinitions<F, W> {
  return createNimaime() as unknown as NimaimeDefinitions<F, W>;
}

function defineLogin(): void {
  const { defineElement, defineCondition } = createNimaime();
  defineElement('Login Form', { 'Email address': ({ page }) => page.getByLabel('Email') });
  defineElement('Login Button', ({ page }) => page.getByRole('button'));
  defineCondition('Input is valid', async ({ page }) => {
    await page.getByLabel('Email').fill('alice@example.com');
  });
}

function resolve(source: string, relative = 'specs/login.sanmaime'): ResolvedDocument {
  const file = path.join(root, relative);
  const { document, diagnostics } = parse(source, { uri: relative });
  expect(diagnostics).toEqual([]);
  const spec: ParsedSpec = { file, source, document, diagnostics };
  const [doc] = matchSpecs([spec], getRegistry()).documents;
  if (!doc) throw new Error('not resolved');
  return doc;
}

const baseOptions: GenerateOptions = {
  outputDir,
  configDir: root,
  quotes: 'single',
  definitionFiles: [path.join(root, 'definitions', 'login.ts')],
};

function generate(doc: ResolvedDocument, quotes: 'single' | 'double' = 'single') {
  return generateSpecFile(doc, { ...baseOptions, quotes, hooks: documentHooks(doc) });
}

async function expectPrettier(content: string, quotes: 'single' | 'double' = 'single') {
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
  defineLogin();
});

describe('documentHooks', () => {
  it('lists the hooks of each screen and element with the fixtures they destructure', () => {
    const { beforeScreen, afterScreen, beforeElement, afterElement } = definitionsFor<Fixtures>();
    beforeScreen(async ({ server }) => {
      await Promise.resolve(server);
    });
    afterScreen(({ browser }) => browser.version(), { screen: 'Login' });
    afterScreen(() => undefined, { screen: 'Home' });
    beforeElement(({ page, seed }) => seed(page.url()), { element: 'Login Form' });
    afterElement(({ page }) => page.close(), { screen: 'Login', element: 'Login Button' });
    const hooks = documentHooks(resolve(LOGIN));
    expect([...hooks.keys()]).toEqual(['Login']);
    const login = hooks.get('Login');
    expect(login?.before).toEqual({ fixtures: ['server'], unknown: [], fallback: 'browser' });
    expect(login?.after).toEqual({ fixtures: ['browser'], unknown: [], fallback: 'browser' });
    expect(Object.fromEntries(login?.elements ?? [])).toEqual({
      'Login Form': { before: { fixtures: ['page', 'seed'], unknown: [], fallback: 'page' } },
      'Login Button': { after: { fixtures: ['page'], unknown: [], fallback: 'page' } },
    });
  });

  it('falls back to browser (screen) and page (element) for hooks that do not destructure', () => {
    const { beforeScreen, beforeElement } = definitionsFor<Fixtures>();
    beforeScreen((fixtures) => fixtures.browser.version());
    beforeElement((fixtures) => fixtures.page.url(), { element: 'Login Form' });
    const login = documentHooks(resolve(LOGIN)).get('Login');
    expect(login?.before).toMatchObject({
      fixtures: ['browser'],
      unknown: [expect.stringMatching(/^beforeScreen hook \(.*hooks\.test\.ts:\d+:\d+\)$/)],
    });
    expect(login?.elements.get('Login Form')?.before).toMatchObject({
      fixtures: ['page'],
      fallback: 'page',
    });
  });

  it('is empty when no hook applies', () => {
    const { beforeScreen, beforeElement } = definitionsFor<Fixtures>();
    beforeScreen(() => undefined, { screen: 'Home' });
    beforeElement(() => undefined, { element: 'Other' });
    expect(documentHooks(resolve(LOGIN)).size).toBe(0);
  });
});

describe('generateSpecFile with hooks', () => {
  it('generates nothing extra without hooks (no runHooks import)', async () => {
    const doc = resolve(LOGIN);
    const withHooks = generate(doc);
    expect(withHooks.content).toBe(generateSpecFile(doc, baseOptions).content);
    expect(withHooks.content).not.toContain('runHooks');
    await expectPrettier(withHooks.content);
  });

  it('emits screen hooks as test.beforeAll / test.afterAll with worker fixtures', async () => {
    const { beforeScreen, afterScreen } = definitionsFor<Fixtures>();
    beforeScreen(async ({ server }) => {
      await Promise.resolve(server);
    });
    afterScreen(({ browser }) => browser.version(), { screen: 'Login' });
    const result = generate(resolve(LOGIN));
    expect(result.content).toContain(
      `import { createNimaimeTest, runHooks } from 'nimaime-han/runtime';`,
    );
    expect(result.content).not.toContain('beforeEach');
    await expect(result.content).toMatchFileSnapshot(
      path.join(snapshots, 'hooks-screen.spec.ts.snap'),
    );
    await expectPrettier(result.content);
  });

  it('emits element hooks as test.beforeEach / test.afterEach with test fixtures', async () => {
    const { beforeElement, afterElement } = definitionsFor<Fixtures>();
    beforeElement(async ({ page }) => {
      await page.goto('/');
    });
    afterElement(({ page, seed }) => seed(page.url()), { element: 'Login Button' });
    const result = generate(resolve(LOGIN));
    expect(result.content).not.toContain('beforeAll');
    await expect(result.content).toMatchFileSnapshot(
      path.join(snapshots, 'hooks-element.spec.ts.snap'),
    );
    await expectPrettier(result.content);
  });

  it('emits screen and element hooks together, with empty and fallback fixtures', async () => {
    const { beforeScreen, afterScreen, beforeElement, afterElement } = definitionsFor<Fixtures>();
    beforeScreen(() => undefined, { screen: 'Login' });
    afterScreen((fixtures) => fixtures.browser.version());
    beforeElement(({ page }) => page.url(), { element: 'Login Form' });
    beforeElement((fixtures) => fixtures.seed('x'), { element: 'Login Form' });
    afterElement(({ server }) => server.url, { element: 'Login Form' });
    const result = generate(resolve(LOGIN), 'double');
    expect(result.unknownFixtures).toEqual([
      {
        callback: expect.stringMatching(/^afterScreen hook \(/) as string,
        titlePath: ['Screen: Login', 'afterAll hook'],
        fallback: 'browser',
      },
      {
        callback: expect.stringMatching(/^beforeElement hook \(/) as string,
        titlePath: ['Screen: Login', 'Element: Login Form', 'beforeEach hook'],
        fallback: 'page',
      },
    ]);
    expect(result.content).toContain('test.beforeAll(async ({}) => {');
    await expect(result.content).toMatchFileSnapshot(
      path.join(snapshots, 'hooks-mixed.spec.ts.snap'),
    );
    await expectPrettier(result.content, 'double');
  });

  it('breaks long hook calls like Prettier', async () => {
    type Many = Record<
      | 'page'
      | 'alphaFixtureWithALongName'
      | 'betaFixtureWithALongName'
      | 'gammaFixtureWithALongName'
      | 'delta-fixture',
      Page
    >;
    const { beforeScreen, afterScreen, beforeElement, afterElement } = definitionsFor<Many>();
    const screen = `Account Settings ${'and Preferences '.repeat(4)}Screen`;
    const element = 'Notification Preferences Panel With Several Toggles And A Long Name';
    const { defineElement } = createNimaime();
    defineElement(element, { Toggle: ({ page }) => page.getByRole('switch') });
    beforeScreen(({ alphaFixtureWithALongName, betaFixtureWithALongName }) => [
      alphaFixtureWithALongName,
      betaFixtureWithALongName,
    ]);
    afterScreen(
      ({ alphaFixtureWithALongName, betaFixtureWithALongName, gammaFixtureWithALongName }) => [
        alphaFixtureWithALongName,
        betaFixtureWithALongName,
        gammaFixtureWithALongName,
      ],
    );
    beforeElement(
      ({
        page,
        alphaFixtureWithALongName,
        betaFixtureWithALongName,
        gammaFixtureWithALongName,
        'delta-fixture': delta,
      }) => [
        page,
        alphaFixtureWithALongName,
        betaFixtureWithALongName,
        gammaFixtureWithALongName,
        delta,
      ],
    );
    afterElement(({ page }) => page);
    const doc = resolve(`Screen: ${screen}

  Element: ${element}
    Show: Toggle
`);
    const result = generate(doc);
    await expect(result.content).toMatchFileSnapshot(
      path.join(snapshots, 'hooks-long.spec.ts.snap'),
    );
    await expectPrettier(result.content);
  });
});
