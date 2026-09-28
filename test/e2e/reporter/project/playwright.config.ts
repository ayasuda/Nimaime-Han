import { defineConfig, devices } from '@playwright/test';

// The Playwright run that test/e2e/reporter/reporter.spec.ts reports on with nimaime-han/reporter:
// the runtime e2e specs (all passing; not reporting.spec.ts, which runs a nested Playwright itself)
// plus ./*.scenario.ts, which fail and skip on purpose. The scenarios are not *.spec.ts files, so
// `npm run test:e2e` does not run them directly.
//
//   npx playwright test -c test/e2e/reporter/project/playwright.config.ts \
//     --reporter=./src/reporter/index.ts
export default defineConfig({
  testDir: '../..',
  testMatch: [
    /[\\/]runtime[\\/][^\\/]+\.spec\.ts$/,
    /[\\/]reporter[\\/]project[\\/][^\\/]+\.scenario\.ts$/,
  ],
  testIgnore: /[\\/]runtime[\\/]reporting\.spec\.ts$/,
  outputDir: '../../../../test-results/reporter-project',
  fullyParallel: true,
  retries: 0,
  expect: { timeout: 1000 },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
        },
      },
    },
  ],
});
