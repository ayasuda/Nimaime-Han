/**
 * `nimaime diff <spec> <url | file.html | observation.json | other.sanmaime>` as a function
 * (docs/review-workflow.md): re-observes the screen of an approved specification (as
 * `nimaime draft` does, with the spec's screen name and language), or reads another `.sanmaime`
 * file, and prints how the two differ in Sanmaime terms. No process globals.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { DiffArgs } from '../cli/nimaime-args';
import { formatDiagnostic, parse, type SanmaimeDocument } from '../parser';
import { diffDocuments, formatDiff } from './diff';
import { ObservationFormatError } from './observe';
import { DraftError, proposeSanmaime } from './propose';
import type { DraftLanguage } from './names';
import {
  DraftUsageError,
  observeSource,
  resolveSource,
  type DraftExitCode,
  type DraftIO,
} from './run';

/** A problem that prevents the comparison (exit code 2). */
class DiffError extends Error {
  override name = 'DiffError';
}

async function readSpec(
  name: string,
  cwd: string,
  language: string | undefined,
  say: (text: string) => void,
): Promise<SanmaimeDocument> {
  const file = path.resolve(cwd, name);
  let source: string;
  try {
    source = await fs.readFile(file, 'utf8');
  } catch {
    throw new DiffError(`No such file: ${name}`);
  }
  const shown = path.relative(cwd, file) || file;
  const { document, diagnostics } = parse(source, {
    uri: shown,
    ...(language === undefined ? {} : { language }),
  });
  const errors = diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) {
    for (const d of errors) say(formatDiagnostic(d, shown));
    throw new DiffError(`${shown} has errors; fix them before comparing.`);
  }
  return document;
}

const isSanmaime = (name: string): boolean => name.toLowerCase().endsWith('.sanmaime');

/** Runs `nimaime diff`; returns 0 (no differences), 1 (differences) or 2 (could not compare). */
export async function runDiff(args: DiffArgs, io: DraftIO): Promise<DraftExitCode> {
  const cwd = io.cwd ?? process.cwd();
  const env = io.env ?? process.env;
  const say = (text: string): void => {
    io.stderr.write(`${text}\n`);
  };
  try {
    const spec = await readSpec(args.spec, cwd, args.language, say);
    let compared: SanmaimeDocument = spec;
    let other: SanmaimeDocument;
    let otherLabel: string;
    let otherWord: string;

    if (isSanmaime(args.other)) {
      other = await readSpec(args.other, cwd, args.language, say);
      otherLabel = path.relative(cwd, path.resolve(cwd, args.other)) || args.other;
      otherWord = path.basename(args.other);
      if (args.screen !== undefined) {
        compared = { ...spec, screens: spec.screens.filter((s) => s.name === args.screen) };
        other = { ...other, screens: other.screens.filter((s) => s.name === args.screen) };
        if (compared.screens.length === 0) {
          throw new DiffError(`${args.spec} has no Screen "${args.screen}".`);
        }
      }
    } else {
      // One observation is one screen: pick the spec's screen to compare it with.
      const names = spec.screens.map((s) => s.name);
      let screen = spec.screens[0];
      if (args.screen !== undefined) {
        screen = spec.screens.find((s) => s.name === args.screen);
        if (!screen) {
          throw new DiffError(
            `${args.spec} has no Screen "${args.screen}" (screens: ${names.join(', ')}).`,
          );
        }
      } else if (spec.screens.length > 1) {
        throw new DiffError(
          `${args.spec} has several screens (${names.join(', ')}); choose one with --screen.`,
        );
      }
      if (!screen) throw new DiffError(`${args.spec} has no Screen: to compare.`);
      compared = { ...spec, screens: [screen] };

      const source = await resolveSource(args.other, cwd);
      const observation = await observeSource(source, args, { cwd, env, say });
      if (observation.truncated) {
        say(
          'warning: the page has more elements than were observed; the comparison is incomplete.',
        );
      }
      const language: DraftLanguage = spec.language === 'ja' ? 'ja' : 'en';
      try {
        const proposal = proposeSanmaime(observation, {
          screen: screen.name,
          language,
          groupBy: args.groupBy,
          header: false,
        });
        other = parse(proposal.sanmaime, { language }).document;
      } catch (error) {
        if (!(error instanceof DraftError)) throw error;
        // Nothing observable: everything the spec states unconditionally is missing.
        other = { ...spec, screens: [{ ...screen, elements: [] }] };
      }
      otherLabel = observation.url;
      otherWord = 'observed';
    }

    const diff = diffDocuments(compared, other);
    if (args.json) {
      io.stdout.write(
        `${JSON.stringify({ spec: path.relative(cwd, path.resolve(cwd, args.spec)) || args.spec, other: otherLabel, ...diff }, null, 2)}\n`,
      );
    } else {
      io.stdout.write(
        formatDiff(diff, {
          spec: path.relative(cwd, path.resolve(cwd, args.spec)) || args.spec,
          other: otherLabel,
          otherWord,
          language: spec.language,
        }),
      );
    }
    return diff.identical ? 0 : 1;
  } catch (error) {
    if (
      error instanceof DiffError ||
      error instanceof DraftUsageError ||
      error instanceof ObservationFormatError
    ) {
      say(`nimaime diff: ${error.message}`);
      return 2;
    }
    // Playwright errors (e.g. navigation failed): the comparison could not be made.
    say(`nimaime diff: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}
