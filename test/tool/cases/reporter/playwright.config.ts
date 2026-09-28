import { defineConfig, devices } from '@playwright/test';
import { defineSanmaimeConfig } from 'nimaime-han';

const testDir = defineSanmaimeConfig({
  specs: 'specs/**/*.sanmaime',
  definitions: 'definitions/**/*.ts',
});

export default defineConfig({
  testDir,
  // One worker: the order of the run does not matter to the reporter, but keeps it simple.
  workers: 1,
  expect: { timeout: 500 },
  // Used with `--reporter` unset (see case.test.ts): JSON for the harness, quiet Sanmaime tree.
  reporter: [['json'], ['nimaime-han/reporter', { quiet: true }]],
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
