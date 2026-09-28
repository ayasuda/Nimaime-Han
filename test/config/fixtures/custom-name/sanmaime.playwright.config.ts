import { defineConfig } from '@playwright/test';
import { defineSanmaimeConfig } from '../../../../src/index';

export default defineConfig({
  testDir: defineSanmaimeConfig({
    specs: 'specs/*.sanmaime',
    definitions: 'defs.ts',
    outputDir: 'generated',
    language: 'en',
    verbose: true,
  }),
});
