/**
 * nimaime-han/reporter — a Playwright reporter that prints Sanmaime results as a ✓/✗ tree
 * (Screen > Element > When > expectation), the counterpart of playwright-bdd's Cucumber reporter.
 *
 * ```ts
 * // playwright.config.ts
 * reporter: [['list'], ['nimaime-han/reporter', { quiet: false }]],
 * ```
 *
 * Results are buffered and printed in `onEnd`, grouped by Screen > Element > block and ordered by
 * spec file and source line, so the output does not depend on the number of workers.
 */
import type { FullResult, Reporter } from '@playwright/test/reporter';
import { buildReport, displayPath, type FailureDetails } from './model';
import { parseSanmaimeHeader } from './header';
import { renderReport } from './render';
import type {
  NimaimeReporterOptions,
  ReportError,
  ReportOutput,
  ReportSuite,
  ReportTest,
} from './types';

export type {
  NimaimeReporterOptions,
  ReportError,
  ReportLocation,
  ReportOutput,
  ReportResult,
  ReportStep,
  ReportSuite,
  ReportTest,
  ReportTestStatus,
} from './types';
export { buildReport, countReport } from './model';
export type {
  BlockReport,
  ElementReport,
  ExpectationReport,
  FailureDetails,
  OtherTestReport,
  ReportCounts,
  RunReport,
  ScreenReport,
  Status,
} from './model';
export { renderReport, renderSummary, formatDuration } from './render';
export { parseSanmaimeHeader, type SanmaimeHeader } from './header';

/** Whether to colour the output when the `colors` option is not given. */
export function defaultColors(
  output: ReportOutput,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const force = env.FORCE_COLOR;
  if (force !== undefined && force !== '') return force !== '0' && force !== 'false';
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false;
  return output.isTTY === true;
}

/** The Sanmaime reporter. Default export, as Playwright requires for custom reporters. */
export default class NimaimeReporter implements Reporter {
  private readonly options: NimaimeReporterOptions;
  private readonly output: ReportOutput;
  private readonly cwd: string;
  private suite: ReportSuite | undefined;
  private readonly tests = new Set<ReportTest>();
  private readonly globalErrors: FailureDetails[] = [];

  constructor(options: NimaimeReporterOptions = {}) {
    this.options = options;
    this.output = options.output ?? process.stdout;
    this.cwd = options.cwd ?? process.cwd();
  }

  printsToStdio(): boolean {
    return this.output === process.stdout;
  }

  onBegin(_config: unknown, suite: ReportSuite): void {
    this.suite = suite;
  }

  onTestEnd(test: ReportTest): void {
    this.tests.add(test);
  }

  onError(error: ReportError): void {
    const message = error.message ?? error.value ?? 'Unknown error';
    this.globalErrors.push({
      header: undefined,
      body: parseSanmaimeHeader(message).body,
      location:
        error.location &&
        `${displayPath(error.location.file, this.cwd)}:${String(error.location.line)}`,
    });
  }

  onEnd(result: Pick<FullResult, 'status' | 'duration'>): void {
    // Every test of the run (tests that never ran are shown as skipped); without onBegin, the
    // tests seen in onTestEnd.
    const tests = this.suite ? this.suite.allTests() : [...this.tests];
    const report = buildReport(tests, this.cwd);
    this.output.write(
      `\n${renderReport(report, {
        colors: this.options.colors ?? defaultColors(this.output),
        quiet: this.options.quiet ?? false,
        printSteps: this.options.printSteps ?? true,
        printDetails: this.options.printDetails ?? false,
        duration: result.duration,
        runStatus: result.status,
        globalErrors: this.globalErrors,
      })}`,
    );
  }
}
