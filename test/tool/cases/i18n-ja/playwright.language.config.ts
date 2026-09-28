import { defineConfig, devices } from '@playwright/test';
import { defineSanmaimeConfig } from 'nimaime-han';

// Japanese by default: the specs have no `# language:` directive.
const testDir = defineSanmaimeConfig({
  specs: 'specs-config/**/*.sanmaime',
  definitions: 'definitions/**/*.ts',
  language: 'ja',
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
