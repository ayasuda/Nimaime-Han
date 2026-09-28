import { defineConfig } from '@playwright/test';
import { defineSanmaimeConfig } from '../../../../src/index';

const testDir = defineSanmaimeConfig({
  specs: ['specs/**/*.sanmaime', '!specs/drafts/**'],
  definitions: 'definitions/**/*.ts',
});

export default defineConfig({ testDir });
