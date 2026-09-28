import { defineConfig } from '@playwright/test';
import { defineSanmaimeConfig } from 'nimaime-han';

// The directive-less Japanese specs with the default language (en): syntax errors.
export default defineConfig({
  testDir: defineSanmaimeConfig({
    specs: 'specs-config/**/*.sanmaime',
    definitions: 'definitions/**/*.ts',
  }),
});
