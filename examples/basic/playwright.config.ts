import { defineConfig, devices } from '@playwright/test';
import { defineSanmaimeConfig } from 'nimaime-han';

// `npm test` runs `nimaime-gen && playwright test`: nimaime-gen turns specs/**/*.sanmaime into
// Playwright specs in .sanmaime-gen/, which Playwright then runs.
const testDir = defineSanmaimeConfig({
  specs: 'specs/**/*.sanmaime',
  definitions: 'definitions/**/*.ts',
  importTestFrom: 'fixtures.ts',
});

export default defineConfig({
  testDir,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Playwright's progress list, then the Sanmaime ✓/✗ tree.
  reporter: [['list'], ['nimaime-han/reporter']],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Optional: an already installed Chromium (e.g. when the revision this Playwright version
        // expects cannot be downloaded).
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
      },
    },
  ],
});
