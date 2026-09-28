/**
 * Command-line parsing of `nimaime` (Node's built-in `util.parseArgs`, no dependency).
 *
 * `nimaime` is the command for working with specifications of live screens; `nimaime-gen` stays
 * the generator. Commands are listed in `COMMANDS`; `draft` is the first one (`diff` and `approve`
 * are planned, see docs/draft.md).
 */
import { parseArgs } from 'node:util';

/** A `nimaime` command: its name and the one-line summary shown by `nimaime --help`. */
export interface CommandInfo {
  name: string;
  summary: string;
  usage: string;
}

/** The commands of `nimaime` (add `diff` / `approve` here when they exist). */
export const COMMANDS: readonly CommandInfo[] = [
  {
    name: 'draft',
    summary: 'Observe a live screen and propose a Sanmaime draft (and definitions)',
    usage: 'nimaime draft <url | file.html | observation.json> [options]',
  },
];

export const LANGUAGE_VALUES = ['en', 'ja'] as const;
export const BROWSER_VALUES = ['chromium', 'firefox', 'webkit'] as const;
export const GROUP_BY_VALUES = ['region', 'flat'] as const;

export type DraftLanguageArg = (typeof LANGUAGE_VALUES)[number];
export type BrowserName = (typeof BROWSER_VALUES)[number];
export type GroupBy = (typeof GROUP_BY_VALUES)[number];

export const HELP = `Usage: nimaime <command> [options]

Work with the Sanmaime specifications of live screens.

Commands:
${COMMANDS.map((c) => `  ${c.name.padEnd(10)} ${c.summary}`).join('\n')}

Options:
  -h, --help     Print this help (or 'nimaime <command> --help' for a command)
  -v, --version  Print the version

Generate tests from approved specifications with nimaime-gen.`;

export const DRAFT_HELP = `Usage: nimaime draft <url | file.html | observation.json> [options]

Open a screen in a browser, observe its landmarks and named elements, and propose a Sanmaime
draft for a human to review. The draft is written to stdout unless --out is given.

Options:
  -s, --screen <name>          Screen name (default: the page title)
  -l, --language <en|ja>       Keyword language of the draft (default: en)
  -o, --out <file>             Write the Sanmaime draft to this file instead of stdout
  -d, --definitions <file|->   Also write a draft of the element definitions (TypeScript);
                               '-' prints it to stdout after the Sanmaime draft
      --observation <file>     Save what was observed (JSON), to propose from again offline
      --group-by <region|flat> One element per landmark (default), or a single element
      --storage-state <file>   Playwright storage state (cookies, localStorage) for screens that
                               need a signed-in user
      --wait <ms|selector>     After loading, wait this many milliseconds or for this selector
      --timeout <ms>           Navigation and --wait timeout (default: 30000)
      --test-id-attribute <n>  Attribute read as the test id (default: data-testid)
      --llm <module>           Refine the draft with an LLM: a module whose default export is an
                               LlmAdapter (see docs/draft.md); falls back to the rule-based draft
      --browser <name>         chromium (default), firefox or webkit
      --headed                 Show the browser window
  -h, --help                   Print this help

The source is a URL (http:, https:, file:), an HTML file, or an observation saved with
--observation (no browser is started then). Chromium honours PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.

Exit codes: 0 success, 1 the screen could not be drafted, 2 usage errors.

Example:
  npx nimaime draft http://localhost:3000/users/me --screen "User Details" > specs/user-details.sanmaime`;

/** `--wait`: a delay, or a selector to wait for. */
export type WaitFor = { ms: number } | { selector: string };

export interface DraftArgs {
  command: 'draft';
  source: string;
  screen: string | undefined;
  language: DraftLanguageArg;
  out: string | undefined;
  definitions: string | undefined;
  observation: string | undefined;
  groupBy: GroupBy;
  storageState: string | undefined;
  wait: WaitFor | undefined;
  timeout: number;
  testIdAttribute: string | undefined;
  llm: string | undefined;
  browser: BrowserName;
  headed: boolean;
}

export type NimaimeArgs =
  { command: 'help'; topic: string | undefined } | { command: 'version' } | DraftArgs;

/** Error in the command line (exit code 2). */
export class NimaimeUsageError extends Error {
  override name = 'NimaimeUsageError';
}

function oneOf<T extends string>(option: string, value: string, values: readonly T[]): T {
  if ((values as readonly string[]).includes(value)) return value as T;
  throw new NimaimeUsageError(`Invalid ${option} '${value}'. Use one of: ${values.join(', ')}.`);
}

function nonEmpty(option: string, value: string | undefined): string | undefined {
  if (value === '') throw new NimaimeUsageError(`Option ${option} needs a value.`);
  return value;
}

function milliseconds(option: string, value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new NimaimeUsageError(`Option ${option} needs a number of milliseconds, got '${value}'.`);
  }
  return Number(value);
}

/** Parses `argv` (without `node` and the script path). @throws NimaimeUsageError */
export function parseNimaimeArgs(argv: readonly string[]): NimaimeArgs {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        screen: { type: 'string', short: 's' },
        language: { type: 'string', short: 'l' },
        out: { type: 'string', short: 'o' },
        definitions: { type: 'string', short: 'd' },
        observation: { type: 'string' },
        'group-by': { type: 'string' },
        'storage-state': { type: 'string' },
        wait: { type: 'string' },
        timeout: { type: 'string' },
        'test-id-attribute': { type: 'string' },
        llm: { type: 'string' },
        browser: { type: 'string' },
        headed: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (error) {
    throw new NimaimeUsageError(error instanceof Error ? error.message : String(error));
  }
  const { values, positionals } = parsed;
  const [command, ...rest] = positionals;

  if (command === undefined) {
    if (values.version === true) return { command: 'version' };
    if (values.help === true) return { command: 'help', topic: undefined };
    throw new NimaimeUsageError('Missing command.');
  }
  if (command === 'help') return { command: 'help', topic: rest[0] };
  if (!COMMANDS.some((c) => c.name === command)) {
    throw new NimaimeUsageError(
      `Unknown command '${command}'. Commands: ${COMMANDS.map((c) => c.name).join(', ')}.`,
    );
  }
  if (values.help === true) return { command: 'help', topic: command };

  // command === 'draft'
  if (rest.length === 0) {
    throw new NimaimeUsageError('nimaime draft needs a URL, an HTML file or an observation file.');
  }
  if (rest.length > 1) throw new NimaimeUsageError(`Unexpected argument '${rest[1] ?? ''}'.`);
  const source = rest[0] ?? '';
  const screen = values.screen?.trim();
  if (screen === '') throw new NimaimeUsageError('Option --screen needs a name.');
  let wait: WaitFor | undefined;
  if (values.wait !== undefined) {
    if (values.wait === '') throw new NimaimeUsageError('Option --wait needs a value.');
    wait = /^\d+$/.test(values.wait) ? { ms: Number(values.wait) } : { selector: values.wait };
  }
  return {
    command: 'draft',
    source,
    screen,
    language: oneOf('--language', values.language ?? 'en', LANGUAGE_VALUES),
    out: nonEmpty('--out', values.out),
    definitions: nonEmpty('--definitions', values.definitions),
    observation: nonEmpty('--observation', values.observation),
    groupBy: oneOf('--group-by', values['group-by'] ?? 'region', GROUP_BY_VALUES),
    storageState: nonEmpty('--storage-state', values['storage-state']),
    wait,
    timeout: values.timeout === undefined ? 30_000 : milliseconds('--timeout', values.timeout),
    testIdAttribute: nonEmpty('--test-id-attribute', values['test-id-attribute']),
    llm: nonEmpty('--llm', values.llm),
    browser: oneOf('--browser', values.browser ?? 'chromium', BROWSER_VALUES),
    headed: values.headed === true,
  };
}
