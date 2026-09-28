import { defineConfig, devices } from '@playwright/test';
import { defineSanmaimeConfig } from 'nimaime-han';

// Two Sanmaime configurations, one per Playwright project, each with its own outputDir.
const chromium = {
  ...devices['Desktop Chrome'],
  launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
};

export default defineConfig({
  expect: { timeout: 2000 },
  projects: [
    {
      name: 'admin',
      testDir: defineSanmaimeConfig({
        specs: 'admin/specs/**/*.sanmaime',
        definitions: 'admin/definitions/**/*.ts',
        outputDir: '.sanmaime-gen/admin',
      }),
      use: chromium,
    },
    {
      name: 'public',
      testDir: defineSanmaimeConfig({
        specs: 'public/specs/**/*.sanmaime',
        definitions: 'public/definitions/**/*.ts',
        outputDir: '.sanmaime-gen/public',
      }),
      use: chromium,
    },
  ],
});
