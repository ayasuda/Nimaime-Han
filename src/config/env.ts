/**
 * Hand-over of resolved configs from `playwright.config.ts` to the `nimaime-gen` CLI.
 *
 * Like playwright-bdd's `defineBddConfig()`, configs are stored in an environment variable rather than
 * in module state: the config file may be evaluated by a different module instance (ESM vs CJS build,
 * or a copy of nimaime-han transformed by Playwright's loader) than the one the CLI uses, and Playwright
 * re-evaluates the config in every worker process, which inherits the environment of the runner.
 */
import { SanmaimeConfigError } from './errors';
import type { ResolvedSanmaimeConfig } from './types';

/** JSON object `{ [absoluteOutputDir]: ResolvedSanmaimeConfig }`, written by `defineSanmaimeConfig()`. */
export const CONFIGS_ENV_VAR = 'NIMAIME_CONFIGS';
/** Absolute directory of the Playwright config being loaded; set by `nimaime-gen` while loading it. */
export const CONFIG_DIR_ENV_VAR = 'NIMAIME_CONFIG_DIR';

type ConfigMap = Record<string, ResolvedSanmaimeConfig>;

function readConfigMap(): ConfigMap {
  const raw = process.env[CONFIGS_ENV_VAR];
  if (raw === undefined || raw === '') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SanmaimeConfigError(
      `process.env.${CONFIGS_ENV_VAR} does not contain valid JSON. It is managed by defineSanmaimeConfig(); do not set it manually.`,
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new SanmaimeConfigError(
      `process.env.${CONFIGS_ENV_VAR} must be a JSON object keyed by output directory. It is managed by defineSanmaimeConfig(); do not set it manually.`,
    );
  }
  return parsed as ConfigMap;
}

/** Deterministic JSON (sorted keys) so that configs can be compared regardless of key order. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    typeof v === 'object' && v !== null && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

/**
 * Stores `config` under its `outputDir`. Registering an identical config again is a no-op
 * (Playwright evaluates the config file several times); a different config for the same
 * `outputDir` is an error.
 */
export function saveConfigToEnv(config: ResolvedSanmaimeConfig): void {
  const configs = readConfigMap();
  const existing = configs[config.outputDir];
  if (existing !== undefined) {
    if (canonicalJson(existing) === canonicalJson(config)) return;
    throw new SanmaimeConfigError(
      `defineSanmaimeConfig() was called twice with outputDir "${config.outputDir}" but different options. ` +
        'When calling defineSanmaimeConfig() several times (e.g. one per Playwright project), give each call its own "outputDir".',
    );
  }
  configs[config.outputDir] = config;
  process.env[CONFIGS_ENV_VAR] = JSON.stringify(configs);
}

/**
 * Returns every config registered by `defineSanmaimeConfig()` in this process (or inherited from the
 * parent process), in registration order.
 */
export function getSanmaimeConfigs(): ResolvedSanmaimeConfig[] {
  return Object.values(readConfigMap());
}

/** Removes all registered configs. Intended for tests and tooling. */
export function clearSanmaimeConfigs(): void {
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete process.env[CONFIGS_ENV_VAR];
}
