import { CONFIG_DIR_ENV_VAR, saveConfigToEnv } from './env';
import { resolveSanmaimeConfig } from './resolve';
import type { SanmaimeConfig } from './types';

/**
 * Declares a Sanmaime configuration inside `playwright.config.ts` and returns the absolute output
 * directory, to be used as the Playwright `testDir` (the Nimaime-Han counterpart of playwright-bdd's
 * `defineBddConfig()`).
 *
 * The resolved config is stored in `process.env.NIMAIME_CONFIGS` so that `nimaime-gen`, which loads
 * the Playwright config, can read it back. Call it once per Playwright project that needs its own
 * settings, each with a distinct `outputDir`.
 *
 * Relative paths are resolved against `config.configDir`, else `process.env.NIMAIME_CONFIG_DIR`
 * (set by `nimaime-gen`), else `process.cwd()`.
 *
 * @throws SanmaimeConfigError if an option is invalid or `outputDir` is already used by a different config.
 */
export function defineSanmaimeConfig(config: SanmaimeConfig): string {
  const envDir = process.env[CONFIG_DIR_ENV_VAR];
  const baseDir = envDir !== undefined && envDir !== '' ? envDir : process.cwd();
  const resolved = resolveSanmaimeConfig(config, baseDir);
  saveConfigToEnv(resolved);
  return resolved.outputDir;
}
