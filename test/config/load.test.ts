import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CONFIG_DIR_ENV_VAR,
  clearSanmaimeConfigs,
  loadPlaywrightConfig,
  resolvePlaywrightConfigFile,
  SanmaimeConfigError,
} from '../../src/config';

const fixtures = path.join(import.meta.dirname, 'fixtures');

describe('resolvePlaywrightConfigFile', () => {
  it('finds playwright.config.ts in cwd when no -c is given', () => {
    expect(resolvePlaywrightConfigFile({ cwd: path.join(fixtures, 'basic') })).toBe(
      path.join(fixtures, 'basic', 'playwright.config.ts'),
    );
  });

  it('accepts a directory for -c, relative to cwd', () => {
    expect(resolvePlaywrightConfigFile({ cli: 'multi', cwd: fixtures })).toBe(
      path.join(fixtures, 'multi', 'playwright.config.ts'),
    );
  });

  it('accepts a file for -c', () => {
    const file = path.join(fixtures, 'custom-name', 'sanmaime.playwright.config.ts');
    expect(resolvePlaywrightConfigFile({ cli: file })).toBe(file);
  });

  it('looks up other extensions (.mjs)', () => {
    expect(resolvePlaywrightConfigFile({ cli: path.join(fixtures, 'js-config') })).toBe(
      path.join(fixtures, 'js-config', 'playwright.config.mjs'),
    );
  });

  it('throws when the path does not exist', () => {
    expect(() => resolvePlaywrightConfigFile({ cli: 'nope.config.ts', cwd: fixtures })).toThrow(
      /Playwright config not found: .*nope\.config\.ts does not exist/,
    );
  });

  it('throws when the directory has no config file', () => {
    expect(() => resolvePlaywrightConfigFile({ cwd: fixtures })).toThrow(SanmaimeConfigError);
    expect(() => resolvePlaywrightConfigFile({ cwd: fixtures })).toThrow(
      /looked for playwright\.config\.ts, playwright\.config\.js/,
    );
  });
});

describe('loadPlaywrightConfig', () => {
  beforeEach(() => {
    clearSanmaimeConfigs();
  });
  afterEach(() => {
    clearSanmaimeConfigs();
  });

  it('loads a TypeScript playwright.config.ts and returns its resolved config', async () => {
    const dir = path.join(fixtures, 'basic');
    // Run from another directory: paths must still resolve against the config's directory.
    const loaded = await loadPlaywrightConfig({ cli: 'basic', cwd: fixtures });
    expect(loaded.configFile).toBe(path.join(dir, 'playwright.config.ts'));
    expect(loaded.configDir).toBe(dir);
    expect(loaded.configs).toEqual([
      {
        configDir: dir,
        specs: ['specs/**/*.sanmaime'],
        definitions: ['definitions/**/*.ts'],
        outputDir: path.join(dir, '.sanmaime-gen'),
        language: 'en',
        includeDrafts: false,
        importTestFrom: { file: path.join(dir, 'fixtures.ts'), varName: 'test' },
        quotes: 'single',
        verbose: false,
      },
    ]);
    // NIMAIME_CONFIG_DIR is only set while the config is evaluated.
    expect(process.env[CONFIG_DIR_ENV_VAR]).toBeUndefined();
  });

  it('collects several defineSanmaimeConfig() calls (one per project)', async () => {
    const dir = path.join(fixtures, 'multi');
    const { configs } = await loadPlaywrightConfig({ cli: dir });
    expect(configs.map((c) => c.outputDir)).toEqual([
      path.join(dir, '.sanmaime-gen', 'admin'),
      path.join(dir, '.sanmaime-gen', 'public'),
    ]);
    expect(configs[0]?.tags).toBe('@admin');
    expect(configs[1]?.quotes).toBe('double');
  });

  it('loads a config file given by name', async () => {
    const dir = path.join(fixtures, 'custom-name');
    const { configs } = await loadPlaywrightConfig({
      cli: path.join(dir, 'sanmaime.playwright.config.ts'),
    });
    expect(configs).toHaveLength(1);
    expect(configs[0]).toMatchObject({ outputDir: path.join(dir, 'generated'), verbose: true });
  });

  it('loads a JavaScript (.mjs) config', async () => {
    const dir = path.join(fixtures, 'js-config');
    const { configs } = await loadPlaywrightConfig({ cli: dir });
    expect(configs).toEqual([
      expect.objectContaining({ configDir: dir, outputDir: path.join(dir, 'out') }),
    ]);
  });

  it('wraps errors thrown while evaluating the config', async () => {
    await expect(loadPlaywrightConfig({ cli: path.join(fixtures, 'broken') })).rejects.toThrow(
      /Failed to load Playwright config .*broken.*playwright\.config\.ts: Invalid Sanmaime config: option "specs" is required/,
    );
  });
});
