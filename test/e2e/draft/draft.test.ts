/**
 * `nimaime draft` against real pages in Chromium: the observation phase (roles, names, landmarks,
 * visibility, disabled state), the draft proposed from it, and the built CLI.
 *
 * Run with `npm run test:e2e:draft` (builds first). Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to use
 * an already installed Chromium whose revision differs from Playwright's.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser, type Locator, type Page } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  observeScreen,
  proposeSanmaime,
  type LocatorSpec,
  type ScreenObservation,
} from '../../../src/draft';
import { parse } from '../../../src/parser';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const fixture = (...parts: string[]) => pathToFileURL(path.join(...parts)).href;
const ACCOUNT = fixture(import.meta.dirname, 'fixtures', 'account.html');
const LOGIN = fixture(repoRoot, 'examples', 'basic', 'app', 'login.html');
const USER_DETAILS = fixture(repoRoot, 'examples', 'basic', 'app', 'user-details.html');

let browser: Browser;
let page: Page;

beforeAll(async () => {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  browser = await chromium.launch(executablePath ? { executablePath } : {});
  page = await browser.newPage();
});

afterAll(async () => {
  await browser.close();
});

async function observe(url: string): Promise<ScreenObservation> {
  await page.goto(url);
  return observeScreen(page);
}

/** The Playwright locator a `LocatorSpec` stands for (what the definitions draft writes). */
function toLocator(p: Page, spec: LocatorSpec): Locator {
  let locator: Locator;
  switch (spec.method) {
    case 'getByTestId':
      locator = p.getByTestId(spec.value);
      break;
    case 'getByRole':
      locator = p.getByRole(spec.role as Parameters<Page['getByRole']>[0], {
        name: spec.name,
        ...(spec.exact === true ? { exact: true } : {}),
      });
      break;
    default:
      locator = p[spec.method](spec.value, spec.exact === true ? { exact: true } : {});
  }
  return spec.first === true ? locator.first() : locator;
}

function expectValid(sanmaime: string): void {
  expect(parse(sanmaime).diagnostics).toEqual([]);
}

describe('observeScreen', () => {
  it('observes the login page of examples/basic', async () => {
    const observation = await observe(LOGIN);
    expect(observation).toEqual({
      format: 'nimaime-observation',
      version: 1,
      url: LOGIN,
      title: 'Log in',
      lang: 'en',
      testIdAttribute: 'data-testid',
      truncated: false,
      regions: [
        { id: 'page', kind: 'page', tag: 'body' },
        { id: 'r1', kind: 'form', tag: 'form', htmlId: 'login-form' },
      ],
      elements: [
        {
          tag: 'h1',
          role: 'heading',
          name: 'Log in',
          nameSource: 'content',
          text: 'Log in',
          level: 1,
          visible: true,
          enabled: true,
          region: 'page',
        },
        {
          tag: 'input',
          role: 'textbox',
          name: 'Email address',
          nameSource: 'label',
          type: 'email',
          visible: true,
          enabled: true,
          disabled: false,
          region: 'r1',
        },
        {
          tag: 'input',
          name: 'Password',
          nameSource: 'label',
          type: 'password',
          visible: true,
          enabled: true,
          disabled: false,
          region: 'r1',
        },
        {
          tag: 'button',
          role: 'button',
          name: 'Log in',
          nameSource: 'content',
          visible: true,
          enabled: false,
          disabled: true,
          region: 'r1',
        },
      ],
    });
    // Saved and reloaded observations are the same.
    expect(JSON.parse(JSON.stringify(observation))).toEqual(observation);
  });

  it('records hidden test ids as not visible', async () => {
    const observation = await observe(`${USER_DETAILS}?user=bob`);
    const visibility = Object.fromEntries(
      observation.elements.flatMap((e) => (e.testId === undefined ? [] : [[e.testId, e.visible]])),
    );
    expect(visibility).toEqual({
      username: true,
      'real-name': false,
      email: false,
      'edit-button': false,
    });
  });

  it('groups elements by landmark and approximates roles and names', async () => {
    const observation = await observe(ACCOUNT);
    expect(observation.regions).toEqual([
      { id: 'page', kind: 'page', tag: 'body' },
      { id: 'r1', kind: 'header', tag: 'header' },
      { id: 'r2', kind: 'nav', tag: 'nav', label: 'Primary', parent: 'r1' },
      { id: 'r3', kind: 'main', tag: 'main' },
      { id: 'r4', kind: 'section', tag: 'section', label: 'Profile', parent: 'r3' },
      { id: 'r5', kind: 'form', tag: 'form', htmlId: 'preferences', parent: 'r3' },
      { id: 'r6', kind: 'footer', tag: 'footer' },
    ]);
    const summary = observation.elements.map((e) =>
      [
        e.region,
        e.role ?? e.tag,
        e.name ?? e.testId,
        e.visible ? '' : 'hidden',
        e.disabled === true ? 'disabled' : '',
      ]
        .filter((part) => part !== '')
        .join(' '),
    );
    expect(summary).toEqual([
      'r1 link Acme',
      'r2 link Home',
      'r2 link Settings',
      'r2 link Help',
      'r3 heading Account settings',
      'r4 heading Profile',
      'r4 dd username',
      'r4 dd plan',
      'r4 dd secret hidden',
      'r4 dd ghost hidden',
      'r5 combobox Language',
      'r5 checkbox Email notifications',
      'r5 searchbox Search settings',
      'r5 input Current password',
      'r5 button Save disabled',
      'r5 button Reset',
      'r5 button Delete account disabled',
      'r3 button Export data',
      'r3 button Shadow action',
      // A closed <dialog> is not a region; its content is hidden.
      'page button Close hidden',
      'r6 link Terms',
    ]);
  });
});

describe('proposeSanmaime on observed pages', () => {
  it('drafts the login page', async () => {
    const proposal = proposeSanmaime(await observe(LOGIN), { screen: 'Login', header: false });
    expect(proposal.sanmaime).toBe(`Screen: Login

  Element: Log in
    Show: Log in heading

  Element: Login Form
    Show: Email address
    And: Password
    And: Log in button

  Element: Log in button
    Disable
`);
    expectValid(proposal.sanmaime);
    // The proposed locators find the observed elements.
    await expect.poll(() => page.getByRole('button', { name: 'Log in' }).isDisabled()).toBe(true);
    expect(await page.getByLabel('Password').count()).toBe(1);
  });

  it('drafts a page with landmarks, in Japanese', async () => {
    const proposal = proposeSanmaime(await observe(ACCOUNT), {
      screen: 'アカウント設定',
      language: 'ja',
      header: false,
    });
    expect(proposal.sanmaime).toBe(`# language: ja

画面: アカウント設定

  要素: ヘッダー
    表示: Acme リンク

  要素: Primary
    表示: Home リンク
    かつ: Settings リンク
    かつ: Help リンク

  要素: Account settings
    表示: Export data ボタン
    かつ: Shadow action ボタン

  要素: Profile
    表示: Username
    かつ: Plan

  要素: Preferences
    表示: Language
    かつ: Email notifications チェックボックス
    かつ: Search settings
    かつ: Current password
    かつ: Save ボタン
    かつ: Reset ボタン
    かつ: Delete account ボタン

  要素: Save ボタン
    無効

  要素: Delete account ボタン
    無効

  要素: フッター
    表示: Terms リンク
`);
    expectValid(proposal.sanmaime);
    // Every proposed locator matches exactly one visible element of the page.
    const specs = proposal.elements.flatMap((e) => [
      ...e.targets.map((t) => t.locator),
      ...(e.self ? [e.self] : []),
    ]);
    expect(specs.length).toBeGreaterThan(10);
    for (const spec of specs) {
      const locator = toLocator(page, spec);
      expect(await locator.count(), JSON.stringify(spec)).toBe(1);
      expect(await locator.isVisible(), JSON.stringify(spec)).toBe(true);
    }
  });
});

describe('built CLI', () => {
  const bin = path.join(repoRoot, 'dist', 'cli', 'nimaime.js');
  // Skip when there is no build, or when it predates the sources (npm run test:e2e:draft builds).
  const sources = [
    ...fs.readdirSync(path.join(repoRoot, 'src', 'draft')).map((f) => path.join('draft', f)),
    path.join('cli', 'nimaime.ts'),
    path.join('cli', 'nimaime-args.ts'),
    path.join('cli', 'nimaime-main.ts'),
  ].map((f) => path.join(repoRoot, 'src', f));
  const built = fs.existsSync(bin) ? fs.statSync(bin).mtimeMs : -1;
  const fresh = built >= 0 && sources.every((f) => fs.statSync(f).mtimeMs <= built);

  it.skipIf(!fresh)('drafts the login page from an HTML file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimaime-draft-e2e-'));
    try {
      const result = spawnSync(
        process.execPath,
        [
          bin,
          'draft',
          path.join(repoRoot, 'examples', 'basic', 'app', 'login.html'),
          '--screen',
          'Login',
          '--definitions',
          'login.ts',
          '--observation',
          'login.json',
        ],
        { cwd: dir, encoding: 'utf8', env: process.env },
      );
      expect(result.stderr).toContain('Drafted Screen "Login"');
      expect(result.status).toBe(0);
      expectValid(result.stdout);
      expect(result.stdout).toContain('  Element: Login Form\n    Show: Email address\n');
      expect(fs.readFileSync(path.join(dir, 'login.ts'), 'utf8')).toContain(
        "  Password: ({ page }) => page.getByLabel('Password'),\n",
      );
      // The saved observation drafts the same Sanmaime offline.
      const offline = spawnSync(process.execPath, [bin, 'draft', 'login.json', '-s', 'Login'], {
        cwd: dir,
        encoding: 'utf8',
      });
      expect(offline.status).toBe(0);
      expect(offline.stdout).toBe(result.stdout);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
