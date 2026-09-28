import { defineConfig, devices } from '@playwright/test';

// Runs ./readme.fixture.ts — deliberately failing tests — for ../reporting.spec.ts, which checks
// what Playwright's own reporters print for Sanmaime failures. The reporter is chosen on the
// command line.
export default defineConfig({
  testDir: '.',
  testMatch: '*.fixture.ts',
  outputDir: '../../../../test-results/reporting-fixture',
  workers: 1,
  expect: { timeout: 1000 },
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
