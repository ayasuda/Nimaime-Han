import { test as base } from '@playwright/test';
import { LOGIN_PAGE, PROFILE_PAGE } from './app';

/** The custom `test` of the project (the `importTestFrom` file). */
export const test = base.extend<{
  loginHtml: string;
  profileHtml: string;
  /** The user whose profile is shown by the conditions. */
  currentUser: { name: string; email: string };
}>({
  loginHtml: LOGIN_PAGE,
  profileHtml: PROFILE_PAGE,
  currentUser: { name: 'Alice Liddell', email: 'alice@example.com' },
});
