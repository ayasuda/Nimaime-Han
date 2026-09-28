import { defineConfig, devices } from '@playwright/test';

// End-to-end tests of nimaime-han/runtime against a real browser. Pages are served with
// page.setContent(), so no web server is needed. Chromium only.
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  // gen/ is a separate project with its own config (npm run test:e2e:gen).
  testIgnore: 'gen/**',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  // Keep failing-assertion tests fast.
  expect: { timeout: 1000 },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Optional: use an already installed Chromium whose revision differs from the one this
        // Playwright version downloads (e.g. a sandbox with preinstalled browsers).
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
        },
      },
    },
  ],
});
