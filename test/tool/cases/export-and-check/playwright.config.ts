import { defineConfig } from '@playwright/test';
import { defineSanmaimeConfig } from 'nimaime-han';

// Only nimaime-gen runs on this project (export, check, usage errors); Playwright never does.
export default defineConfig({
  testDir: defineSanmaimeConfig({
    specs: 'specs/**/*.sanmaime',
    definitions: 'definitions/**/*.ts',
  }),
});
