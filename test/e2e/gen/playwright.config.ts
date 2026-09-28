import { defineConfig, devices } from '@playwright/test';
import { defineSanmaimeConfig } from 'nimaime-han';

// A small project using nimaime-han the way users do: `npx nimaime-gen && npx playwright test`.
// Run it with `npm run test:e2e:gen` (see run.js). Pages are served with page.setContent().
const testDir = defineSanmaimeConfig({
  // Pinned, because `playwright test -c test/e2e/gen` is started from the repository root.
  configDir: import.meta.dirname,
  specs: 'specs/**/*.sanmaime',
  definitions: 'definitions/**/*.ts',
  importTestFrom: 'fixtures.ts',
});

export default defineConfig({
  testDir,
  // The generated specs import `nimaime-han` / `nimaime-han/runtime` as a package (resolved
  // through package.json "exports" to dist/, so `npm run build` must run first). This tsconfig has
  // no `paths`, unlike the root one, which maps `nimaime-han` to src/ for type checking.
  tsconfig: './tsconfig.playwright.json',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
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
