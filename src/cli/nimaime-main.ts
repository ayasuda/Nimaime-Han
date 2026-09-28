/**
 * `nimaime` without process globals, so that it can be tested in-process.
 */
import { runApprove } from '../draft/approve';
import { runDiff } from '../draft/diff-run';
import { runDraft, type DraftExitCode, type DraftIO } from '../draft/run';
import { VERSION } from '../version';
import {
  APPROVE_HELP,
  COMMANDS,
  DIFF_HELP,
  DRAFT_HELP,
  HELP,
  NimaimeUsageError,
  parseNimaimeArgs,
} from './nimaime-args';

const COMMAND_HELP: Readonly<Record<string, string>> = {
  draft: DRAFT_HELP,
  diff: DIFF_HELP,
  approve: APPROVE_HELP,
};

/** Runs `nimaime` with `argv` (without `node` and the script path); returns the exit code. */
export async function nimaimeMain(argv: readonly string[], io: DraftIO): Promise<DraftExitCode> {
  let args;
  try {
    args = parseNimaimeArgs(argv);
  } catch (error) {
    if (!(error instanceof NimaimeUsageError)) throw error;
    io.stderr.write(`nimaime: ${error.message}\nRun 'nimaime --help' for usage.\n`);
    return 2;
  }
  switch (args.command) {
    case 'version':
      io.stdout.write(`${VERSION}\n`);
      return 0;
    case 'help': {
      if (args.topic === undefined) {
        io.stdout.write(`${HELP}\n`);
        return 0;
      }
      const help = COMMAND_HELP[args.topic];
      if (help === undefined || !COMMANDS.some((c) => c.name === args.topic)) {
        io.stderr.write(`nimaime: Unknown command '${args.topic}'.\n`);
        return 2;
      }
      io.stdout.write(`${help}\n`);
      return 0;
    }
    case 'draft':
      return runDraft(args, io);
    case 'diff':
      return runDiff(args, io);
    case 'approve':
      return runApprove(args, io);
  }
}
