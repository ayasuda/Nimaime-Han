// A plain JavaScript (ESM) config. It imports the TypeScript sources directly; Playwright's loader
// transforms them (a real project would import from 'nimaime-han').
import { defineConfig } from '@playwright/test';
import { defineSanmaimeConfig } from '../../../../src/index.ts';

export default defineConfig({
  testDir: defineSanmaimeConfig({ specs: '*.sanmaime', definitions: '*.js', outputDir: 'out' }),
});
