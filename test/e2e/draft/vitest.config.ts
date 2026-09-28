import { defineConfig } from 'vitest/config';

// End-to-end tests of `nimaime draft` against a real browser (npm run test:e2e:draft).
// Chromium only; set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to use an already installed Chromium.
export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ['**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
