/**
 * `nimaime-gen` without process globals, so that it can be tested in-process.
 */
import { runGeneration, type ExitCode, type TextOutput } from '../gen/run';
import { VERSION } from '../version';
import { CliUsageError, HELP, parseCliArgs } from './args';

export interface CliIO {
  stdout: TextOutput;
  stderr: TextOutput;
  /** Default: `process.cwd()`. */
  cwd?: string;
}

/** Runs `nimaime-gen` with `argv` (without `node` and the script path); returns the exit code. */
export async function main(argv: readonly string[], io: CliIO): Promise<ExitCode> {
  let args;
  try {
    args = parseCliArgs(argv);
  } catch (error) {
    if (!(error instanceof CliUsageError)) throw error;
    io.stderr.write(`nimaime-gen: ${error.message}\nRun 'nimaime-gen --help' for usage.\n`);
    return 2;
  }
  if (args.help) {
    io.stdout.write(`${HELP}\n`);
    return 0;
  }
  if (args.version) {
    io.stdout.write(`${VERSION}\n`);
    return 0;
  }
  try {
    const { exitCode } = await runGeneration({
      cli: args.config,
      cwd: io.cwd,
      mode: args.command,
      verbose: args.verbose,
      allowMissing: args.allowMissing,
      format: args.format,
      tags: args.tags,
      includeDrafts: args.includeDrafts,
      stdout: io.stdout,
      stderr: io.stderr,
    });
    return exitCode;
  } catch (error) {
    // Unexpected: always with the stack.
    const text = error instanceof Error ? (error.stack ?? error.message) : String(error);
    io.stderr.write(`nimaime-gen: ${text}\n`);
    return 1;
  }
}
