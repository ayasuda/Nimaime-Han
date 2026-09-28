/**
 * Command-line parsing of `nimaime` (Node's built-in `util.parseArgs`, no dependency).
 *
 * `nimaime` is the command for working with specifications of live screens; `nimaime-gen` stays
 * the generator. Commands are listed in `COMMANDS`: `draft` (docs/draft.md), `diff` and `approve`
 * (docs/review-workflow.md). Each command accepts only its own options.
 */
import { parseArgs } from 'node:util';

/** A `nimaime` command: its name and the one-line summary shown by `nimaime --help`. */
export interface CommandInfo {
  name: string;
  summary: string;
  usage: string;
}

/** The commands of `nimaime`. */
export const COMMANDS: readonly CommandInfo[] = [
  {
    name: 'draft',
    summary: 'Observe a live screen and propose a Sanmaime draft (and definitions)',
    usage: 'nimaime draft <url | file.html | observation.json> [options]',
  },
  {
    name: 'diff',
    summary: 'Compare an approved specification with the screen as it is now',
    usage:
      'nimaime diff <spec.sanmaime> <url | file.html | observation.json | other.sanmaime> [options]',
  },
  {
    name: 'approve',
    summary: 'Mark reviewed drafts as approved (# status: approved)',
    usage: 'nimaime approve <file.sanmaime...> [options]',
  },
];

export const LANGUAGE_VALUES = ['en', 'ja'] as const;
export const BROWSER_VALUES = ['chromium', 'firefox', 'webkit'] as const;
export const GROUP_BY_VALUES = ['region', 'flat'] as const;
export const STATUS_VALUES = ['draft', 'approved'] as const;

export type DraftLanguageArg = (typeof LANGUAGE_VALUES)[number];
export type BrowserName = (typeof BROWSER_VALUES)[number];
export type GroupBy = (typeof GROUP_BY_VALUES)[number];
export type DraftStatusArg = (typeof STATUS_VALUES)[number];

export const HELP = `Usage: nimaime <command> [options]

Work with the Sanmaime specifications of live screens.

Commands:
${COMMANDS.map((c) => `  ${c.name.padEnd(10)} ${c.summary}`).join('\n')}

Options:
  -h, --help     Print this help (or 'nimaime <command> --help' for a command)
  -v, --version  Print the version

Generate tests from approved specifications with nimaime-gen (docs/review-workflow.md).`;

export const DRAFT_HELP = `Usage: nimaime draft <url | file.html | observation.json> [options]

Open a screen in a browser, observe its landmarks and named elements, and propose a Sanmaime
draft for a human to review. The draft is written to stdout unless --out is given.

Options:
  -s, --screen <name>          Screen name (default: the page title)
  -l, --language <en|ja>       Keyword language of the draft (default: en)
  -o, --out <file>             Write the Sanmaime draft to this file instead of stdout
      --status <draft|approved>
                               The # status: line written first (default: draft; nimaime-gen
                               skips drafts until they are approved with 'nimaime approve')
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

export const DIFF_HELP = `Usage: nimaime diff <spec.sanmaime> <url | file.html | observation.json | other.sanmaime> [options]

Observe the screen again (as 'nimaime draft' does) and compare the specification with what is on
the screen now, in Sanmaime terms: '=' in both, '-' in the spec but not observed, '+' observed but
not in the spec, '!' stated differently (Enable/Disable, Show/Hide). Screens and elements are
matched by name. When: blocks cannot be observed and are listed as not compared. Given a second
.sanmaime file (e.g. a draft saved earlier), the two files are compared instead.

Options:
  -s, --screen <name>          The screen of the spec to compare (needed when it has several)
  -l, --language <en|ja>       Keyword language of .sanmaime files without a # language: line
                               (default: en)
      --json                   Print the differences as JSON
      --observation <file>     Save what was observed (JSON)
      --group-by <region|flat> How the observed screen is grouped into elements (default: region)
      --storage-state <file>   Playwright storage state for screens that need a signed-in user
      --wait <ms|selector>     After loading, wait this many milliseconds or for this selector
      --timeout <ms>           Navigation and --wait timeout (default: 30000)
      --test-id-attribute <n>  Attribute read as the test id (default: data-testid)
      --browser <name>         chromium (default), firefox or webkit
      --headed                 Show the browser window
  -h, --help                   Print this help

Exit codes: 0 no differences, 1 differences, 2 usage errors or the comparison could not be made
(invalid spec, navigation failed).

Example:
  npx nimaime diff specs/login.sanmaime http://localhost:3000/login`;

export const APPROVE_HELP = `Usage: nimaime approve <file.sanmaime...> [options]

Mark reviewed specifications as approved: rewrite their '# status: draft' line to
'# status: approved' (nothing else in the file changes). nimaime-gen generates approved
specifications only. A file without a # status: line is already approved.

Options:
      --remove                 Delete the # status: line instead of rewriting it
      --force                  Approve even when the file has Sanmaime errors
  -l, --language <en|ja>       Keyword language of files without a # language: line (default: en)
  -h, --help                   Print this help

An approved specification must be valid: a file with errors is not changed (exit code 1) unless
--force is given.

Exit codes: 0 success, 1 a file has errors, 2 usage errors (missing files).

Example:
  npx nimaime approve specs/login.sanmaime`;

/** `--wait`: a delay, or a selector to wait for. */
export type WaitFor = { ms: number } | { selector: string };

export interface DraftArgs {
  command: 'draft';
  source: string;
  screen: string | undefined;
  language: DraftLanguageArg;
  out: string | undefined;
  /** The `# status:` line written at the top of the draft. */
  status: DraftStatusArg;
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

/** How a screen is opened and observed (shared by `draft` and `diff`). */
export type ObserveArgs = Pick<
  DraftArgs,
  'storageState' | 'wait' | 'timeout' | 'testIdAttribute' | 'browser' | 'headed'
>;

export interface DiffArgs extends ObserveArgs {
  command: 'diff';
  spec: string;
  /** A URL, an HTML file, an observation (`.json`) or another `.sanmaime` file. */
  other: string;
  screen: string | undefined;
  /** Default keyword language of `.sanmaime` files without a directive. */
  language: DraftLanguageArg | undefined;
  json: boolean;
  observation: string | undefined;
  groupBy: GroupBy;
}

export interface ApproveArgs {
  command: 'approve';
  files: string[];
  remove: boolean;
  force: boolean;
  language: DraftLanguageArg | undefined;
}

export type NimaimeArgs =
  | { command: 'help'; topic: string | undefined }
  | { command: 'version' }
  | DraftArgs
  | DiffArgs
  | ApproveArgs;

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

const OPTIONS = {
  screen: { type: 'string', short: 's' },
  language: { type: 'string', short: 'l' },
  out: { type: 'string', short: 'o' },
  status: { type: 'string' },
  json: { type: 'boolean' },
  remove: { type: 'boolean' },
  force: { type: 'boolean' },
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
} as const;

const OBSERVE_OPTIONS = [
  'storage-state',
  'wait',
  'timeout',
  'test-id-attribute',
  'browser',
  'headed',
] as const;

/** The options each command accepts (besides `--help`). */
const OPTIONS_OF: Readonly<Record<string, readonly string[]>> = {
  draft: [
    'screen',
    'language',
    'out',
    'status',
    'definitions',
    'observation',
    'group-by',
    'llm',
    ...OBSERVE_OPTIONS,
  ],
  diff: ['screen', 'language', 'json', 'observation', 'group-by', ...OBSERVE_OPTIONS],
  approve: ['remove', 'force', 'language'],
};

/** Parses `argv` (without `node` and the script path). @throws NimaimeUsageError */
export function parseNimaimeArgs(argv: readonly string[]): NimaimeArgs {
  let parsed;
  try {
    parsed = parseValues(argv);
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

  const allowed = OPTIONS_OF[command] ?? [];
  for (const option of Object.keys(values)) {
    if (!allowed.includes(option) && option !== 'help' && option !== 'version') {
      throw new NimaimeUsageError(`Option --${option} is not an option of nimaime ${command}.`);
    }
  }
  switch (command) {
    case 'diff':
      return diffArgs(values, rest);
    case 'approve':
      return approveArgs(values, rest);
    default:
      return draftArgs(values, rest);
  }
}

type Values = ReturnType<typeof parseValues>['values'];

function parseValues(argv: readonly string[]) {
  return parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: OPTIONS,
  });
}

function waitFor(value: string | undefined): WaitFor | undefined {
  if (value === undefined) return undefined;
  if (value === '') throw new NimaimeUsageError('Option --wait needs a value.');
  return /^\d+$/.test(value) ? { ms: Number(value) } : { selector: value };
}

function screenName(value: string | undefined): string | undefined {
  const screen = value?.trim();
  if (screen === '') throw new NimaimeUsageError('Option --screen needs a name.');
  return screen;
}

function observeArgs(values: Values): ObserveArgs {
  return {
    storageState: nonEmpty('--storage-state', values['storage-state']),
    wait: waitFor(values.wait),
    timeout: values.timeout === undefined ? 30_000 : milliseconds('--timeout', values.timeout),
    testIdAttribute: nonEmpty('--test-id-attribute', values['test-id-attribute']),
    browser: oneOf('--browser', values.browser ?? 'chromium', BROWSER_VALUES),
    headed: values.headed === true,
  };
}

function draftArgs(values: Values, rest: readonly string[]): DraftArgs {
  if (rest.length === 0) {
    throw new NimaimeUsageError('nimaime draft needs a URL, an HTML file or an observation file.');
  }
  if (rest.length > 1) throw new NimaimeUsageError(`Unexpected argument '${rest[1] ?? ''}'.`);
  const observe = observeArgs(values);
  return {
    command: 'draft',
    source: rest[0] ?? '',
    screen: screenName(values.screen),
    language: oneOf('--language', values.language ?? 'en', LANGUAGE_VALUES),
    out: nonEmpty('--out', values.out),
    status: oneOf('--status', values.status ?? 'draft', STATUS_VALUES),
    definitions: nonEmpty('--definitions', values.definitions),
    observation: nonEmpty('--observation', values.observation),
    groupBy: oneOf('--group-by', values['group-by'] ?? 'region', GROUP_BY_VALUES),
    storageState: observe.storageState,
    wait: observe.wait,
    timeout: observe.timeout,
    testIdAttribute: observe.testIdAttribute,
    llm: nonEmpty('--llm', values.llm),
    browser: observe.browser,
    headed: observe.headed,
  };
}

function diffArgs(values: Values, rest: readonly string[]): DiffArgs {
  if (rest.length < 2) {
    throw new NimaimeUsageError(
      'nimaime diff needs a specification and a URL, an HTML file, an observation or another .sanmaime file.',
    );
  }
  if (rest.length > 2) throw new NimaimeUsageError(`Unexpected argument '${rest[2] ?? ''}'.`);
  return {
    command: 'diff',
    spec: rest[0] ?? '',
    other: rest[1] ?? '',
    screen: screenName(values.screen),
    language:
      values.language === undefined
        ? undefined
        : oneOf('--language', values.language, LANGUAGE_VALUES),
    json: values.json === true,
    observation: nonEmpty('--observation', values.observation),
    groupBy: oneOf('--group-by', values['group-by'] ?? 'region', GROUP_BY_VALUES),
    ...observeArgs(values),
  };
}

function approveArgs(values: Values, rest: readonly string[]): ApproveArgs {
  if (rest.length === 0) throw new NimaimeUsageError('nimaime approve needs one or more files.');
  return {
    command: 'approve',
    files: [...rest],
    remove: values.remove === true,
    force: values.force === true,
    language:
      values.language === undefined
        ? undefined
        : oneOf('--language', values.language, LANGUAGE_VALUES),
  };
}
