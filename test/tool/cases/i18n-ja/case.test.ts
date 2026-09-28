import { expect, it } from 'vitest';
import { runCase } from '../../harness';

it('reads Japanese keywords from a `# language: ja` directive', async () => {
  const { playwright } = await runCase(import.meta.dirname, {
    stdout: ['Generated 2 spec files (6 tests) into .sanmaime-gen'],
    generated: ['.sanmaime-gen/specs/en.spec.ts', '.sanmaime-gen/specs/ja/user-details.spec.ts'],
    playwright: {
      passed: 6,
      stdout: [
        '✓ Screen: ユーザー詳細',
        '  ✓ Element: ユーザー情報',
        '    ✓ ユーザー名 is shown',
        '    When: 他のユーザーのプロフィールを閲覧している\n      ✓ 氏名 is hidden',
      ],
    },
  });
  // Titles use the canonical English prefixes whatever the spec language.
  expect(playwright?.tests.map((test) => test.title)).toContain(
    'Screen: ユーザー詳細 > Element: 編集ボタン > When: 他のユーザーのプロフィールを閲覧している',
  );
});

it("reads Japanese keywords by default with the config's `language: 'ja'`", async () => {
  await runCase(import.meta.dirname, {
    args: ['-c', 'playwright.language.config.ts'],
    stdout: ['Generated 1 spec file (2 tests) into .sanmaime-gen'],
    generated: ['.sanmaime-gen/specs-config/user-details.spec.ts'],
    playwright: { args: ['-c', 'playwright.language.config.ts'], passed: 2 },
  });
});

it('does not read Japanese keywords without the directive or the option', async () => {
  const { gen } = await runCase(import.meta.dirname, {
    args: ['-c', 'playwright.english.config.ts'],
    exitCode: 1,
    generated: [],
    stderr: [/^Syntax errors: \d+\n/, 'specs-config/user-details.sanmaime:2:1\n    SANMAIME_E'],
  });
  expect(gen.stderr).toContain('nothing was generated');
});
