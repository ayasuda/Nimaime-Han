// $nimaime.verify(): checking the current page against a Sanmaime screen loaded at run time
// (./verify/profile.sanmaime), without opening the screen or establishing conditions — what a
// playwright-bdd `Then` step does after the `Given` / `When` steps brought the page there.
// ./verify/reported-steps.spec.ts checks what reporters see (steps, failures) in a nested run.
import {
  createNimaimeTest,
  loadSanmaimeSpecs,
  NimaimeExpectationError,
  NimaimeRuntimeError,
} from '../../../src/runtime/index';
import { test as customTest } from './fixtures';
import { profilePage } from './verify/app';
import './verify/definitions';

await loadSanmaimeSpecs('verify/*.sanmaime', { cwd: import.meta.dirname });

const test = createNimaimeTest(customTest);
const { expect } = test;

test.describe('$nimaime.verify', () => {
  test('checks the invariants and the When: blocks without calling open or conditions', async ({
    $nimaime,
    page,
    calls,
  }) => {
    await page.setContent(profilePage({ own: true }));
    await $nimaime.verify({ page }, 'Account Profile', { when: 'Own profile' });
    expect(calls).toEqual([]);
  });

  test('without `when`, checks the unconditional expectations only', async ({ $nimaime, page }) => {
    // Neither state: only `Show: Username` applies.
    await page.setContent('<h1 data-testid="username">alice</h1>');
    await $nimaime.verify({ page }, 'Account Profile');
  });

  test('`elements` restricts the check', async ({ $nimaime, page }) => {
    await page.setContent(profilePage({ own: false }));
    await $nimaime.verify({ page }, 'Account Profile', {
      when: ["Another user's profile"],
      elements: ['Profile Card'],
    });
    await expect(
      $nimaime.verify({ page }, 'Account Profile', {
        when: 'Own profile',
        elements: 'Profile Actions',
      }),
    ).rejects.toThrow(NimaimeExpectationError);
  });

  test('a failure carries the Sanmaime header', async ({ $nimaime, page }) => {
    await page.setContent(profilePage({ own: false, buggy: true }));
    const error = await $nimaime
      .verify({ page }, 'Account Profile', { when: "Another user's profile" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NimaimeExpectationError);
    expect((error as Error).message.split('\n\nDetails:')[0]).toBe(
      [
        'Screen: Account Profile',
        'Element: Profile Card',
        "When: Another user's profile",
        'Expected: Email address is hidden',
        'Actual: shown (after 1000ms)',
        'Location: test/e2e/runtime/verify/profile.sanmaime:13',
      ].join('\n'),
    );
  });

  test('unknown names are runtime errors listing the known names', async ({ $nimaime, page }) => {
    await expect($nimaime.verify({ page }, 'Nope')).rejects.toThrow(NimaimeRuntimeError);
    await expect($nimaime.verify({ page }, 'Nope')).rejects.toThrow(
      /Loaded screens: .*"Account Profile"/,
    );
    await expect($nimaime.verify({ page }, 'Account Profile', { when: 'Admin' })).rejects.toThrow(
      `Screen "Account Profile" has no "When: Admin" block. ` +
        `Conditions: "Own profile", "Another user's profile".`,
    );
  });
});
