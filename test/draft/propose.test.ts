/**
 * The rule-based proposer of `nimaime draft`: observations -> Sanmaime draft + definitions draft.
 */
import prettier from 'prettier';
import { describe, expect, it } from 'vitest';
import {
  DraftError,
  locatorFor,
  proposeElements,
  proposeSanmaime,
  renderDefinitions,
  validateDraft,
  type ObservedElement,
  type ProposedElement,
} from '../../src/draft';
import { humanize, regionName, targetName } from '../../src/draft/names';
import { parse } from '../../src/parser';
import { LOGIN, USER_DETAILS, observation } from './fixtures';

async function expectPrettier(content: string, quotes: 'single' | 'double' = 'single') {
  const formatted = await prettier.format(content, {
    parser: 'typescript',
    singleQuote: quotes === 'single',
    trailingComma: 'all',
    printWidth: 100,
  });
  expect(content).toBe(formatted);
}

function expectValid(sanmaime: string): void {
  expect(parse(sanmaime).diagnostics).toEqual([]);
}

const el = (fields: Partial<ObservedElement>): ObservedElement => ({
  tag: 'div',
  visible: true,
  enabled: true,
  region: 'page',
  ...fields,
});

describe('proposeSanmaime', () => {
  it('drafts the login page (en)', async () => {
    const proposal = proposeSanmaime(LOGIN, { screen: 'Login' });
    expect(proposal.sanmaime)
      .toBe(`# Draft proposed by nimaime draft from http://localhost:3000/login. Review it before committing.

Screen: Login

  Element: Log in
    Show: Log in heading

  Element: Login Form
    Show: Email address
    And: Password
    And: Log in button

  Element: Log in button
    Disable
`);
    expect(proposal.definitions)
      .toBe(`// Draft definitions proposed by \`nimaime draft\` for Screen "Login".
// Review every locator before committing (see docs/draft.md).
import { createNimaime } from 'nimaime-han';

const { defineScreen, defineElement } = createNimaime();

defineScreen('Login', {
  open: async ({ page }) => {
    await page.goto('http://localhost:3000/login');
  },
});

defineElement('Log in', {
  'Log in heading': ({ page }) => page.getByRole('heading', { name: 'Log in' }),
});

defineElement('Login Form', {
  'Email address': ({ page }) => page.getByRole('textbox', { name: 'Email address' }),
  Password: ({ page }) => page.getByLabel('Password'),
  'Log in button': ({ page }) => page.getByRole('button', { name: 'Log in' }),
});

defineElement('Log in button', ({ page }) => page.getByRole('button', { name: 'Log in' }));
`);
    expect(proposal.dropped).toEqual([]);
    expectValid(proposal.sanmaime);
    await expectPrettier(proposal.definitions);
  });

  it('drafts in Japanese with a language directive', async () => {
    const proposal = proposeSanmaime(LOGIN, { screen: 'ログイン', language: 'ja' });
    expect(proposal.sanmaime).toBe(`# language: ja
# nimaime draft が http://localhost:3000/login から提案した下書きです。レビューしてからコミットしてください。

画面: ログイン

  要素: Log in
    表示: Log in 見出し

  要素: Login Form
    表示: Email address
    かつ: Password
    かつ: Log in ボタン

  要素: Log in ボタン
    無効
`);
    const { document, diagnostics } = parse(proposal.sanmaime);
    expect(diagnostics).toEqual([]);
    expect(document.language).toBe('ja');
    expect(proposal.definitions).toContain("defineScreen('ログイン', {");
    expect(proposal.definitions).toContain(
      "defineElement('Log in ボタン', ({ page }) => page.getByRole('button', { name: 'Log in' }));",
    );
    await expectPrettier(proposal.definitions);
  });

  it('names elements after landmarks, dedupes targets and takes the first of repeated ones', async () => {
    const proposal = proposeSanmaime(USER_DETAILS, { screen: 'User Details', header: false });
    expect(proposal.sanmaime).toBe(`Screen: User Details

  Element: Navigation
    Show: Home link
    And: Settings link

  Element: User details
    Show: Edit button
    Enable

  Element: User Information
    Show: Username
    And: Full name
    And: Email
`);
    expect(proposal.definitions).toContain(
      "  'Settings link': ({ page }) => page.getByRole('link', { name: 'Settings' }).first(),",
    );
    expect(proposal.definitions).toContain(
      "defineElement('User details', ({ page }) => page.getByTestId('edit-button'), {",
    );
    expect(proposal.definitions).not.toContain('secret');
    await expectPrettier(proposal.definitions);
  });

  it('uses Japanese default names', () => {
    const proposal = proposeSanmaime(USER_DETAILS, { screen: 'ユーザー詳細', language: 'ja' });
    expect(proposal.sanmaime).toContain(
      '  要素: ナビゲーション\n    表示: Home リンク\n    かつ: Settings リンク\n',
    );
    expectValid(proposal.sanmaime);
  });

  it('puts everything in one element with groupBy flat', () => {
    const proposal = proposeSanmaime(USER_DETAILS, {
      screen: 'User Details',
      groupBy: 'flat',
      header: false,
    });
    expect(proposal.sanmaime).toBe(`Screen: User Details

  Element: User details
    Show: Home link
    And: Settings link
    And: Username
    And: Full name
    And: Email
    And: Edit button
    Enable
`);
  });

  it('writes double quotes when asked', async () => {
    const proposal = proposeSanmaime(LOGIN, { screen: 'Login', quotes: 'double' });
    expect(proposal.definitions).toContain('import { createNimaime } from "nimaime-han";');
    await expectPrettier(proposal.definitions, 'double');
  });

  it('rejects an empty screen name and a page with nothing to specify', () => {
    expect(() => proposeSanmaime(LOGIN, { screen: '  ' })).toThrow(DraftError);
    const hidden = observation(
      [{ id: 'page', kind: 'page', tag: 'body' }],
      [el({ testId: 'x', visible: false })],
    );
    expect(() => proposeSanmaime(hidden, { screen: 'Empty' })).toThrow(/Nothing to propose/);
  });
});

describe('Enable / Disable', () => {
  const form = (controls: ObservedElement[]) =>
    observation(
      [{ id: 'r1', kind: 'form', tag: 'form', label: 'Search' }],
      controls.map((c) => ({ ...c, region: 'r1' })),
    );
  const button = (name: string, disabled: boolean) =>
    el({ tag: 'button', role: 'button', name, disabled, enabled: !disabled });

  it('states Enable for the only control of an element', () => {
    const [element] = proposeElements(form([button('Go', false)]));
    expect(element).toMatchObject({ name: 'Search', state: 'enable' });
    expect(element?.self).toEqual({ method: 'getByRole', role: 'button', name: 'Go' });
  });

  it('states Disable for the only control of an element', () => {
    const proposal = proposeSanmaime(form([button('Go', true)]), { screen: 'S', header: false });
    expect(proposal.sanmaime).toBe(
      'Screen: S\n\n  Element: Search\n    Show: Go button\n    Disable\n',
    );
  });

  it('gives each disabled control of a multi-control element its own element', () => {
    const elements = proposeElements(
      form([button('Save', true), button('Cancel', false), button('Delete', true)]),
    );
    expect(elements.map((e) => [e.name, e.state, e.targets.length])).toEqual([
      ['Search', undefined, 3],
      ['Save button', 'disable', 0],
      ['Delete button', 'disable', 0],
    ]);
  });

  it('keeps element names unique', () => {
    const obs = observation(
      [
        { id: 'r1', kind: 'nav', tag: 'nav' },
        { id: 'r2', kind: 'nav', tag: 'nav' },
      ],
      [
        el({ tag: 'a', role: 'link', name: 'A', region: 'r1' }),
        el({ tag: 'a', role: 'link', name: 'B', region: 'r2' }),
      ],
    );
    expect(proposeElements(obs).map((e) => e.name)).toEqual(['Navigation', 'Navigation 2']);
  });
});

describe('names', () => {
  it('humanizes test ids', () => {
    expect(humanize('user-full_name')).toBe('User full name');
    expect(humanize('userFullName')).toBe('User full name');
    expect(humanize('login-form', true)).toBe('Login Form');
    expect(humanize('userID')).toBe('User ID');
  });

  it('names targets after the accessible name, test id or text', () => {
    expect(targetName(el({ role: 'button', name: 'Save' }), 'en')).toBe('Save button');
    expect(targetName(el({ role: 'button', name: 'Save Button' }), 'en')).toBe('Save Button');
    expect(targetName(el({ role: 'button', name: '保存' }), 'ja')).toBe('保存ボタン');
    expect(targetName(el({ role: 'textbox', name: ' E-mail\n address ' }), 'en')).toBe(
      'E-mail address',
    );
    expect(targetName(el({ testId: 'real-name' }), 'en')).toBe('Real name');
    expect(targetName(el({ text: 'Hello' }), 'en')).toBe('Hello');
  });

  it('names regions: label > heading > id > submit button > default', () => {
    const heading = el({ role: 'heading', name: 'Profile', level: 2 });
    const submit = el({ role: 'button', name: 'Sign up' });
    expect(
      regionName({ id: 'r', kind: 'form', tag: 'form', label: 'Login' }, [heading], 'en').name,
    ).toBe('Login');
    expect(regionName({ id: 'r', kind: 'section', tag: 'section' }, [heading], 'en')).toEqual({
      name: 'Profile',
      fromHeading: heading,
    });
    expect(regionName({ id: 'r', kind: 'header', tag: 'header' }, [heading], 'en').name).toBe(
      'Header',
    );
    expect(
      regionName({ id: 'r', kind: 'form', tag: 'form', htmlId: 'signupForm' }, [], 'en').name,
    ).toBe('Signup Form');
    expect(regionName({ id: 'r', kind: 'form', tag: 'form' }, [submit], 'en').name).toBe(
      'Sign up form',
    );
    expect(regionName({ id: 'r', kind: 'form', tag: 'form' }, [submit], 'ja').name).toBe(
      'Sign up フォーム',
    );
    expect(regionName({ id: 'r', kind: 'main', tag: 'main', htmlId: 'root' }, [], 'en').name).toBe(
      'Main content',
    );
    expect(regionName({ id: 'r', kind: 'page', tag: 'body' }, [], 'ja').name).toBe(
      'メインコンテンツ',
    );
  });
});

describe('locators', () => {
  it('prefers test id, then role and name, then label, placeholder, alt, title, text', () => {
    const all: ObservedElement[] = [];
    const locate = (e: ObservedElement) => {
      all.push(e);
      return locatorFor(e, all);
    };
    expect(locate(el({ testId: 't', role: 'button', name: 'B' }))).toEqual({
      method: 'getByTestId',
      value: 't',
    });
    expect(locate(el({ role: 'checkbox', name: 'Remember me' }))).toEqual({
      method: 'getByRole',
      role: 'checkbox',
      name: 'Remember me',
    });
    expect(locate(el({ tag: 'input', name: 'Password', nameSource: 'label' }))).toEqual({
      method: 'getByLabel',
      value: 'Password',
    });
    expect(locate(el({ tag: 'input', name: 'PIN', nameSource: 'placeholder' }))).toEqual({
      method: 'getByPlaceholder',
      value: 'PIN',
    });
    expect(locate(el({ tag: 'input', name: 'Logo', nameSource: 'alt' }))).toEqual({
      method: 'getByAltText',
      value: 'Logo',
    });
    expect(locate(el({ tag: 'input', name: 'Date', nameSource: 'title' }))).toEqual({
      method: 'getByTitle',
      value: 'Date',
    });
    expect(locate(el({ text: 'Hello' }))).toEqual({ method: 'getByText', value: 'Hello' });
    expect(locate(el({ text: 'Long…' }))).toBeUndefined();
  });

  it('adds exact: true when another name contains this one, first() for repeats', () => {
    const save = el({ role: 'button', name: 'Save' });
    const saveAll = el({ role: 'button', name: 'Save all' });
    const hiddenSave = el({ role: 'button', name: 'Save', visible: false });
    const id1 = el({ testId: 'row' });
    const id2 = el({ testId: 'row', visible: false });
    const all = [save, saveAll, hiddenSave, id1, id2];
    expect(locatorFor(save, all)).toEqual({
      method: 'getByRole',
      role: 'button',
      name: 'Save',
      exact: true,
    });
    expect(locatorFor(saveAll, all)).toEqual({
      method: 'getByRole',
      role: 'button',
      name: 'Save all',
    });
    // getByTestId() also matches hidden elements.
    expect(locatorFor(id1, all)).toEqual({ method: 'getByTestId', value: 'row', first: true });
  });
});

describe('validateDraft', () => {
  const target = (name: string) => ({
    name,
    locator: { method: 'getByTestId' as const, value: name },
    observed: el({ testId: name }),
  });

  it('drops the lines the parser rejects and reports them', () => {
    const elements: ProposedElement[] = [
      { name: 'A', region: 'page', targets: [target('x'), target('y'), target('x')] },
      { name: 'A', region: 'page', targets: [target('z')] },
      { name: 'Empty', region: 'page', targets: [] },
    ];
    const result = validateDraft('S', elements, 'en');
    expect(result.sanmaime).toBe('Screen: S\n\n  Element: A\n    Show: x\n    And: y\n');
    expect(result.dropped.map((d) => [d.element, d.item, d.diagnostic.code])).toEqual([
      ['A', 'x', 'SANMAIME_E014'],
      ['A', undefined, 'SANMAIME_E012'],
    ]);
    expectValid(result.sanmaime);
  });

  it('throws when nothing valid is left', () => {
    expect(() => validateDraft('S', [], 'en')).toThrow(DraftError);
  });
});

describe('renderDefinitions', () => {
  it('lays long lines out as Prettier does', async () => {
    const long = 'A very long target name that keeps going and going and going';
    const text = renderDefinitions({
      screen: 'S',
      url: `http://localhost:3000/${'x'.repeat(90)}`,
      elements: [
        {
          name: 'Element with a long name that pushes the self locator past the width',
          self: { method: 'getByRole', role: 'button', name: 'Save everything now', exact: true },
          targets: [
            { name: long, locator: { method: 'getByRole', role: 'textbox', name: long } },
            { name: 'b', locator: { method: 'getByTestId', value: long + long } },
            {
              name: 'c',
              locator: { method: 'getByRole', role: 'link', name: long + long, first: true },
            },
            { name: long, locator: { method: 'getByTestId', value: 'short', first: true } },
            { name: 'd', locator: { method: 'getByTestId', value: long + long, first: true } },
            { name: 'todo', locator: undefined },
          ],
        },
        {
          name: 'Self only element with a long name, long enough to break the line',
          self: { method: 'getByRole', role: 'button', name: 'Log in' },
          targets: [],
        },
        {
          name: 'Self only element with a long name, long enough to break the line',
          self: { method: 'getByRole', role: 'button', name: long + long, first: true },
          targets: [],
        },
        { name: 'Unknown self', selfTodo: true, targets: [{ name: 'x', locator: undefined }] },
      ],
    });
    expect(text).toContain(
      "    // TODO: not observed; write its locator.\n    todo: ({ page }) => page.getByTestId('TODO'),",
    );
    expect(text).toContain('// TODO: the element itself was not observed; write its locator.');
    await expectPrettier(text);
  });
});
