import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CONFIGS_ENV_VAR,
  clearSanmaimeConfigs,
  getSanmaimeConfigs,
  resolveSanmaimeConfig,
  saveConfigToEnv,
} from '../../src/config';

const base = path.resolve('/project');
const config = (outputDir: string, extra: Record<string, unknown> = {}) =>
  resolveSanmaimeConfig(
    { specs: 's/*.sanmaime', definitions: 'd/*.ts', outputDir, ...extra },
    base,
  );

describe('config environment variable', () => {
  beforeEach(() => {
    clearSanmaimeConfigs();
  });
  afterEach(() => {
    clearSanmaimeConfigs();
  });

  it('returns an empty list when nothing is registered', () => {
    expect(getSanmaimeConfigs()).toEqual([]);
  });

  it('stores configs as a JSON map keyed by absolute outputDir, in registration order', () => {
    const a = config('gen/a');
    const b = config('gen/b');
    saveConfigToEnv(a);
    saveConfigToEnv(b);
    expect(JSON.parse(process.env[CONFIGS_ENV_VAR] ?? '')).toEqual({
      [a.outputDir]: a,
      [b.outputDir]: b,
    });
    expect(getSanmaimeConfigs()).toEqual([a, b]);
  });

  it('ignores re-registration of an identical config (config evaluated again, e.g. in workers)', () => {
    saveConfigToEnv(config('gen'));
    // Same content with a different key order, as if produced by another process.
    const again = JSON.parse(JSON.stringify(config('gen'))) as Record<string, unknown>;
    const reordered = Object.fromEntries(Object.entries(again).reverse());
    saveConfigToEnv(reordered as unknown as ReturnType<typeof config>);
    expect(getSanmaimeConfigs()).toHaveLength(1);
  });

  it('rejects a different config for the same outputDir', () => {
    saveConfigToEnv(config('gen'));
    expect(() => {
      saveConfigToEnv(config('gen', { quotes: 'double' }));
    }).toThrow(/called twice with outputDir ".*gen" but different options.*its own "outputDir"/);
  });

  it('reports a corrupted variable', () => {
    process.env[CONFIGS_ENV_VAR] = '{oops';
    expect(() => getSanmaimeConfigs()).toThrow(/NIMAIME_CONFIGS does not contain valid JSON/);
    process.env[CONFIGS_ENV_VAR] = '[]';
    expect(() => getSanmaimeConfigs()).toThrow(
      /NIMAIME_CONFIGS must be a JSON object keyed by output directory/,
    );
  });
});
