/**
 * Locating and evaluating `playwright.config.*` for the `nimaime-gen` CLI.
 *
 * Evaluating the config runs its `defineSanmaimeConfig()` calls, which store the resolved configs in
 * `process.env.NIMAIME_CONFIGS`; they are then read back with `getSanmaimeConfigs()`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONFIG_DIR_ENV_VAR, getSanmaimeConfigs } from './env';
import { SanmaimeConfigError } from './errors';
import { getPlaywrightRequireOrImport } from './playwright-internals';
import type { ResolvedSanmaimeConfig } from './types';

/** Config file names looked up in a directory, in Playwright's order. */
export const PLAYWRIGHT_CONFIG_FILES = [
  'playwright.config.ts',
  'playwright.config.js',
  'playwright.config.mts',
  'playwright.config.mjs',
  'playwright.config.cts',
  'playwright.config.cjs',
] as const;

export interface LoadPlaywrightConfigOptions {
  /** Value of the `-c` / `--config` CLI option: a config file or a directory containing one. */
  cli?: string;
  /** Directory `cli` is resolved against, and searched when `cli` is not given. Default: `process.cwd()`. */
  cwd?: string;
}

export interface LoadedPlaywrightConfig {
  /** Absolute path of the evaluated config file. */
  configFile: string;
  /** Directory of `configFile`. */
  configDir: string;
  /** All configs registered via `defineSanmaimeConfig()` in this process so far. */
  configs: ResolvedSanmaimeConfig[];
}

/**
 * Resolves the Playwright config file like `playwright test -c <cli>` does.
 *
 * @throws SanmaimeConfigError if the path does not exist or the directory contains no config file.
 */
export function resolvePlaywrightConfigFile(options: LoadPlaywrightConfigOptions = {}): string {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const target =
    options.cli !== undefined && options.cli !== '' ? path.resolve(cwd, options.cli) : cwd;
  if (!fs.existsSync(target)) {
    throw new SanmaimeConfigError(`Playwright config not found: ${target} does not exist.`);
  }
  if (!fs.statSync(target).isDirectory()) return target;
  for (const name of PLAYWRIGHT_CONFIG_FILES) {
    const file = path.join(target, name);
    if (fs.existsSync(file)) return file;
  }
  throw new SanmaimeConfigError(
    `Playwright config not found in ${target} (looked for ${PLAYWRIGHT_CONFIG_FILES.join(', ')}). ` +
      'Pass its location with -c / --config.',
  );
}

/** Fallback loader used when Playwright is not installed: plain JavaScript configs only. */
async function importJsConfig(file: string): Promise<unknown> {
  if (!/\.(?:js|mjs|cjs)$/.test(file)) {
    throw new SanmaimeConfigError(
      `Cannot load ${file}: @playwright/test is not installed (it is needed to load TypeScript configs).`,
    );
  }
  return import(pathToFileURL(file).href);
}

/**
 * Finds and evaluates the Playwright config so that its `defineSanmaimeConfig()` calls run.
 *
 * TypeScript configs are loaded through Playwright's own transform (see `playwright-internals.ts`).
 * While the file is evaluated, `process.env.NIMAIME_CONFIG_DIR` is set to its directory so that
 * relative paths in `defineSanmaimeConfig()` resolve against it.
 *
 * Note: a config file is evaluated at most once per process (module cache); `configs` accumulates.
 */
export async function loadPlaywrightConfig(
  options: LoadPlaywrightConfigOptions = {},
): Promise<LoadedPlaywrightConfig> {
  const configFile = resolvePlaywrightConfigFile(options);
  const configDir = path.dirname(configFile);
  const cwd = path.resolve(options.cwd ?? process.cwd());

  const requireOrImport = getPlaywrightRequireOrImport([configDir, cwd]) ?? importJsConfig;

  const previousDir = process.env[CONFIG_DIR_ENV_VAR];
  process.env[CONFIG_DIR_ENV_VAR] = configDir;
  try {
    await requireOrImport(configFile);
  } catch (error) {
    // Errors thrown by defineSanmaimeConfig() may come from another module instance of nimaime-han,
    // so they are recognised by name rather than with `instanceof`.
    const message =
      error instanceof Error && error.name === 'SanmaimeConfigError'
        ? error.message
        : String(error);
    throw new SanmaimeConfigError(`Failed to load Playwright config ${configFile}: ${message}`, {
      cause: error,
    });
  } finally {
    if (previousDir === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete process.env[CONFIG_DIR_ENV_VAR];
    } else {
      process.env[CONFIG_DIR_ENV_VAR] = previousDir;
    }
  }
  return { configFile, configDir, configs: getSanmaimeConfigs() };
}
