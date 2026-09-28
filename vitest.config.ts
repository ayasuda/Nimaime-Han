import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Playwright end-to-end tests (npm run test:e2e) and the tool test cases, which need a build
    // and a browser (npm run test:tool, vitest.tool.config.ts).
    exclude: ['**/node_modules/**', 'test/e2e/**', 'test/tool/**'],
    environment: 'node',
  },
});
