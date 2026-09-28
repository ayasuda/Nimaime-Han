// Scenario-style tests (like playwright-bdd steps) that end with $nimaime.verify(). Run in a
// nested Playwright process by ../verify.spec.ts; the second test fails on purpose (the page shows
// another user's email address). The main e2e config only matches *.spec.ts.
import { loadSanmaimeSpecs, nimaimeFixtures } from '../../../../src/runtime/index';
import { test as base } from '../fixtures';
import { profilePage } from './app';
import './definitions';

await loadSanmaimeSpecs('profile.sanmaime', { cwd: import.meta.dirname });

const test = base.extend(nimaimeFixtures);

test('own profile', async ({ $nimaime, page }) => {
  await test.step('When the user opens their profile', async () => {
    await page.setContent(profilePage({ own: true }));
  });
  await test.step('Then the account profile screen is displayed', async () => {
    await $nimaime.verify({ page }, 'Account Profile', { when: 'Own profile' });
  });
});

test("another user's profile", async ({ $nimaime, page }) => {
  await test.step("When the user opens another user's profile", async () => {
    await page.setContent(profilePage({ own: false, buggy: true }));
  });
  await test.step("Then another user's profile is displayed", async () => {
    await $nimaime.verify({ page }, 'Account Profile', { when: "Another user's profile" });
  });
});
