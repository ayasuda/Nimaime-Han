/**
 * Orchestration of `nimaime-gen` (the counterpart of playwright-bdd's `bddgen`):
 *
 * playwright.config -> configs -> for each config: files -> definitions -> specs -> match ->
 * report problems -> generate -> clean `outputDir` + write (or list / check).
 */
import path from 'node:path';
import { clearSanmaimeConfigs, loadPlaywrightConfig } from '../config';
import type { ResolvedSanmaimeConfig } from '../config/types';
import { resolveDefinitionFiles, resolveSpecFiles } from './files';
import {
  generateSpecFile,
  listTests,
  type GeneratedSpecFile,
  type GeneratedTest,
} from './generate';
import { loadDefinitions } from './load-definitions';
import { hasErrors, loadSpecs, type ParsedSpec } from './load-specs';
import {
  matchSpecs,
  type ResolvedDocument,
  type ResolvedElement,
  type ResolvedExpectation,
} from './match';
import { cleanOutputDir, writeGeneratedFiles } from './output';
import {
  displayPath,
  formatDiagnostics,
  formatMissing,
  formatUnused,
  type FileDiagnostic,
  type ReportFormat,
} from './report';
import { parseTagExpression, TagExpressionError } from './tag-expression';
import { filterDocumentByTags } from './tags';

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
  /**
   * `--allow-missing`: missing definitions are warnings instead of errors; the tests (blocks) that
   * use them are not generated, the others are. Default: `false`.
   */
  allowMissing?: boolean | undefined;
  /** `--format`: how problems are printed. Default: `'pretty'`. */
  format?: ReportFormat | undefined;
  /**
   * `--tags`: tag expression selecting the tests to generate (e.g. `'@smoke and not @wip'`);
   * overrides the config's `tags`. A syntax error is a usage error (exit code 2).
   */
  tags?: string | undefined;
  /** Normal output (summary, `export` list). */
  stdout: TextOutput;
  /** Problems (diagnostics, missing definitions, warnings, errors). */
  stderr: TextOutput;
}

/** What happened for one config. */
export interface ConfigGenerationResult {
  config: ResolvedSanmaimeConfig;
  /**
   * Number of errors (parser errors, definition load errors, and missing definitions unless
   * `allowMissing` is set).
   */
  errors: number;
  /** With `allowMissing`: the tests left out because they use missing definitions. */
  skipped: SkippedTest[];
  /** The tag expression applied (`--tags`, else the config's `tags`), if any. */
  tags?: string;
  /** Number of tests left out because their tags do not match `tags`. */
  excludedByTags: number;
  /** The generated files (empty when there were errors). */
  files: GeneratedSpecFile[];
  /** The tests of the generated files. */
  tests: GeneratedTest[];
  /** Whether files were written (`generate` mode without errors). */
  written: boolean;
}

/** A test that is not generated because it uses a missing definition (`--allow-missing`). */
export interface SkippedTest {
  /** Absolute path of the `.sanmaime` file. */
  file: string;
  titlePath: string[];
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

  if (options.tags !== undefined) {
    try {
      parseTagExpression(options.tags);
    } catch (error) {
      if (!(error instanceof TagExpressionError)) throw error;
      stderr.write(`nimaime-gen: --tags: ${error.message}\n`);
      return { exitCode: 2, results: [] };
    }
  }

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
  allowMissing?: boolean | undefined;
  format?: ReportFormat | undefined;
  /** Overrides `config.tags`. */
  tags?: string | undefined;
  stdout: TextOutput;
  stderr: TextOutput;
}

/** Processes one resolved config (exported for tests: it does not load a Playwright config). */
export async function processConfig(
  config: ResolvedSanmaimeConfig,
  options: ProcessOptions,
): Promise<ConfigGenerationResult> {
  const { cwd, mode, verbose, stdout, stderr } = options;
  const allowMissing = options.allowMissing === true;
  const format = options.format ?? 'pretty';
  const result: ConfigGenerationResult = {
    config,
    errors: 0,
    skipped: [],
    excludedByTags: 0,
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
  const diagnostics: FileDiagnostic[] = specs.flatMap((spec) =>
    spec.diagnostics.map((diagnostic) => ({ ...diagnostic, file: spec.file })),
  );
  for (const line of formatDiagnostics(diagnostics, { cwd, format })) stderr.write(`${line}\n`);
  result.errors += diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;

  // Tag filtering happens before matching, so that missing definitions are only reported for the
  // selected tests. Specs with errors are kept (they are reported and fail the run regardless).
  let selected: ParsedSpec[] = specs;
  const tags = options.tags ?? config.tags;
  if (tags !== undefined) {
    result.tags = tags;
    const expression = parseTagExpression(tags);
    let kept = 0;
    selected = [];
    for (const spec of specs) {
      if (hasErrors(spec)) {
        selected.push(spec);
        continue;
      }
      const filtered = filterDocumentByTags(spec.document, expression);
      kept += filtered.kept;
      result.excludedByTags += filtered.removed;
      // A spec without selected tests gets no file.
      if (filtered.kept > 0) selected.push({ ...spec, document: filtered.document });
    }
    if (verbose) {
      stderr.write(
        `Tags "${tags}": ${plural(kept, 'test')} selected, ${plural(result.excludedByTags, 'test')} filtered out.\n`,
      );
    }
  }

  const match = matchSpecs(selected, registry);
  const missingReport = formatMissing(match.missing, {
    cwd,
    includeInfo: verbose,
    format,
    asWarnings: allowMissing,
    quotes: config.quotes,
    documents: match.documents,
  });
  for (const line of missingReport) stderr.write(`${line}\n`);
  if (!allowMissing) {
    result.errors += match.missing.filter((entry) => entry.severity === 'error').length;
  }
  if (verbose) {
    // Unused means unused by every spec, not only by the tests selected by tags.
    const unused = selected === specs ? match.unused : matchSpecs(specs, registry).unused;
    for (const line of formatUnused(unused, { cwd })) stderr.write(`${line}\n`);
  }

  if (result.errors > 0) {
    stderr.write(
      `nimaime-gen: nothing was generated into ${outputDir} (${plural(result.errors, 'error')}).\n`,
    );
    return result;
  }

  let documents = match.documents;
  if (allowMissing) {
    documents = [];
    for (const doc of match.documents) {
      const pruned = withoutMissingDefinitions(doc);
      const kept = new Set(listTests(pruned).map((test) => JSON.stringify(test.titlePath)));
      const all = listTests(doc);
      for (const test of all) {
        if (!kept.has(JSON.stringify(test.titlePath))) {
          result.skipped.push({ file: doc.file, titlePath: test.titlePath });
        }
      }
      // A spec whose tests all use missing definitions gets no file.
      if (kept.size > 0 || all.length === 0) documents.push(pruned);
    }
    if (result.skipped.length > 0) {
      stderr.write(
        `nimaime-gen: --allow-missing: ${plural(result.skipped.length, 'test')} that use missing definitions ` +
          `${result.skipped.length === 1 ? 'is' : 'are'} not generated:\n`,
      );
      for (const test of result.skipped) {
        stderr.write(`  ${displayPath(test.file, cwd)}: ${test.titlePath.join(' > ')}\n`);
      }
    }
  }

  for (const doc of documents) {
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
      for (const doc of documents) {
        stdout.write(`${displayPath(doc.file, cwd)}\n`);
        for (const test of listTests(doc)) {
          const tags = test.tags.length > 0 ? `  ${test.tags.join(' ')}` : '';
          stdout.write(`  ${test.titlePath.join(' > ')}${tags}\n`);
        }
      }
      stdout.write(
        `${plural(result.tests.length, 'test')} in ${plural(documents.length, 'spec file')}.\n`,
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

function expectationDefined(expectation: ResolvedExpectation): boolean {
  return 'targetDefined' in expectation ? expectation.targetDefined : expectation.selfDefined;
}

/**
 * `doc` without the blocks (tests) that use a missing definition (`--allow-missing`): an element
 * without a definition loses all its blocks, the unconditional block goes when one of its targets
 * or its `self` locator is missing, a `When:` block when its condition, one of its targets or the
 * `self` locator is missing. Elements left without blocks and screens left without elements are
 * dropped. A screen without `defineScreen` is allowed and kept.
 */
export function withoutMissingDefinitions(doc: ResolvedDocument): ResolvedDocument {
  const screens = doc.screens
    .map((screen) => ({
      ...screen,
      elements: screen.elements
        .filter((element) => element.definition !== undefined)
        .map((element): ResolvedElement => ({
          ...element,
          unconditional: element.unconditional.every(expectationDefined)
            ? element.unconditional
            : [],
          conditions: element.conditions.filter(
            (condition) =>
              condition.definition !== undefined &&
              condition.expectations.every(expectationDefined),
          ),
        }))
        .filter((element) => element.unconditional.length > 0 || element.conditions.length > 0),
    }))
    .filter((screen) => screen.elements.length > 0);
  return { ...doc, screens };
}
