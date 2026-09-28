/**
 * Orchestration of `nimaime-gen` (the counterpart of playwright-bdd's `bddgen`):
 *
 * playwright.config -> configs -> for each config: files -> definitions -> specs -> match ->
 * report problems -> generate -> clean `outputDir` + write (or list / check).
 */
import path from 'node:path';
import { clearSanmaimeConfigs, loadPlaywrightConfig } from '../config';
import type { ResolvedSanmaimeConfig } from '../config/types';
import { formatDiagnostic } from '../parser';
import { resolveDefinitionFiles, resolveSpecFiles } from './files';
import {
  generateSpecFile,
  listTests,
  type GeneratedSpecFile,
  type GeneratedTest,
} from './generate';
import { loadDefinitions } from './load-definitions';
import { loadSpecs } from './load-specs';
import { matchSpecs } from './match';
import { cleanOutputDir, writeGeneratedFiles } from './output';
import { displayPath, formatMissing, formatUnused } from './report';

/** `generate` writes files; `export` lists the tests; `check` validates without writing. */
export type GenerationMode = 'generate' | 'export' | 'check';

/** Exit codes: 0 success, 1 spec or definition errors, 2 usage or configuration errors. */
export type ExitCode = 0 | 1 | 2;

/** Anything with `write(text)`, e.g. `process.stdout`. */
export interface TextOutput {
  write(text: string): unknown;
}

export interface RunGenerationOptions {
  /** `-c` / `--config`: a Playwright config file or a directory containing one. */
  cli?: string | undefined;
  /** Directory `cli` is resolved against and paths are displayed relative to. Default: `process.cwd()`. */
  cwd?: string | undefined;
  /** Default: `'generate'`. */
  mode?: GenerationMode | undefined;
  /** Verbose output for every config (`--verbose`), in addition to the config's `verbose`. */
  verbose?: boolean | undefined;
  /** Normal output (summary, `export` list). */
  stdout: TextOutput;
  /** Problems (diagnostics, missing definitions, warnings, errors). */
  stderr: TextOutput;
}

/** What happened for one config. */
export interface ConfigGenerationResult {
  config: ResolvedSanmaimeConfig;
  /** Number of errors (parser errors, missing definitions, definition load errors). */
  errors: number;
  /** The generated files (empty when there were errors). */
  files: GeneratedSpecFile[];
  /** The tests of the generated files. */
  tests: GeneratedTest[];
  /** Whether files were written (`generate` mode without errors). */
  written: boolean;
}

export interface RunGenerationResult {
  exitCode: ExitCode;
  /** The Playwright config file, when it could be resolved. */
  configFile?: string;
  results: ConfigGenerationResult[];
}

/** Recognises errors by name: they may come from another module instance of nimaime-han. */
function errorNamed(error: unknown, name: string): error is Error {
  return error instanceof Error && error.name === name;
}

function describeError(error: unknown, verbose: boolean): string {
  if (!(error instanceof Error)) return String(error);
  if (verbose && error.stack !== undefined) {
    const cause = error.cause instanceof Error ? `\nCaused by: ${error.cause.stack ?? ''}` : '';
    return `${error.stack}${cause}`;
  }
  return error.message;
}

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * Runs `nimaime-gen` in this process: loads the Playwright config and processes every config
 * registered with `defineSanmaimeConfig()`.
 *
 * A config with errors is reported and nothing is written for it; the other configs are still
 * processed. Configs registered earlier in this process are cleared first, and a config file is
 * evaluated at most once per process, so call this once per process (as the CLI does).
 */
export async function runGeneration(options: RunGenerationOptions): Promise<RunGenerationResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const mode = options.mode ?? 'generate';
  const { stderr } = options;

  clearSanmaimeConfigs();
  let loaded;
  try {
    loaded = await loadPlaywrightConfig({ cli: options.cli, cwd });
  } catch (error) {
    if (!errorNamed(error, 'SanmaimeConfigError')) throw error;
    stderr.write(`nimaime-gen: ${describeError(error, options.verbose === true)}\n`);
    return { exitCode: 2, results: [] };
  }
  const { configFile, configs } = loaded;
  if (configs.length === 0) {
    stderr.write(
      `nimaime-gen: ${displayPath(configFile, cwd)} does not call defineSanmaimeConfig(), so there is nothing to generate.\n`,
    );
    return { exitCode: 2, configFile, results: [] };
  }

  const results: ConfigGenerationResult[] = [];
  for (const config of configs) {
    results.push(
      await processConfig(config, {
        ...options,
        cwd,
        mode,
        verbose: options.verbose === true || config.verbose,
      }),
    );
  }
  const exitCode: ExitCode = results.some((result) => result.errors > 0) ? 1 : 0;
  return { exitCode, configFile, results };
}

interface ProcessOptions {
  cwd: string;
  mode: GenerationMode;
  verbose: boolean;
  stdout: TextOutput;
  stderr: TextOutput;
}

/** Processes one resolved config (exported for tests: it does not load a Playwright config). */
export async function processConfig(
  config: ResolvedSanmaimeConfig,
  options: ProcessOptions,
): Promise<ConfigGenerationResult> {
  const { cwd, mode, verbose, stdout, stderr } = options;
  const result: ConfigGenerationResult = {
    config,
    errors: 0,
    files: [],
    tests: [],
    written: false,
  };
  const outputDir = displayPath(config.outputDir, cwd);

  const specFiles = await resolveSpecFiles(config);
  const definitionFiles = await resolveDefinitionFiles(config);
  if (specFiles.length === 0) {
    stderr.write(
      `warning: no .sanmaime files match "specs" (${config.specs.join(', ')}) in ${displayPath(config.configDir, cwd)}.\n`,
    );
  }
  if (verbose) {
    stderr.write(
      `Config ${outputDir}: ${plural(specFiles.length, 'spec file')}, ${plural(definitionFiles.length, 'definition file')}.\n`,
    );
  }

  let registry;
  try {
    registry = await loadDefinitions(definitionFiles, { searchDirs: [config.configDir, cwd] });
  } catch (error) {
    if (!errorNamed(error, 'DefinitionLoadError')) throw error;
    stderr.write(`error: ${describeError(error, verbose)}\n`);
    result.errors++;
    stderr.write(`nimaime-gen: nothing was generated into ${outputDir} (1 error).\n`);
    return result;
  }

  const specs = await loadSpecs(specFiles, config);
  for (const spec of specs) {
    for (const diagnostic of spec.diagnostics) {
      stderr.write(`${formatDiagnostic(diagnostic, displayPath(spec.file, cwd))}\n`);
      if (diagnostic.severity === 'error') result.errors++;
    }
  }

  const match = matchSpecs(specs, registry);
  for (const line of formatMissing(match.missing, { cwd, includeInfo: verbose })) {
    stderr.write(`${line}\n`);
  }
  result.errors += match.missing.filter((entry) => entry.severity === 'error').length;
  if (verbose) {
    for (const line of formatUnused(match.unused, { cwd })) stderr.write(`${line}\n`);
  }

  if (result.errors > 0) {
    stderr.write(
      `nimaime-gen: nothing was generated into ${outputDir} (${plural(result.errors, 'error')}).\n`,
    );
    return result;
  }

  for (const doc of match.documents) {
    if (mode === 'export') {
      result.tests.push(...listTests(doc));
      continue;
    }
    const file = generateSpecFile(doc, {
      outputDir: config.outputDir,
      configDir: config.configDir,
      importTestFrom: config.importTestFrom,
      quotes: config.quotes,
      definitionFiles,
    });
    result.files.push(file);
    result.tests.push(...file.tests);
    for (const unknown of file.unknownFixtures) {
      stderr.write(
        `${displayPath(doc.file, cwd)}: warning: cannot tell which fixtures ${unknown.callback} uses ` +
          `(its first parameter is not destructured), so "${unknown.titlePath.join(' > ')}" requests "page" for it. ` +
          'Destructure the fixtures it needs, e.g. async ({ page }) => { … }.\n',
      );
    }
  }

  switch (mode) {
    case 'export':
      for (const doc of match.documents) {
        stdout.write(`${displayPath(doc.file, cwd)}\n`);
        for (const test of listTests(doc)) stdout.write(`  ${test.titlePath.join(' > ')}\n`);
      }
      stdout.write(
        `${plural(result.tests.length, 'test')} in ${plural(match.documents.length, 'spec file')}.\n`,
      );
      break;
    case 'check':
      stdout.write(
        `OK: ${plural(result.files.length, 'spec file')} (${plural(result.tests.length, 'test')}) for ${outputDir}; nothing was written.\n`,
      );
      break;
    case 'generate': {
      const cleaned = await cleanOutputDir(config.outputDir);
      if (verbose) {
        for (const kept of cleaned.kept) {
          stderr.write(`Kept ${displayPath(kept, cwd)} (not generated by nimaime-gen).\n`);
        }
      }
      await writeGeneratedFiles(result.files);
      result.written = true;
      stdout.write(
        `Generated ${plural(result.files.length, 'spec file')} (${plural(result.tests.length, 'test')}) into ${outputDir}\n`,
      );
      if (verbose) {
        for (const file of result.files) stdout.write(`  ${displayPath(file.path, cwd)}\n`);
      }
      break;
    }
  }
  return result;
}
