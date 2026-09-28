import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test as base } from '@playwright/test';

export interface AppFixtures {
  /** The `file://` URL of a page of the static app in app/, e.g. `appUrl('login.html')`. */
  appUrl: (page: string, query?: Record<string, string>) => string;
}

/** The project's `test` (the `importTestFrom` file): Playwright's `test` plus `appUrl`. */
export const test = base.extend<AppFixtures>({
  // The project directory from the config file rather than `import.meta.dirname`, so that the
  // project also runs as CommonJS (NIMAIME_TOOL_PACKAGE_TYPE=commonjs, the version matrix).
  // eslint-disable-next-line no-empty-pattern
  appUrl: async ({}, use, testInfo) => {
    const root = path.dirname(testInfo.config.configFile ?? path.join(process.cwd(), 'x'));
    await use((page, query) => {
      const url = pathToFileURL(path.join(root, 'app', page));
      url.search = new URLSearchParams(query).toString();
      return url.href;
    });
  },
});
