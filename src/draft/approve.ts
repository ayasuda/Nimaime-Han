/**
 * `nimaime approve <file...>` (docs/review-workflow.md): marks reviewed specifications as approved
 * by rewriting their `# status: draft` line to `# status: approved` (or deleting it with
 * `--remove`). Nothing else in the file changes. An approved specification must be valid, so a
 * file with parser errors is left untouched unless `--force` is given.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ApproveArgs } from '../cli/nimaime-args';
import { formatDiagnostic, parse } from '../parser';
import type { DraftExitCode, DraftIO } from './run';
import { setStatusDirective, statusDirectiveLine } from './status';

/**
 * The approved text of `source` (`remove`: without the directive line) and the parser errors of
 * that text (a caller must not approve a text with errors, unless forced).
 */
export function approveSource(
  source: string,
  options: { remove?: boolean; language?: string | undefined } = {},
): { text: string; errors: ReturnType<typeof parse>['diagnostics'] } {
  // A file without the directive is already approved: it is left as it is.
  const text =
    statusDirectiveLine(source) === undefined
      ? source
      : setStatusDirective(source, options.remove === true ? undefined : 'approved');
  const { diagnostics } = parse(
    text,
    options.language === undefined ? {} : { language: options.language },
  );
  return { text, errors: diagnostics.filter((d) => d.severity === 'error') };
}

/** Runs `nimaime approve`; returns the exit code (0 ok, 1 a file has errors, 2 missing files). */
export async function runApprove(args: ApproveArgs, io: DraftIO): Promise<DraftExitCode> {
  const cwd = io.cwd ?? process.cwd();
  const say = (text: string): void => {
    io.stderr.write(`${text}\n`);
  };
  let code: DraftExitCode = 0;
  for (const name of args.files) {
    const file = path.resolve(cwd, name);
    const shown = path.relative(cwd, file) || file;
    let source: string;
    try {
      source = await fs.readFile(file, 'utf8');
    } catch {
      say(`nimaime approve: No such file: ${name}`);
      code = 2;
      continue;
    }
    const { text, errors } = approveSource(source, {
      remove: args.remove,
      language: args.language,
    });
    if (errors.length > 0) {
      for (const d of errors) say(formatDiagnostic(d, shown));
      if (!args.force) {
        say(
          `nimaime approve: ${shown} was not approved: ${String(errors.length)} error${errors.length === 1 ? '' : 's'}. ` +
            'An approved specification must be valid; fix it, or use --force.',
        );
        if (code === 0) code = 1;
        continue;
      }
      say(`warning: approving ${shown} despite its errors (--force).`);
    }
    if (text === source) {
      io.stdout.write(`${shown} is already approved\n`);
      continue;
    }
    await fs.writeFile(file, text);
    io.stdout.write(`Approved ${shown}\n`);
  }
  return code;
}
