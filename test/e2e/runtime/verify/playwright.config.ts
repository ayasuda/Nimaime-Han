import { defineConfig, devices } from '@playwright/test';

// Runs ./scenario.fixture.ts for ../verify.spec.ts, which checks the steps and failures that
// $nimaime.verify() reports. The reporter is chosen on the command line.
export default defineConfig({
  testDir: '.',
  testMatch: '*.fixture.ts',
  outputDir: '../../../../test-results/verify-fixture',
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
