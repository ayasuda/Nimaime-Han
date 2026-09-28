import { defineConfig } from 'vitest/config';

// Tool test cases (npm run test:tool): each runs the built nimaime-gen and `playwright test` on a
// project under test/tool/cases/ (see docs/contributing-tests.md). Needs `npm run build` first.
export default defineConfig({
  test: {
    include: ['test/tool/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    environment: 'node',
    // Every case starts Chromium; keep a few at a time.
    maxWorkers: 4,
    testTimeout: 180_000,
    hookTimeout: 60_000,
  },
});
