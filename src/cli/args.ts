/**
 * Command-line parsing of `nimaime-gen` (Node's built-in `util.parseArgs`, no dependency).
 */
import { parseArgs } from 'node:util';
import type { ReportFormat } from '../gen/report';
import type { GenerationMode } from '../gen/run';
import { parseTagExpression, TagExpressionError } from '../gen/tag-expression';

/** The commands of `nimaime-gen`; `generate` is the default. */
export const COMMANDS: readonly GenerationMode[] = ['generate', 'export', 'check'];

/** The values of `--format`; `pretty` is the default. */
export const FORMATS: readonly ReportFormat[] = ['pretty', 'compact'];

export const HELP = `Usage: nimaime-gen [command] [options]

Generate Playwright test files from .sanmaime specifications.

Commands:
  generate             Generate the spec files into each outputDir (default)
  export               List the tests that would be generated, without writing files
  check                Parse and match everything, report problems, write nothing (for CI)

Options:
  -c, --config <path>  Playwright config file, or a directory containing one
                       (default: playwright.config.{ts,js,mts,mjs,cts,cjs} in the current directory)
      --allow-missing  Report missing definitions as warnings and generate the other tests
                       (the tests that use a missing definition are left out; exit code 0)
      --format <name>  How problems are printed: pretty (default; with definition snippets)
                       or compact (one file:line:column: severity: message line per problem)
      --tags <expr>    Generate only the tests whose tags match, e.g. "@smoke and not @wip"
                       (and, or, not, parentheses; overrides the config's tags option)
      --include-drafts Also generate the specs marked "# status: draft" (skipped by default)
      --verbose        Print more details (unused definitions, generated files, stack traces)
  -h, --help           Print this help
  -v, --version        Print the version

Exit codes: 0 success, 1 spec or definition errors (missing definitions count unless
--allow-missing), 2 usage or configuration errors.

Then run the generated tests with: npx playwright test`;

/** Parsed command line. */
export interface CliArgs {
  command: GenerationMode;
  config: string | undefined;
  verbose: boolean;
  allowMissing: boolean;
  format: ReportFormat;
  /** `--tags` expression, if given (syntax already checked). */
  tags: string | undefined;
  /** `--include-drafts`. */
  includeDrafts: boolean;
  help: boolean;
  version: boolean;
}

/** Error in the command line (exit code 2). */
export class CliUsageError extends Error {
  override name = 'CliUsageError';
}

function isFormat(value: string): value is ReportFormat {
  return (FORMATS as readonly string[]).includes(value);
}

function isCommand(value: string): value is GenerationMode {
  return (COMMANDS as readonly string[]).includes(value);
}

/** Parses `argv` (without `node` and the script path). @throws CliUsageError */
export function parseCliArgs(argv: readonly string[]): CliArgs {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        config: { type: 'string', short: 'c' },
        verbose: { type: 'boolean' },
        'allow-missing': { type: 'boolean' },
        format: { type: 'string' },
        tags: { type: 'string' },
        'include-drafts': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (error) {
    throw new CliUsageError(error instanceof Error ? error.message : String(error));
  }
  const { values, positionals } = parsed;
  if (positionals.length > 1) {
    throw new CliUsageError(`Unexpected argument '${positionals[1] ?? ''}'.`);
  }
  const [command = 'generate'] = positionals;
  if (!isCommand(command)) {
    throw new CliUsageError(`Unknown command '${command}'. Commands: ${COMMANDS.join(', ')}.`);
  }
  if (values.config === '') throw new CliUsageError('Option --config needs a path.');
  const format = values.format ?? 'pretty';
  if (!isFormat(format)) {
    throw new CliUsageError(`Unknown format '${format}'. Formats: ${FORMATS.join(', ')}.`);
  }
  const tags = values.tags?.trim();
  if (tags === '') throw new CliUsageError('Option --tags needs a tag expression.');
  if (tags !== undefined) {
    try {
      parseTagExpression(tags);
    } catch (error) {
      if (!(error instanceof TagExpressionError)) throw error;
      throw new CliUsageError(`--tags: ${error.message}`);
    }
  }
  return {
    command,
    config: values.config,
    verbose: values.verbose === true,
    allowMissing: values['allow-missing'] === true,
    format,
    tags,
    includeDrafts: values['include-drafts'] === true,
    help: values.help === true,
    version: values.version === true,
  };
}
