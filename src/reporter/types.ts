/**
 * The parts of Playwright's reporter API that the Sanmaime reporter reads, typed structurally so
 * the reporter can be driven by hand-built objects in unit tests. Playwright's `Suite`, `TestCase`,
 * `TestResult`, `TestStep` and `TestError` are assignable to these.
 */

/** A source position (`TestCase.location`, `TestStep.location`). */
export interface ReportLocation {
  file: string;
  line: number;
  column: number;
}

/** A serialized error (`TestError`). */
export interface ReportError {
  message?: string;
  value?: string;
  stack?: string;
  location?: ReportLocation;
}

/** A step of a test (`TestStep`). */
export interface ReportStep {
  title: string;
  /** `test.step` for steps made by `test.step()`, which is what the Nimaime runtime creates. */
  category: string;
  location?: ReportLocation;
  error?: ReportError;
  steps: readonly ReportStep[];
}

/** The status of one run of a test (`TestResult.status`). */
export type ReportTestStatus = 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';

/** One run (attempt) of a test (`TestResult`). */
export interface ReportResult {
  status: ReportTestStatus;
  steps: readonly ReportStep[];
  errors: readonly ReportError[];
  retry: number;
}

/** A test (`TestCase`). */
export interface ReportTest {
  title: string;
  /** `['', project, file, ...describes, title]`. */
  titlePath(): string[];
  location: ReportLocation;
  /** One entry per attempt; the last one is the final result. Empty if the test never ran. */
  results: readonly ReportResult[];
  outcome(): 'skipped' | 'expected' | 'unexpected' | 'flaky';
}

/** The root suite passed to `onBegin` (`Suite`). */
export interface ReportSuite {
  allTests(): ReportTest[];
}

/** Where the reporter writes (default: `process.stdout`). */
export interface ReportOutput {
  write(chunk: string): unknown;
  isTTY?: boolean;
}

/** Options of `nimaime-han/reporter` (the second element of its `reporter` config entry). */
export interface NimaimeReporterOptions {
  /**
   * Colour the output with ANSI codes. Default: on when the output is a TTY and `NO_COLOR` is not
   * set (`FORCE_COLOR` forces it on, `FORCE_COLOR=0` off).
   */
  colors?: boolean;
  /** Print only what failed (failed screens, elements, blocks and expectations) and the summary. */
  quiet?: boolean;
  /**
   * Print one line per expectation (default `true`). With `false` only the Screen and Element
   * lines and the failed expectations are printed.
   */
  printSteps?: boolean;
  /**
   * Also print Playwright's error message under each failure (default `false`: combine the
   * reporter with `list`, `line` or `html`, which already print it).
   */
  printDetails?: boolean;
  /** Directory that file paths are shown relative to (default: `process.cwd()`). */
  cwd?: string;
  /** Where to write (default: `process.stdout`). Mainly for tests. */
  output?: ReportOutput;
}
