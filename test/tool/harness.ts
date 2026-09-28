/**
 * Harness of the tool test cases (`npm run test:tool`, docs/contributing-tests.md).
 *
 * A case is a directory under test/tool/cases/ holding a small user project (playwright.config.ts
 * with defineSanmaimeConfig(), specs, definitions, …) and a `case.test.ts` that drives it with
 * `runCase()`:
 *
 * 1. the project is copied into a fresh temp directory (so generated files and test results never
 *    land in the repository) and given a `node_modules` in which `nimaime-han` and
 *    `@playwright/test` resolve (see `linkNodeModules()`) and a tsconfig.json without `paths`;
 * 2. the BUILT `nimaime-gen` (`node_modules/nimaime-han/dist/cli/nimaime-gen.js`, so
 *    `npm run build` must run first) is run in it as a child process;
 * 3. its exit code and output are checked, and the files it generated are compared with file
 *    snapshots in the case's `__snapshots__/` directory;
 * 4. `playwright test` is run with the JSON reporter (to a file) and the Sanmaime reporter (to
 *    stdout), and the numbers of passed / failed / skipped tests and the output are checked.
 *
 * Environment:
 * - `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`: passed through; the cases' configs launch Chromium from
 *   it when set (e.g. a sandbox whose preinstalled Chromium is not the revision Playwright expects).
 * - `NIMAIME_TOOL_NODE_MODULES`: a `node_modules` directory to use instead of the repository's, e.g.
 *   one prepared by `test/tool/install-playwright.js` with another Playwright version and a packed
 *   copy of nimaime-han (the Playwright version matrix in CI).
 * - `NIMAIME_TOOL_PACKAGE_TYPE=commonjs`: the `type` of the package.json written into projects that
 *   have none (default: `module`). The version matrix runs both, because nimaime-gen loads ES module
 *   projects only with recent Playwright versions (docs/contributing-tests.md).
 * - `NIMAIME_TOOL_KEEP=1`: keep the temp projects (their paths are printed) for debugging.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, expect } from 'vitest';

export const repoRoot = path.resolve(import.meta.dirname, '..', '..');

/** Files of a case directory that are not part of the project. */
const CASE_ONLY = new Set(['case.test.ts', '__snapshots__']);
/** Directories never listed as project files. */
const NOT_LISTED = new Set(['node_modules', 'test-results', 'playwright-report', 'blob-report']);

const TSCONFIG = `${JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2023', 'DOM'],
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      skipLibCheck: true,
    },
  },
  null,
  2,
)}\n`;

const tempDirs: string[] = [];

afterAll(() => {
  if (process.env.NIMAIME_TOOL_KEEP === '1') return;
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A pattern that output must contain: a substring or a regular expression. */
export type OutputPattern = string | RegExp;

export interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface GenOptions {
  /** Arguments of nimaime-gen (e.g. `['check', '-c', 'other.config.ts']`). Default: none. */
  args?: string[];
  /** Expected exit code. Default: 0. */
  exitCode?: number;
  /** Patterns stdout / stderr must contain. */
  stdout?: OutputPattern[];
  stderr?: OutputPattern[];
  /** Expected stdout, exactly (after `normalizeOutput()`). */
  stdoutExact?: string;
  /**
   * Expected files written by nimaime-gen, relative to the project and sorted (e.g.
   * `['.sanmaime-gen/specs/login.spec.ts']`). Default: not checked. `[]`: nothing written.
   */
  generated?: string[];
  /**
   * Compare every written file with `__snapshots__/<path>.snap` in the case directory
   * (`vitest -u` updates them). Default: true.
   */
  snapshot?: boolean;
}

export interface PlaywrightOptions {
  /** Extra arguments of `playwright test` (e.g. `['-c', 'other.config.ts', '--project', 'x']`). */
  args?: string[];
  /**
   * Reporters besides `json` (which always writes to a file for the counts). Default:
   * `['nimaime-han/reporter']`, so stdout is the Sanmaime tree. Add `'line'` / `'list'` to get
   * Playwright's own failure output too. `'config'`: no `--reporter` option, the reporters of the
   * config file are used (they must include `json` without an `outputFile`).
   */
  reporters?: string[] | 'config';
  /** Expected exit code. Default: 1 if `failed` > 0, else 0. */
  exitCode?: number;
  /** Expected numbers of passed / failed / skipped / flaky tests. `passed` and `failed` default to 0. */
  passed?: number;
  failed?: number;
  skipped?: number;
  flaky?: number;
  /** Patterns stdout (the reporters' output) / stderr must contain. */
  stdout?: OutputPattern[];
  stderr?: OutputPattern[];
}

export interface RunCaseOptions extends GenOptions {
  /** Run `playwright test` after a successful generation. Default: not run. */
  playwright?: PlaywrightOptions;
}

/** One test of Playwright's JSON report, flattened. */
export interface ReportedTest {
  /** Describe and test titles below the file, joined with ` > `. */
  title: string;
  /** The project name. */
  project: string;
  file: string;
  /** Status of the final attempt: passed, failed, timedOut, skipped, interrupted. */
  status: string;
  /** Error messages of the final attempt, without ANSI escapes. */
  errors: string[];
}

export interface PlaywrightRun extends CommandResult {
  stats: { passed: number; failed: number; skipped: number; flaky: number };
  tests: ReportedTest[];
}

export interface CaseRun {
  project: CaseProject;
  gen: CommandResult & { generated: string[] };
  playwright?: PlaywrightRun;
}

/**
 * Copies the case into a temp project, runs nimaime-gen and (optionally) `playwright test`, and
 * checks the results against `options`. Returns everything for further assertions.
 */
export async function runCase(caseDir: string, options: RunCaseOptions = {}): Promise<CaseRun> {
  const project = new CaseProject(caseDir);
  const gen = await project.gen(options);
  if (!options.playwright) return { project, gen };
  return { project, gen, playwright: project.playwright(options.playwright) };
}

/** A copy of a case directory in a temp directory, ready to run nimaime-gen and Playwright in. */
export class CaseProject {
  /** The temp project directory. */
  readonly dir: string;

  constructor(readonly caseDir: string) {
    const name = path.basename(caseDir);
    this.dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `nimaime-tool-${name}-`)));
    tempDirs.push(this.dir);
    if (process.env.NIMAIME_TOOL_KEEP === '1') console.log(`[${name}] ${this.dir}`);
    fs.cpSync(caseDir, this.dir, {
      recursive: true,
      filter: (source) => !CASE_ONLY.has(path.relative(caseDir, source).split(path.sep)[0] ?? ''),
    });
    if (!fs.existsSync(path.join(this.dir, 'package.json'))) {
      fs.writeFileSync(
        path.join(this.dir, 'package.json'),
        `${JSON.stringify({ name: `case-${name}`, private: true, type: packageType() }, null, 2)}\n`,
      );
    }
    // Without one, Playwright's loader would look further up; with no `paths`, `nimaime-han` is
    // resolved as a package (node_modules), like in a user project.
    if (!fs.existsSync(path.join(this.dir, 'tsconfig.json'))) {
      fs.writeFileSync(path.join(this.dir, 'tsconfig.json'), TSCONFIG);
    }
    linkNodeModules(this.dir);
  }

  /** Project files (relative, `/`-separated, sorted), outside node_modules and test results. */
  files(): string[] {
    return listFiles(this.dir);
  }

  read(file: string): string {
    return fs.readFileSync(path.join(this.dir, file), 'utf8');
  }

  /** Runs a Node.js script with cwd = the project. */
  node(args: string[], env: Record<string, string> = {}): CommandResult {
    const result = spawnSync(process.execPath, args, {
      cwd: this.dir,
      encoding: 'utf8',
      env: childEnv(env),
      timeout: 300_000,
    });
    if (result.error) throw result.error;
    return {
      exitCode: result.status,
      stdout: normalizeOutput(result.stdout, this.dir),
      stderr: normalizeOutput(result.stderr, this.dir),
    };
  }

  /** Runs the built nimaime-gen and checks the result against `options`. */
  async gen(options: GenOptions = {}): Promise<CommandResult & { generated: string[] }> {
    const cli = path.join(this.dir, 'node_modules', 'nimaime-han', 'dist', 'cli', 'nimaime-gen.js');
    if (!fs.existsSync(cli)) throw new Error(`${cli} not found: run "npm run build" first.`);
    const before = new Set(this.files());
    const result = this.node([cli, ...(options.args ?? [])]);
    const generated = this.files().filter((file) => !before.has(file));
    const context = describeCommand('nimaime-gen', options.args, result);

    expect(result.exitCode, context).toBe(options.exitCode ?? 0);
    expectOutput(result.stdout, options.stdout, `stdout of ${context}`);
    expectOutput(result.stderr, options.stderr, `stderr of ${context}`);
    if (options.stdoutExact !== undefined) expect(result.stdout, context).toBe(options.stdoutExact);
    if (options.generated) expect(generated, context).toEqual([...options.generated].sort());
    if (options.snapshot ?? true) {
      for (const file of generated) {
        await expect(this.read(file)).toMatchFileSnapshot(this.snapshotFile(file));
      }
    }
    return { ...result, generated };
  }

  /**
   * Snapshot file of a generated file: `__snapshots__/<path>.snap` in the case directory, with the
   * leading dot of path segments dropped (`.sanmaime-gen/` is git-ignored everywhere).
   */
  snapshotFile(file: string): string {
    const parts = file.split('/').map((part) => part.replace(/^\./, ''));
    return path.join(this.caseDir, '__snapshots__', ...parts) + '.snap';
  }

  /** Runs `playwright test` and checks the result against `options`. */
  playwright(options: PlaywrightOptions = {}): PlaywrightRun {
    const cli = path.join(this.dir, 'node_modules', '@playwright', 'test', 'cli.js');
    const reportFile = path.join(this.dir, 'test-results', '.tool-report.json');
    fs.rmSync(reportFile, { force: true });
    const reporters = options.reporters ?? ['nimaime-han/reporter'];
    const args = [
      'test',
      ...(reporters === 'config' ? [] : [`--reporter=${['json', ...reporters].join(',')}`]),
      ...(options.args ?? []),
    ];
    // PLAYWRIGHT_JSON_OUTPUT_FILE since Playwright 1.41 (it wins); _NAME before that.
    const result = this.node([cli, ...args], {
      PLAYWRIGHT_JSON_OUTPUT_FILE: reportFile,
      PLAYWRIGHT_JSON_OUTPUT_NAME: reportFile,
    });
    const context = describeCommand('playwright', args, result);
    if (!fs.existsSync(reportFile)) throw new Error(`No JSON report was written.\n${context}`);
    const report = summarizeJsonReport(JSON.parse(fs.readFileSync(reportFile, 'utf8')));
    const run: PlaywrightRun = { ...result, ...report };

    const failed = options.failed ?? 0;
    const expected: Record<string, number> = { passed: options.passed ?? 0, failed };
    if (options.skipped !== undefined) expected.skipped = options.skipped;
    if (options.flaky !== undefined) expected.flaky = options.flaky;
    const actual = Object.fromEntries(
      Object.keys(expected).map((key) => [key, run.stats[key as keyof PlaywrightRun['stats']]]),
    );
    expect(actual, `${context}\n${formatTests(run.tests)}`).toEqual(expected);
    expect(result.exitCode, context).toBe(options.exitCode ?? (failed > 0 ? 1 : 0));
    expectOutput(result.stdout, options.stdout, `stdout of ${context}`);
    expectOutput(result.stderr, options.stderr, `stderr of ${context}`);
    return run;
  }
}

function packageType(): 'module' | 'commonjs' {
  const type = process.env.NIMAIME_TOOL_PACKAGE_TYPE ?? 'module';
  if (type !== 'module' && type !== 'commonjs') {
    throw new Error(`NIMAIME_TOOL_PACKAGE_TYPE must be "module" or "commonjs", not "${type}".`);
  }
  return type;
}

/**
 * Gives the project a `node_modules` directory:
 * - by default, a directory of symlinks to every package of the repository's node_modules, plus
 *   `nimaime-han` -> the repository root (so its `exports` point at dist/). Node resolves symlinks
 *   to real paths, so nimaime-han and the project load the same `@playwright/test` (Playwright
 *   refuses to run with two copies of itself);
 * - with `NIMAIME_TOOL_NODE_MODULES`, a symlink to that directory, which must contain both
 *   `@playwright/test` and a (packed, not linked) `nimaime-han`.
 */
function linkNodeModules(dir: string): void {
  const target = path.join(dir, 'node_modules');
  const custom = process.env.NIMAIME_TOOL_NODE_MODULES;
  if (custom) {
    fs.symlinkSync(path.resolve(custom), target, 'junction');
    return;
  }
  const source = path.join(repoRoot, 'node_modules');
  fs.mkdirSync(target);
  for (const entry of fs.readdirSync(source)) {
    fs.symlinkSync(path.join(source, entry), path.join(target, entry), 'junction');
  }
  fs.symlinkSync(repoRoot, path.join(target, 'nimaime-han'), 'junction');
}

function listFiles(root: string, dir = root, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && NOT_LISTED.has(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(root, file, out);
    else out.push(path.relative(root, file).split(path.sep).join('/'));
  }
  return out.sort();
}

/** The environment of child processes: no colours, nothing inherited from vitest or nimaime. */
function childEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(VITEST|NIMAIME_|TEST_WORKER_INDEX|TEST_PARALLEL_INDEX)/.test(key)) continue;
    if (key === 'NODE_OPTIONS' || key === 'NO_COLOR') continue;
    env[key] = value;
  }
  return { ...env, FORCE_COLOR: '0', ...extra };
}

/**
 * Makes output comparable: `\r\n` -> `\n`, the temp project path -> `<project>`, and durations such
 * as `(3.4s)`, `(512ms)` or `(1.2m)` -> `(<duration>)`.
 */
export function normalizeOutput(text: string, projectDir?: string): string {
  let out = text.replace(/\r\n/g, '\n');
  if (projectDir) out = out.split(projectDir).join('<project>');
  return out.replace(/\((\d+(?:\.\d+)?(?:ms|s|m|h))\)/g, '(<duration>)');
}

function expectOutput(text: string, patterns: OutputPattern[] = [], context: string): void {
  for (const pattern of patterns) {
    if (typeof pattern === 'string') expect(text, context).toContain(pattern);
    else expect(text, context).toMatch(pattern);
  }
}

function describeCommand(name: string, args: string[] = [], result: CommandResult): string {
  return [
    `${name} ${args.join(' ')} exited with ${String(result.exitCode)}`,
    `--- stdout ---\n${result.stdout}`,
    `--- stderr ---\n${result.stderr}`,
  ].join('\n');
}

function formatTests(tests: ReportedTest[]): string {
  return tests.map((test) => `  ${test.status}: [${test.project}] ${test.title}`).join('\n');
}

interface JsonSuite {
  title: string;
  specs?: {
    title: string;
    file: string;
    tests: {
      projectName: string;
      status: string;
      results: { status: string; errors?: { message?: string }[] }[];
    }[];
  }[];
  suites?: JsonSuite[];
}

interface JsonReport {
  stats: { expected: number; unexpected: number; skipped: number; flaky: number };
  suites: JsonSuite[];
}

/** Reads the counts and the tests out of Playwright's JSON report. */
export function summarizeJsonReport(report: unknown): Pick<PlaywrightRun, 'stats' | 'tests'> {
  const { stats, suites } = report as JsonReport;
  const tests: ReportedTest[] = [];
  const visit = (suite: JsonSuite, titles: string[], isFile: boolean): void => {
    const path_ = isFile || !suite.title ? titles : [...titles, suite.title];
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        const last = test.results.at(-1);
        tests.push({
          title: [...path_, spec.title].join(' > '),
          project: test.projectName,
          file: spec.file,
          status: last?.status ?? 'skipped',
          errors: (last?.errors ?? []).map((error) => stripAnsi(error.message ?? '')),
        });
      }
    }
    for (const child of suite.suites ?? []) visit(child, path_, false);
  };
  // Top-level suites are files.
  for (const suite of suites) visit(suite, [], true);
  return {
    stats: {
      passed: stats.expected,
      failed: stats.unexpected,
      skipped: stats.skipped,
      flaky: stats.flaky,
    },
    tests,
  };
}

/** Removes ANSI escape sequences (Playwright colours some parts of error messages regardless). */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}
