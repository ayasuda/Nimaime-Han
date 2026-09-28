import { defineConfig, devices } from '@playwright/test';
import { defineSanmaimeConfig } from 'nimaime-han';
import type { AppOptions } from './fixtures';

// A run that fails on purpose (`npm run test:fail`): the README's Login specification, with the same
// definitions, against app-broken/, a version of the login page whose button is not disabled when
// the email address is invalid.
const testDir = defineSanmaimeConfig({
  specs: 'specs-failing/**/*.sanmaime',
  definitions: 'definitions/login.ts',
  importTestFrom: 'fixtures.ts',
  // Its own output directory, so that it does not replace the files of playwright.config.ts.
  outputDir: '.sanmaime-gen-failing',
});

export default defineConfig<AppOptions>({
  testDir,
  outputDir: 'test-results/failing',
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['nimaime-han/reporter']],
  // Fail fast: the expectation that fails would otherwise wait for the default 5 seconds.
  expect: { timeout: 1000 },
  use: { appDir: 'app-broken' },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
      },
    },
  ],
});
