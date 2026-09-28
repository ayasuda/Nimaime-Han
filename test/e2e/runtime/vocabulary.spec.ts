// Every matcher of the expectation vocabulary v1 (src/runtime/expectations.ts) against a real
// page: passing checks on a target and on the element itself, and the failure message (Expected:
// phrasing and probed Actual:) of each kind when it fails.
import { test as base } from '@playwright/test';
import { createNimaime } from '../../../src/index';
import {
  createNimaimeTest,
  expect,
  NimaimeExpectationError,
  type NimaimeExpectation,
} from '../../../src/runtime/index';

const test = createNimaimeTest(base);
const { defineScreen, defineElement, defineCondition } = createNimaime(base);

const PAGE = /* html */ `
  <h1 data-testid="title">  Welcome   back </h1>
  <p data-testid="summary">3 results for "Tokyo"</p>
  <ul><li>Tokyo</li><li>Kyoto</li><li>Osaka</li></ul>
  <label><input type="checkbox" data-testid="remember" checked /> Remember me</label>
  <label><input type="checkbox" data-testid="newsletter" /> Newsletter</label>
  <input data-testid="email" aria-label="Email" />
  <input data-testid="account" aria-label="Account" value="A-42" readonly />
  <div data-testid="notes"></div>
  <button data-testid="save" disabled>Save</button>
`;

defineScreen('Vocabulary', { open: ({ page }) => page.setContent(PAGE) });
defineElement('Vocabulary Form', ({ page }) => page.getByTestId('email'), {
  Title: ({ page }) => page.getByTestId('title'),
  Summary: ({ page }) => page.getByTestId('summary'),
  Results: ({ page }) => page.getByRole('listitem'),
  'Remember me': ({ page }) => page.getByTestId('remember'),
  Newsletter: ({ page }) => page.getByTestId('newsletter'),
  Account: ({ page }) => page.getByTestId('account'),
  Notes: ({ page }) => page.getByTestId('notes'),
  Save: ({ page }) => page.getByTestId('save'),
});
defineCondition('The email field is focused', async ({ page }) => {
  await page.getByTestId('email').focus();
});

const plan = (expectations: NimaimeExpectation[], conditions?: string[]) => ({
  screen: 'Vocabulary',
  element: 'Vocabulary Form',
  ...(conditions ? { conditions } : {}),
  expectations,
  file: 'vocabulary.sanmaime',
});

test.describe('expectation vocabulary v1', () => {
  test('every kind passes on a matching page', async ({ $nimaime, page }) => {
    await $nimaime.run(
      { page },
      plan(
        [
          { kind: 'show', target: 'Title' },
          { kind: 'text', target: 'Title', value: 'Welcome back' },
          { kind: 'contain', target: 'Summary', value: 'results for "Tokyo"' },
          { kind: 'count', target: 'Results', value: 3 },
          { kind: 'check', target: 'Remember me' },
          { kind: 'uncheck', target: 'Newsletter' },
          { kind: 'focus' },
          { kind: 'editable' },
          { kind: 'empty' },
          { kind: 'readonly', target: 'Account' },
          { kind: 'empty', target: 'Notes' },
          { kind: 'disable', target: 'Save' },
          { kind: 'enable' },
        ],
        ['The email field is focused'],
      ),
    );
  });

  const failures: [NimaimeExpectation, string, RegExp][] = [
    [
      { kind: 'text', target: 'Title', value: 'Hello' },
      'Title has text "Hello"',
      /^text "Welcome back"/,
    ],
    [
      { kind: 'contain', target: 'Summary', value: 'Osaka' },
      'Summary contains text "Osaka"',
      /^text "3 results for \\"Tokyo\\""/,
    ],
    [
      { kind: 'count', target: 'Results', value: 2 },
      'Count of Results is 2',
      /^3 \(after 1000ms\)$/,
    ],
    [{ kind: 'uncheck', target: 'Remember me' }, 'Remember me is not checked', /^checked/],
    [{ kind: 'check' }, 'checked', /./],
    [{ kind: 'focus' }, 'focused', /^not focused/],
    [{ kind: 'editable', target: 'Account' }, 'Account is editable', /^read-only/],
    [{ kind: 'readonly' }, 'read-only', /^editable/],
    [{ kind: 'empty', target: 'Summary' }, 'Summary is empty', /^text "3 results/],
    [{ kind: 'enable', target: 'Save' }, 'Save is enabled', /^disabled/],
  ];

  for (const [expectation, expected, actual] of failures) {
    test(`a failing ${expectation.kind} says "${expected}"`, async ({ $nimaime, page }) => {
      const error = await $nimaime
        .run({ page }, plan([{ ...expectation, location: { line: 7, column: 5 } }]))
        .then(
          () => undefined,
          (e: unknown) => e,
        );
      expect(error).toBeInstanceOf(NimaimeExpectationError);
      const failure = error as NimaimeExpectationError;
      const json = failure.toJSON();
      expect(json.expected).toBe(expected);
      expect(failure.message.split('\n')).toContain(`Expected: ${expected}`);
      // Checking an unchecked checkbox of the element itself (an email input) cannot be probed.
      if (expectation.kind !== 'check') {
        expect(failure.message.split('\n').find((l) => l.startsWith('Actual: '))).toMatch(
          new RegExp(`^Actual: ${actual.source.replace(/^\^/, '')}`),
        );
      }
      expect(json.expectation).toEqual({
        kind: expectation.kind,
        target: expectation.target ?? null,
        ...(expectation.value === undefined ? {} : { value: expectation.value }),
      });
    });
  }
});
