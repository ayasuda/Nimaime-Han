import { defineConfig } from '@playwright/test';
import { defineSanmaimeConfig } from '../../../../src/index';

// One defineSanmaimeConfig() call per Playwright project, each with its own outputDir.
const adminDir = defineSanmaimeConfig({
  specs: 'admin/**/*.sanmaime',
  definitions: 'definitions/**/*.ts',
  outputDir: '.sanmaime-gen/admin',
  tags: '@admin',
});
const publicDir = defineSanmaimeConfig({
  specs: 'public/**/*.sanmaime',
  definitions: 'definitions/**/*.ts',
  outputDir: '.sanmaime-gen/public',
  quotes: 'double',
});

export default defineConfig({
  projects: [
    { name: 'admin', testDir: adminDir },
    { name: 'public', testDir: publicDir },
  ],
});
