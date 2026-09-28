import { defineConfig } from '@playwright/test';
import { defineSanmaimeConfig } from '../../../../src/index';

const testDir = defineSanmaimeConfig({
  specs: 'specs/**/*.sanmaime',
  definitions: ['definitions/**/*.ts'],
  importTestFrom: 'fixtures.ts',
});

export default defineConfig({ testDir });
