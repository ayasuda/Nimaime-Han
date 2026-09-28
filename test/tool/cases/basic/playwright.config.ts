import { defineConfig, devices } from '@playwright/test';
import { defineSanmaimeConfig } from 'nimaime-han';

// The README's Login and User Details examples against a static app (file:// URLs).
const testDir = defineSanmaimeConfig({
  specs: 'specs/**/*.sanmaime',
  definitions: 'definitions/**/*.ts',
  importTestFrom: 'fixtures.ts',
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
