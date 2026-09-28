import { defineConfig } from '@playwright/test';
import { defineSanmaimeConfig, type SanmaimeConfig } from '../../../../src/index';

// Invalid on purpose: "specs" is missing.
const config = { definitions: 'definitions/**/*.ts' } as unknown as SanmaimeConfig;

export default defineConfig({ testDir: defineSanmaimeConfig(config) });
