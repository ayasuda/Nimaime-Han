import { defineConfig, devices } from '@playwright/test';
import { defineSanmaimeConfig } from 'nimaime-han';

// No importTestFrom: the generated specs use @playwright/test's `test`.
const testDir = defineSanmaimeConfig({
  specs: 'specs/**/*.sanmaime',
  definitions: 'definitions/**/*.ts',
});

export default defineConfig({
  testDir,
  // Keep the failing expectation fast.
  expect: { timeout: 500 },
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
