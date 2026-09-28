import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Playwright end-to-end tests (npm run test:e2e).
    exclude: ['**/node_modules/**', 'test/e2e/**'],
    environment: 'node',
  },
});
