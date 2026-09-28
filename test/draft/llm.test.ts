/**
 * LLM refinement (`proposeWithLlm`) with fake adapters: validation, retry with diagnostics, and
 * fallback to the rule-based draft.
 */
import { describe, expect, it } from 'vitest';
import {
  extractSanmaime,
  proposeSanmaime,
  proposeWithLlm,
  SANMAIME_GRAMMAR_SUMMARY,
  type LlmAdapter,
  type LlmRequest,
} from '../../src/draft';
import { parse } from '../../src/parser';
import { LOGIN } from './fixtures';

/** An adapter that answers from a script and records the requests. */
function scripted(answers: (string | Error)[]): { adapter: LlmAdapter; requests: LlmRequest[] } {
  const requests: LlmRequest[] = [];
  const adapter: LlmAdapter = (request) => {
    requests.push(request);
    const answer = answers.shift() ?? new Error('no more answers');
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  };
  return { adapter, requests };
}

const IMPROVED = `Screen: Login

  Element: Login Form
    Show: Email address
    And: Password
    And: Log in button

  Element: Login Button
    Disable
`;

describe('proposeWithLlm', () => {
  it('asks again with the diagnostics, then uses the valid answer', async () => {
    const { adapter, requests } = scripted([
      'Screen: Login\n  Element: Login Form\n    And: Password\n',
      `Here you go:\n\n\`\`\`sanmaime\n${IMPROVED}\`\`\`\n`,
    ]);
    const result = await proposeWithLlm(LOGIN, { screen: 'Login' }, adapter);
    expect(result.source).toBe('llm');
    expect(result.sanmaime).toBe(IMPROVED);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.problems.join('\n')).toContain('SANMAIME_E007');

    expect(requests).toHaveLength(2);
    const [first, second] = requests;
    expect(first?.system).toContain(SANMAIME_GRAMMAR_SUMMARY);
    expect(first?.candidate).toBe(proposeSanmaime(LOGIN, { screen: 'Login' }).sanmaime);
    expect(first?.prompt).toContain('Screen name: Login (keep it exactly).');
    expect(first?.prompt).toContain('Candidate draft (valid; improve it):');
    expect(first?.prompt).toContain('- button "Log in" disabled');
    expect(first?.prompt).not.toContain('previous answer');
    expect(first?.observation).toBe(LOGIN);
    expect(second?.prompt).toContain('Your previous answer was rejected:');
    expect(second?.prompt).toContain('SANMAIME_E007');

    // The definitions reuse the observed locators; the renamed self-only element finds its control.
    expect(result.definitions).toContain(
      "  'Email address': ({ page }) => page.getByRole('textbox', { name: 'Email address' }),",
    );
    expect(result.definitions).toContain(
      "defineElement('Login Button', ({ page }) => page.getByTestId('TODO'));",
    );
    expect(result.definitions).toContain(
      '// TODO: the element itself was not observed; write its locator.',
    );
    expect(result.unmatchedTargets).toEqual([]);
  });

  it('falls back to the rule-based draft when every answer is invalid', async () => {
    const { adapter, requests } = scripted([
      'nonsense',
      'Screen: Other\n  Element: A\n    Show: B\n',
    ]);
    const result = await proposeWithLlm(LOGIN, { screen: 'Login' }, adapter);
    expect(requests).toHaveLength(2);
    expect(result.source).toBe('rule-based');
    expect(result.sanmaime).toBe(result.candidate.sanmaime);
    expect(result.definitions).toBe(result.candidate.definitions);
    expect(result.rejected.map((r) => r.problems)).toEqual([
      [expect.stringContaining('SANMAIME_E001')],
      ['The screen must be named "Login".'],
    ]);
  });

  it('falls back when the adapter throws or returns no string', async () => {
    const failing = await proposeWithLlm(LOGIN, { screen: 'Login', maxAttempts: 1 }, () =>
      Promise.reject(new Error('rate limited')),
    );
    expect(failing.source).toBe('rule-based');
    expect(failing.rejected[0]?.problems).toEqual(['The adapter failed: rate limited']);
    const broken = (() => Promise.resolve(42)) as unknown as LlmAdapter;
    const result = await proposeWithLlm(LOGIN, { screen: 'Login', maxAttempts: 1 }, broken);
    expect(result.rejected[0]?.problems).toEqual(['The adapter did not return a string.']);
  });

  it('writes TODO locators for targets that were not observed', async () => {
    const { adapter } = scripted([
      'Screen: Login\n\n  Element: Login Form\n    Show: Password\n    And: Forgot password link\n',
    ]);
    const result = await proposeWithLlm(LOGIN, { screen: 'Login' }, adapter);
    expect(result.source).toBe('llm');
    expect(result.unmatchedTargets).toEqual([
      { element: 'Login Form', target: 'Forgot password link' },
    ]);
    expect(result.definitions).toContain(
      "  // TODO: not observed; write its locator.\n  'Forgot password link': ({ page }) => page.getByTestId('TODO'),",
    );
  });

  it('keeps Japanese drafts explicit about their language', async () => {
    const { adapter, requests } = scripted([
      '画面: ログイン\n\n  要素: ログインフォーム\n    表示: Password\n',
    ]);
    const result = await proposeWithLlm(LOGIN, { screen: 'ログイン', language: 'ja' }, adapter);
    expect(requests[0]?.system).toContain("Japanese keywords ('# language: ja' first)");
    expect(result.source).toBe('llm');
    expect(result.sanmaime.startsWith('# language: ja\n画面: ログイン\n')).toBe(true);
    expect(parse(result.sanmaime).diagnostics).toEqual([]);
  });
});

describe('extractSanmaime', () => {
  it('strips code fences and surrounding blank lines', () => {
    expect(extractSanmaime('```\nScreen: A\n```')).toBe('Screen: A\n');
    expect(extractSanmaime('\n\nScreen: A\n\n\n')).toBe('Screen: A\n');
  });
});
