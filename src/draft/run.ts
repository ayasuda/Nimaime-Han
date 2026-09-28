/**
 * `nimaime draft` as a function (docs/draft.md): observe a source, propose, validate, write.
 * No process globals, so that it can be tested in-process.
 */
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DraftArgs, ObserveArgs } from '../cli/nimaime-args';
import type { LlmAdapter, LlmProposal } from './llm';
import { proposeWithLlm } from './llm';
import { cleanName } from './names';
import { ObservationFormatError, observeScreen, parseObservation } from './observe';
import { parse } from '../parser';
import { proposeSanmaime, type Proposal } from './propose';
import { setStatusDirective } from './status';
import type { ScreenObservation } from './types';

export interface DraftIO {
  stdout: { write(text: string): unknown };
  stderr: { write(text: string): unknown };
  /** Default: `process.cwd()`. */
  cwd?: string | undefined;
  /** Default: `process.env`. */
  env?: Readonly<Record<string, string | undefined>> | undefined;
}

/** Printed between the Sanmaime draft and the definitions when both go to stdout. */
export const DEFINITIONS_SEPARATOR = '# ---- definitions (TypeScript) ----';

/**
 * Exit code of `nimaime`: 0 success, 1 the screen could not be drafted (navigation failed, nothing
 * to propose, …), 2 usage errors (options, missing or invalid input files, `--llm` module).
 */
export type DraftExitCode = 0 | 1 | 2;

/** A problem with the command line or its files (exit code 2). */
export class DraftUsageError extends Error {
  override name = 'DraftUsageError';
}

const URL_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

/** Where the draft comes from: a URL to open, or a saved observation. */
export type DraftSource = { kind: 'url'; url: string } | { kind: 'observation'; file: string };

/** Classifies the positional argument of `nimaime draft`. */
export async function resolveSource(source: string, cwd: string): Promise<DraftSource> {
  // A Windows drive letter (`C:\…`) is a path, not a URL scheme.
  if (URL_PATTERN.test(source) && !/^[a-z]:[\\/]/i.test(source))
    return { kind: 'url', url: source };
  const file = path.resolve(cwd, source);
  try {
    await fs.access(file);
  } catch {
    throw new DraftUsageError(
      `No such file: ${source} (give a URL, an HTML file or an observation).`,
    );
  }
  if (file.toLowerCase().endsWith('.json')) return { kind: 'observation', file };
  return { kind: 'url', url: pathToFileURL(file).href };
}

/** Opens `url` in a browser and observes it (`nimaime draft` and `nimaime diff`). */
export async function observeUrl(
  url: string,
  args: ObserveArgs,
  cwd: string,
  env: Readonly<Record<string, string | undefined>>,
): Promise<ScreenObservation> {
  // Imported lazily: `nimaime --help` and offline drafts do not load Playwright.
  const playwright = await import('@playwright/test');
  const browserType = playwright[args.browser];
  const executablePath =
    args.browser === 'chromium' ? env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH : undefined;
  const browser = await browserType.launch({
    headless: !args.headed,
    ...(executablePath !== undefined && executablePath !== '' ? { executablePath } : {}),
  });
  try {
    const context = await browser.newContext(
      args.storageState !== undefined ? { storageState: path.resolve(cwd, args.storageState) } : {},
    );
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load', timeout: args.timeout });
    // Give client-side rendering a moment to settle, without failing on long-polling pages.
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
    if (args.wait !== undefined) {
      if ('ms' in args.wait) await page.waitForTimeout(args.wait.ms);
      else await page.waitForSelector(args.wait.selector, { timeout: args.timeout });
    }
    return await observeScreen(page, {
      ...(args.testIdAttribute !== undefined ? { testIdAttribute: args.testIdAttribute } : {}),
    });
  } finally {
    await browser.close();
  }
}

/** Loads the `--llm` module (a path, or a package resolved from `cwd`) and returns its adapter. */
export async function loadLlmAdapter(specifier: string, cwd: string): Promise<LlmAdapter> {
  let resolved: string;
  const local = path.resolve(cwd, specifier);
  try {
    await fs.access(local);
    resolved = local;
  } catch {
    try {
      resolved = createRequire(path.join(cwd, 'noop.js')).resolve(specifier);
    } catch {
      throw new DraftUsageError(`Cannot find the --llm module '${specifier}'.`);
    }
  }
  const module = (await import(pathToFileURL(resolved).href)) as { default?: unknown };
  const adapter = module.default;
  if (typeof adapter !== 'function') {
    throw new DraftUsageError(
      `The --llm module '${specifier}' must export an LlmAdapter function as its default export.`,
    );
  }
  return adapter as LlmAdapter;
}

/**
 * The observation of `source`: read from a saved observation, or observed in a browser; saved to
 * `args.observation` when given. @throws DraftUsageError, ObservationFormatError
 */
export async function observeSource(
  source: DraftSource,
  args: ObserveArgs & { observation: string | undefined },
  context: {
    cwd: string;
    env: Readonly<Record<string, string | undefined>>;
    say: (text: string) => void;
  },
): Promise<ScreenObservation> {
  const { cwd, env, say } = context;
  let observation: ScreenObservation;
  if (source.kind === 'observation') {
    let json: unknown;
    try {
      json = JSON.parse(await fs.readFile(source.file, 'utf8'));
    } catch (error) {
      throw new DraftUsageError(
        `Cannot read ${path.relative(cwd, source.file) || source.file}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    observation = parseObservation(json);
  } else {
    observation = await observeUrl(source.url, args, cwd, env);
  }
  if (args.observation !== undefined) {
    const file = path.resolve(cwd, args.observation);
    await writeFile(file, `${JSON.stringify(observation, null, 2)}\n`);
    say(`Saved the observation to ${path.relative(cwd, file) || file}`);
  }
  return observation;
}

export async function writeFile(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

/** `N elements, M targets` of a (valid) draft. */
function summary(sanmaime: string): string {
  const elements = parse(sanmaime).document.screens.flatMap((s) => s.elements);
  const targets = new Set<string>();
  for (const element of elements) {
    for (const e of [
      ...element.unconditional,
      ...element.conditions.flatMap((c) => c.expectations),
    ]) {
      if (e.kind === 'show' || e.kind === 'hide') targets.add(`${element.name}\u0000${e.target}`);
    }
  }
  const count = (n: number, word: string): string => `${String(n)} ${word}${n === 1 ? '' : 's'}`;
  return `${count(elements.length, 'element')}, ${count(targets.size, 'target')}`;
}

/** Runs `nimaime draft`; returns the exit code. Messages go to `io.stderr`. */
export async function runDraft(args: DraftArgs, io: DraftIO): Promise<DraftExitCode> {
  const cwd = io.cwd ?? process.cwd();
  const env = io.env ?? process.env;
  const say = (text: string): void => {
    io.stderr.write(`${text}\n`);
  };
  try {
    const source = await resolveSource(args.source, cwd);
    const adapter = args.llm !== undefined ? await loadLlmAdapter(args.llm, cwd) : undefined;

    const observation = await observeSource(source, args, { cwd, env, say });
    if (observation.truncated) {
      say('warning: the page has more elements than were observed; the draft is incomplete.');
    }

    const screen = args.screen ?? (cleanName(observation.title) || 'Screen');
    const options = { screen, language: args.language, groupBy: args.groupBy };
    let proposal: Proposal | LlmProposal;
    if (adapter) {
      const result = await proposeWithLlm(observation, options, adapter);
      for (const rejected of result.rejected) {
        say(`warning: LLM answer ${String(rejected.attempt)} rejected:`);
        for (const problem of rejected.problems) say(`  ${problem}`);
      }
      if (result.source === 'rule-based') say('warning: using the rule-based draft instead.');
      for (const { element, target } of result.unmatchedTargets) {
        say(
          `note: no observed locator for "${target}" of Element "${element}" (TODO in the definitions).`,
        );
      }
      proposal = result;
    } else {
      proposal = proposeSanmaime(observation, options);
    }
    for (const dropped of proposal.dropped) {
      say(
        `note: left out ${dropped.item === undefined ? '' : `"${dropped.item}" of `}Element "${dropped.element}": ${dropped.diagnostic.message}`,
      );
    }

    // The first line says what the file is: a draft, until a reviewer approves it.
    const sanmaime = setStatusDirective(proposal.sanmaime, args.status);
    if (args.out !== undefined) {
      const file = path.resolve(cwd, args.out);
      await writeFile(file, sanmaime);
      say(`Wrote the Sanmaime draft to ${path.relative(cwd, file) || file}`);
    } else {
      io.stdout.write(sanmaime);
    }
    if (args.definitions === '-') {
      if (args.out === undefined) io.stdout.write(`\n${DEFINITIONS_SEPARATOR}\n\n`);
      io.stdout.write(proposal.definitions);
    } else if (args.definitions !== undefined) {
      const file = path.resolve(cwd, args.definitions);
      await writeFile(file, proposal.definitions);
      say(`Wrote the definitions draft to ${path.relative(cwd, file) || file}`);
    }
    const how = 'source' in proposal ? proposal.source : 'rule-based';
    say(
      `Drafted Screen "${proposal.screen}" from ${observation.url}: ${summary(proposal.sanmaime)} (${how}). Review it before committing.`,
    );
    return 0;
  } catch (error) {
    if (error instanceof DraftUsageError || error instanceof ObservationFormatError) {
      say(`nimaime draft: ${error.message}`);
      return 2;
    }
    // DraftError, Playwright errors (e.g. navigation failed): the message says it.
    const text = error instanceof Error ? error.message : String(error);
    say(`nimaime draft: ${text}`);
    return 1;
  }
}
