import { expect, it } from 'vitest';
import { runCase } from '../../harness';

it('generates the README examples and every test passes', async () => {
  const { playwright } = await runCase(import.meta.dirname, {
    stdout: [/^Generated 2 spec files \(6 tests\) into \.sanmaime-gen/],
    generated: ['.sanmaime-gen/specs/login.spec.ts', '.sanmaime-gen/specs/user-details.spec.ts'],
    playwright: {
      passed: 6,
      stdout: [
        '✓ Screen: Login',
        '✓ Screen: User Details',
        /2 screens, 4 elements, \d+ expectations: \d+ passed, 0 failed, 0 skipped/,
      ],
    },
  });
  expect(playwright?.tests.map((test) => test.title).sort()).toEqual([
    'Screen: Login > Element: Login Button > When: Input is invalid',
    'Screen: Login > Element: Login Button > When: Input is valid',
    'Screen: Login > Element: Login Form > Always',
    'Screen: User Details > Element: Edit Action > When: The user can edit the profile',
    "Screen: User Details > Element: User Information > When: Viewing another user's profile",
    'Screen: User Details > Element: User Information > When: Viewing your own profile',
  ]);
});
