import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

// `npm test` runs `bddgen && playwright test`: bddgen turns features/*.feature into Playwright
// specs in .features-gen/. No nimaime-gen here: the Then steps load specs/*.sanmaime at run time
// (see fixtures.ts) and check the page with $nimaime.verify().
const testDir = defineBddConfig({
  features: 'features/**/*.feature',
  // The fixtures file (exports `test`), the step definitions, and the Sanmaime element
  // definitions the Then steps use.
  steps: ['fixtures.ts', 'steps/**/*.ts', 'definitions/**/*.ts'],
});

export default defineConfig({
  testDir,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
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
