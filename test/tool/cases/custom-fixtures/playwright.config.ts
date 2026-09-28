import { defineConfig, devices } from '@playwright/test';
import { defineSanmaimeConfig } from 'nimaime-han';
import type { TodoOptions } from './support/test';

const testDir = defineSanmaimeConfig({
  specs: 'specs/**/*.sanmaime',
  definitions: 'definitions/**/*.ts',
  importTestFrom: { file: 'support/test.ts', varName: 'myTest' },
  quotes: 'double',
});

export default defineConfig<TodoOptions>({
  testDir,
  expect: { timeout: 2000 },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
        initialTodos: ['Buy milk'],
      },
    },
  ],
});
