import { defineConfig, devices } from '@playwright/test';
import { defineSanmaimeConfig } from 'nimaime-han';

// Default language (en): Japanese specs say so with a `# language: ja` directive.
const testDir = defineSanmaimeConfig({
  specs: 'specs/**/*.sanmaime',
  definitions: 'definitions/**/*.ts',
});

export default defineConfig({
  testDir,
  expect: { timeout: 2000 },
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
