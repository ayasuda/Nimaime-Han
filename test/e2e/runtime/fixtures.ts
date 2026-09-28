import { test as base } from '@playwright/test';
import { LOGIN_PAGE } from './app';

/** A user-defined `test` with custom fixtures (what `importTestFrom` points at). */
export const test = base.extend<{
  /** The HTML of the app under test (a custom fixture used by `defineScreen`'s `open`). */
  appHtml: string;
  /** The logged-in user's full name (a custom fixture used by a condition). */
  fullName: string;
  /** Records the order in which definition callbacks ran. */
  calls: string[];
}>({
  appHtml: LOGIN_PAGE,
  fullName: 'Alice Liddell',
  // eslint-disable-next-line no-empty-pattern
  calls: async ({}, use) => {
    await use([]);
  },
});
