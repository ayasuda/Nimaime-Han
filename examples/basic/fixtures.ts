import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test as base } from '@playwright/test';

export interface AppOptions {
  /** Directory of the static app, relative to this file. `playwright.failing.config.ts` changes it. */
  appDir: string;
}

export interface AppFixtures {
  /**
   * The `file://` URL of a page of the app, e.g. `appUrl('login.html')` or
   * `appUrl('user-details.html', { user: 'bob' })`. No web server is needed.
   */
  appUrl: (page: string, query?: Record<string, string>) => string;
}

/** The project's `test` (the `importTestFrom` file): Playwright's `test` plus the app fixtures. */
export const test = base.extend<AppFixtures & AppOptions>({
  appDir: ['app', { option: true }],
  appUrl: async ({ appDir }, use) => {
    const root = path.resolve(import.meta.dirname, appDir);
    await use((page, query) => {
      const url = pathToFileURL(path.join(root, page));
      url.search = new URLSearchParams(query).toString();
      return url.href;
    });
  },
});
