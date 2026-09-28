/**
 * Configuration: `defineSanmaimeConfig()` for `playwright.config.ts`, and the helpers the
 * `nimaime-gen` CLI uses to load it back (see docs/config.md).
 */
export { defineSanmaimeConfig } from './define';
export {
  CONFIG_DIR_ENV_VAR,
  CONFIGS_ENV_VAR,
  clearSanmaimeConfigs,
  getSanmaimeConfigs,
  saveConfigToEnv,
} from './env';
export { SanmaimeConfigError } from './errors';
export {
  loadPlaywrightConfig,
  PLAYWRIGHT_CONFIG_FILES,
  resolvePlaywrightConfigFile,
  type LoadedPlaywrightConfig,
  type LoadPlaywrightConfigOptions,
} from './load';
export {
  DEFAULT_LANGUAGE,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_QUOTES,
  resolveSanmaimeConfig,
} from './resolve';
export type * from './types';
