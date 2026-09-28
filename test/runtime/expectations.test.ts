import type { Locator } from '@playwright/test';
import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '../../src/parser';
import { KEYWORD_SLOTS } from '../../src/parser/tokens';
import {
  describeExpectation,
  EXPECTATION_KINDS,
  EXPECTATIONS,
  expectationSpec,
  expectationTitle,
  formatTextLiteral,
  formatValue,
  isExpectationKind,
  kindOfKeyword,
  parseExpectationTitle,
  parseExpectedText,
  parseIntLiteral,
  parseTextLiteral,
  splitTargetValue,
  type ExpectationKind,
  type ExpectationValue,
  type PlaywrightExpect,
} from '../../src/runtime/expectations';

/** A sample value for kinds that take one. */
function sampleValue(kind: ExpectationKind): ExpectationValue | undefined {
  const { valueType } = expectationSpec(kind);
  if (valueType === 'int') return 3;
  if (valueType === 'text') return 'Say "hi" \\ = bye';
  return undefined;
}

describe('EXPECTATIONS', () => {
  it('lists the vocabulary v1 in keyword-table order', () => {
    expect(EXPECTATION_KINDS).toEqual([
      'show',
      'hide',
      'enable',
      'disable',
      'check',
      'uncheck',
      'focus',
      'editable',
      'readonly',
      'empty',
      'text',
      'contain',
      'count',
    ]);
  });

  it.each(EXPECTATION_KINDS)('%s: is complete and consistent', (kind) => {
    const spec = expectationSpec(kind);
    expect(spec.kind).toBe(kind);
    expect(typeof spec.matcher).toBe('function');
    expect(typeof spec.describeExpected).toBe('function');
    expect(typeof spec.parseExpected).toBe('function');
    expect(typeof spec.probeActual).toBe('function');
    expect(spec.playwright).toMatch(/^(not\.)?to[A-Z]\w+\(/);
    expect(spec.family).not.toBe('');
    // A value type exactly for the target-value keywords.
    expect(spec.valueType !== undefined).toBe(spec.arity === 'target-value');
    // The keyword has a slot in the parser's tables and a spelling in every language.
    expect(KEYWORD_SLOTS[spec.keyword as keyof typeof KEYWORD_SLOTS]).toBe(spec.slot);
    for (const language of Object.values(LANGUAGES)) {
      expect(language.keywords[spec.slot].length).toBeGreaterThan(0);
    }
    expect(kindOfKeyword(spec.keyword)).toBe(kind);
    expect(isExpectationKind(kind)).toBe(true);
  });

  it('pairs opposite states in one family', () => {
    const families = (kinds: ExpectationKind[]): string[] =>
      kinds.map((kind) => EXPECTATIONS[kind].family);
    expect(new Set(families(['show', 'hide'])).size).toBe(1);
    expect(new Set(families(['enable', 'disable'])).size).toBe(1);
    expect(new Set(families(['check', 'uncheck'])).size).toBe(1);
    expect(new Set(families(['editable', 'readonly'])).size).toBe(1);
    expect(new Set(families(['show', 'enable', 'check', 'editable', 'focus', 'empty'])).size).toBe(
      6,
    );
  });

  it('rejects other kinds', () => {
    for (const kind of ['visible', 'Show', '', 'constructor', 42]) {
      expect(isExpectationKind(kind)).toBe(false);
    }
    expect(kindOfKeyword('And')).toBeUndefined();
  });
});

describe('values', () => {
  it('formats and parses quoted texts', () => {
    expect(formatTextLiteral('Welcome')).toBe('"Welcome"');
    expect(formatTextLiteral('Say "hi" \\ bye')).toBe('"Say \\"hi\\" \\\\ bye"');
    for (const text of ['', 'a = b', 'Say "hi" \\ bye', '日本語', '\\"']) {
      expect(parseTextLiteral(formatTextLiteral(text))).toBe(text);
    }
    for (const bad of ['Welcome', '"a', 'a"', '"a"b"', '"\\n"', '"a\\"', "'a'", '“a”']) {
      expect(parseTextLiteral(bad), bad).toBeUndefined();
    }
  });

  it('parses whole numbers only', () => {
    expect(parseIntLiteral('0')).toBe(0);
    expect(parseIntLiteral('042')).toBe(42);
    for (const bad of ['', '-1', '1.5', '1e3', '３', ' 1', '99999999999999999999']) {
      expect(parseIntLiteral(bad), bad).toBeUndefined();
    }
    expect(formatValue(3)).toBe('3');
    expect(formatValue('x')).toBe('"x"');
  });

  it('splits at the first standalone =', () => {
    expect(splitTargetValue('Title = "Welcome"')).toEqual({ target: 'Title', value: '"Welcome"' });
    expect(splitTargetValue('A=b = "x = y"')).toEqual({ target: 'A=b', value: '"x = y"' });
    expect(splitTargetValue('Items =3')).toBeUndefined();
    expect(splitTargetValue('Items=3')).toBeUndefined();
    expect(splitTargetValue('Items =')).toEqual({ target: 'Items', value: '' });
    expect(splitTargetValue('= "x"')).toEqual({ target: '', value: '"x"' });
    expect(splitTargetValue('A\t=　"x"')).toEqual({ target: 'A', value: '"x"' });
  });
});

describe('titles and Expected: texts', () => {
  it('writes step titles like the English Sanmaime line', () => {
    expect(expectationTitle('show', 'Username')).toBe('Show: Username');
    expect(expectationTitle('enable')).toBe('Enable');
    expect(expectationTitle('readonly', 'Account ID')).toBe('ReadOnly: Account ID');
    expect(expectationTitle('text', 'Title', 'Welcome')).toBe('Text: Title = "Welcome"');
    expect(expectationTitle('count', 'Items', 3)).toBe('Count: Items = 3');
  });

  it('describes the expected state', () => {
    expect(describeExpectation('show', 'Username')).toBe('Username is shown');
    expect(describeExpectation('hide', 'Full name')).toBe('Full name is hidden');
    expect(describeExpectation('enable')).toBe('enabled');
    expect(describeExpectation('disable', 'Login button')).toBe('Login button is disabled');
    expect(describeExpectation('check')).toBe('checked');
    expect(describeExpectation('uncheck', 'Remember me')).toBe('Remember me is not checked');
    expect(describeExpectation('focus')).toBe('focused');
    expect(describeExpectation('editable')).toBe('editable');
    expect(describeExpectation('readonly', 'Account ID')).toBe('Account ID is read-only');
    expect(describeExpectation('empty')).toBe('empty');
    expect(describeExpectation('text', 'Title', 'Welcome')).toBe('Title has text "Welcome"');
    expect(describeExpectation('contain', 'Summary', 'a "b"')).toBe(
      'Summary contains text "a \\"b\\""',
    );
    expect(describeExpectation('count', 'Items', 3)).toBe('Count of Items is 3');
  });

  it.each(EXPECTATION_KINDS)('%s: titles and Expected: texts round-trip', (kind) => {
    const spec = expectationSpec(kind);
    const value = sampleValue(kind);
    const targets = spec.arity === 'optional-target' ? [undefined, 'Remember me'] : ['Items'];
    for (const target of targets) {
      const parsed = { kind, target, ...(value === undefined ? {} : { value }) };
      expect(parseExpectationTitle(expectationTitle(kind, target, value))).toEqual(parsed);
      expect(parseExpectedText(describeExpectation(kind, target, value))).toEqual(parsed);
    }
  });

  it('does not recognise other texts', () => {
    for (const title of [
      'Screen: A',
      'When: B',
      'Show',
      'Text',
      'Text: A',
      'Count: A = x',
      'Enabled',
    ]) {
      expect(parseExpectationTitle(title), title).toBeUndefined();
    }
    for (const text of ['visible', 'A is visible', 'Count of A is many', 'A has text Welcome']) {
      expect(parseExpectedText(text), text).toBeUndefined();
    }
  });
});

describe('matchers', () => {
  /** A fake `expect` that records the matcher called (`not.` included) and its arguments. */
  function recordingExpect(calls: string[]): PlaywrightExpect {
    const matchers = (prefix: string): unknown =>
      new Proxy(
        {},
        {
          get: (_, name: string) => {
            if (name === 'not') return matchers('not.');
            return (...args: unknown[]) => {
              calls.push(`${prefix}${name}(${args.map((a) => JSON.stringify(a)).join(', ')})`);
              return Promise.resolve();
            };
          },
        },
      );
    return ((_locator: unknown) => matchers('')) as unknown as PlaywrightExpect;
  }

  it.each(EXPECTATION_KINDS)('%s: calls the documented Playwright matcher', async (kind) => {
    const calls: string[] = [];
    const spec = expectationSpec(kind);
    const value = sampleValue(kind);
    await spec.matcher(recordingExpect(calls), {} as Locator, value);
    const expected = spec.playwright
      .replace('(text)', `(${JSON.stringify(value)})`)
      .replace('(n)', `(${JSON.stringify(value)})`);
    expect(calls).toEqual([expected]);
  });
});

describe('probes', () => {
  interface State {
    count: number;
    visible?: boolean;
    enabled?: boolean;
    checked?: boolean;
    editable?: boolean;
    focused?: boolean;
    value?: string;
    text?: string | null;
  }

  function fakeLocator(state: State): Locator {
    const read = <T>(value: T | undefined): Promise<T> =>
      value === undefined ? Promise.reject(new Error('cannot read')) : Promise.resolve(value);
    return {
      count: () => Promise.resolve(state.count),
      isVisible: () => Promise.resolve(state.visible ?? false),
      isEnabled: () => read(state.enabled),
      isChecked: () => read(state.checked),
      isEditable: () => read(state.editable),
      textContent: () => read(state.text),
      evaluate: (fn: unknown) =>
        String(fn).includes('activeElement') ? read(state.focused) : read(state.value),
    } as unknown as Locator;
  }

  const probe = (kind: ExpectationKind, state: State): Promise<string | undefined> =>
    expectationSpec(kind).probeActual(fakeLocator(state));

  it('observes each state', async () => {
    expect(await probe('check', { count: 1, checked: false })).toBe('not checked');
    expect(await probe('uncheck', { count: 1, checked: true })).toBe('checked');
    expect(await probe('focus', { count: 1, focused: false })).toBe('not focused');
    expect(await probe('focus', { count: 1, focused: true })).toBe('focused');
    expect(await probe('editable', { count: 1, editable: false })).toBe('read-only');
    expect(await probe('readonly', { count: 1, editable: true })).toBe('editable');
    expect(await probe('empty', { count: 1, value: '  ' })).toBe('empty');
    expect(await probe('empty', { count: 1, value: 'Hello\n world' })).toBe('text "Hello world"');
  });

  it('observes texts and counts', async () => {
    expect(await probe('text', { count: 1, text: '  Hello \n "you" ' })).toBe(
      'text "Hello \\"you\\""',
    );
    expect(await probe('contain', { count: 1, text: null })).toBe('text ""');
    expect(await probe('text', { count: 1, text: 'x'.repeat(200) })).toBe(
      `text "${'x'.repeat(79)}…"`,
    );
    expect(await probe('count', { count: 2 })).toBe('2');
    expect(await probe('count', { count: 0 })).toBe('0');
  });

  it('reports missing and ambiguous elements, and never throws', async () => {
    expect(await probe('check', { count: 0 })).toBe('not found');
    expect(await probe('text', { count: 3 })).toBe('3 matching elements (expected exactly one)');
    expect(await probe('check', { count: 1 })).toBeUndefined();
    expect(await probe('focus', { count: 1 })).toBeUndefined();
  });
});
