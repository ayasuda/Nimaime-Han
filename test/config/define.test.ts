import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CONFIG_DIR_ENV_VAR, clearSanmaimeConfigs, getSanmaimeConfigs } from '../../src/config';
import { defineSanmaimeConfig, SanmaimeConfigError, type SanmaimeConfig } from '../../src/index';

const minimal: SanmaimeConfig = {
  specs: 'specs/**/*.sanmaime',
  definitions: 'definitions/**/*.ts',
};

describe('defineSanmaimeConfig', () => {
  beforeEach(() => {
    clearSanmaimeConfigs();
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete process.env[CONFIG_DIR_ENV_VAR];
  });
  afterEach(() => {
    clearSanmaimeConfigs();
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete process.env[CONFIG_DIR_ENV_VAR];
  });

  it('returns the absolute outputDir (resolved against process.cwd() by default) and registers the config', () => {
    const testDir = defineSanmaimeConfig(minimal);
    expect(testDir).toBe(path.join(process.cwd(), '.sanmaime-gen'));
    expect(getSanmaimeConfigs()).toEqual([
      expect.objectContaining({ configDir: process.cwd(), outputDir: testDir }),
    ]);
  });

  it('resolves against NIMAIME_CONFIG_DIR when set (by nimaime-gen)', () => {
    const dir = path.resolve('/some/project');
    process.env[CONFIG_DIR_ENV_VAR] = dir;
    expect(defineSanmaimeConfig(minimal)).toBe(path.join(dir, '.sanmaime-gen'));
  });

  it('prefers an explicit configDir over NIMAIME_CONFIG_DIR', () => {
    process.env[CONFIG_DIR_ENV_VAR] = path.resolve('/ignored');
    const dir = path.resolve('/explicit');
    expect(defineSanmaimeConfig({ ...minimal, configDir: dir, outputDir: 'gen' })).toBe(
      path.join(dir, 'gen'),
    );
  });

  it('can be called once per project with different outputDirs', () => {
    const a = defineSanmaimeConfig({ ...minimal, outputDir: '.sanmaime-gen/a' });
    const b = defineSanmaimeConfig({ ...minimal, outputDir: '.sanmaime-gen/b', language: 'ja' });
    expect(a).not.toBe(b);
    expect(getSanmaimeConfigs().map((c) => c.outputDir)).toEqual([a, b]);
  });

  it('is idempotent for identical calls and rejects conflicting ones', () => {
    defineSanmaimeConfig(minimal);
    defineSanmaimeConfig(minimal);
    expect(getSanmaimeConfigs()).toHaveLength(1);
    expect(() => defineSanmaimeConfig({ ...minimal, verbose: true })).toThrow(SanmaimeConfigError);
  });

  it('throws descriptive validation errors', () => {
    expect(() => defineSanmaimeConfig({ ...minimal, quotes: 'none' as 'single' })).toThrow(
      'Invalid Sanmaime config: option "quotes" must be "single" or "double". Received: "none" (string).',
    );
    expect(getSanmaimeConfigs()).toEqual([]);
  });
});
