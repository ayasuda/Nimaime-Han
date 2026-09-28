/**
 * Pure validation + normalization of user options into a `ResolvedSanmaimeConfig`.
 */
import path from 'node:path';
import { describeValue, SanmaimeConfigError } from './errors';
import type {
  QuoteStyle,
  ResolvedImportTestFrom,
  ResolvedSanmaimeConfig,
  SanmaimeConfig,
} from './types';

/** Default output directory (relative to `configDir`). */
export const DEFAULT_OUTPUT_DIR = '.sanmaime-gen';
/** Default keyword language. */
export const DEFAULT_LANGUAGE = 'en';
/** Default quote style for generated code. */
export const DEFAULT_QUOTES: QuoteStyle = 'single';

const KNOWN_OPTIONS: readonly (keyof SanmaimeConfig)[] = [
  'specs',
  'definitions',
  'outputDir',
  'language',
  'tags',
  'importTestFrom',
  'quotes',
  'verbose',
  'configDir',
];

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const LANGUAGE_CODE = /^[A-Za-z][A-Za-z0-9-]*$/;

function fail(option: string, expected: string, received: unknown): never {
  throw new SanmaimeConfigError(
    `Invalid Sanmaime config: option "${option}" must be ${expected}. Received: ${describeValue(received)}.`,
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function resolveGlobs(option: 'specs' | 'definitions', value: unknown): string[] {
  const expected = 'a non-empty glob pattern string or a non-empty array of glob pattern strings';
  if (value === undefined) {
    throw new SanmaimeConfigError(
      `Invalid Sanmaime config: option "${option}" is required and must be ${expected}.`,
    );
  }
  if (isNonEmptyString(value)) return [value.trim()];
  if (!Array.isArray(value) || value.length === 0) fail(option, expected, value);
  return value.map((item: unknown, index) => {
    if (!isNonEmptyString(item))
      fail(`${option}[${String(index)}]`, 'a non-empty glob pattern string', item);
    return item.trim();
  });
}

function optionalString(option: string, value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (!isNonEmptyString(value)) fail(option, 'a non-empty string', value);
  return value.trim();
}

function resolveImportTestFrom(
  value: unknown,
  configDir: string,
): ResolvedImportTestFrom | undefined {
  if (value === undefined) return undefined;
  const expected = 'a non-empty file path string or an object { file: string; varName?: string }';
  if (isNonEmptyString(value))
    return { file: path.resolve(configDir, value.trim()), varName: 'test' };
  if (!isPlainObject(value)) fail('importTestFrom', expected, value);
  for (const key of Object.keys(value)) {
    if (key !== 'file' && key !== 'varName') {
      throw new SanmaimeConfigError(
        `Invalid Sanmaime config: unknown key "${key}" in option "importTestFrom". Allowed keys: "file", "varName".`,
      );
    }
  }
  if (!isNonEmptyString(value.file))
    fail('importTestFrom.file', 'a non-empty file path string', value.file);
  let varName = 'test';
  if (value.varName !== undefined) {
    if (typeof value.varName !== 'string' || !IDENTIFIER.test(value.varName)) {
      fail('importTestFrom.varName', 'a valid JavaScript identifier', value.varName);
    }
    varName = value.varName;
  }
  return { file: path.resolve(configDir, value.file.trim()), varName };
}

/** `true` if `dir` is `ancestor` itself or lies inside it. */
function isSameOrInside(dir: string, ancestor: string): boolean {
  const rel = path.relative(ancestor, dir);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Validates `input` and returns the resolved configuration.
 *
 * @param input - the object passed to `defineSanmaimeConfig()` (typed `unknown`: it comes from user code).
 * @param defaultConfigDir - base directory used when `input.configDir` is not set.
 * @throws SanmaimeConfigError describing the first invalid option.
 */
export function resolveSanmaimeConfig(
  input: unknown,
  defaultConfigDir: string,
): ResolvedSanmaimeConfig {
  if (!isPlainObject(input)) {
    throw new SanmaimeConfigError(
      `Invalid Sanmaime config: defineSanmaimeConfig() expects an object like { specs, definitions }. Received: ${describeValue(input)}.`,
    );
  }
  for (const key of Object.keys(input)) {
    if (!(KNOWN_OPTIONS as readonly string[]).includes(key)) {
      throw new SanmaimeConfigError(
        `Invalid Sanmaime config: unknown option "${key}". Known options: ${KNOWN_OPTIONS.map((k) => `"${k}"`).join(', ')}.`,
      );
    }
  }

  const configDirOption = optionalString('configDir', input.configDir);
  const configDir = path.resolve(defaultConfigDir, configDirOption ?? '.');

  const specs = resolveGlobs('specs', input.specs);
  const definitions = resolveGlobs('definitions', input.definitions);

  const outputDir = path.resolve(
    configDir,
    optionalString('outputDir', input.outputDir) ?? DEFAULT_OUTPUT_DIR,
  );
  if (isSameOrInside(configDir, outputDir)) {
    throw new SanmaimeConfigError(
      `Invalid Sanmaime config: option "outputDir" must be a dedicated directory for generated files, not the config directory or one of its parents (generated files in it may be deleted). Received: ${describeValue(input.outputDir)} (resolved to ${outputDir}).`,
    );
  }

  const language = optionalString('language', input.language) ?? DEFAULT_LANGUAGE;
  if (!LANGUAGE_CODE.test(language)) {
    fail('language', 'a language code such as "en"', input.language);
  }

  const tags = optionalString('tags', input.tags);
  const importTestFrom = resolveImportTestFrom(input.importTestFrom, configDir);

  let quotes: QuoteStyle = DEFAULT_QUOTES;
  if (input.quotes !== undefined) {
    if (input.quotes !== 'single' && input.quotes !== 'double') {
      fail('quotes', '"single" or "double"', input.quotes);
    }
    quotes = input.quotes;
  }

  let verbose = false;
  if (input.verbose !== undefined) {
    if (typeof input.verbose !== 'boolean') fail('verbose', 'a boolean', input.verbose);
    verbose = input.verbose;
  }

  const resolved: ResolvedSanmaimeConfig = {
    configDir,
    specs,
    definitions,
    outputDir,
    language,
    quotes,
    verbose,
  };
  if (tags !== undefined) resolved.tags = tags;
  if (importTestFrom !== undefined) resolved.importTestFrom = importTestFrom;
  return resolved;
}
