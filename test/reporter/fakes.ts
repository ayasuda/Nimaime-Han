// Hand-built stand-ins for Playwright's Suite / TestCase / TestResult / TestStep (only the fields
// the reporter reads).
import type {
  ReportError,
  ReportLocation,
  ReportResult,
  ReportStep,
  ReportSuite,
  ReportTest,
  ReportTestStatus,
} from '../../src/reporter/index';

export const CWD = '/work';

export function step(
  title: string,
  options: { error?: ReportError; line?: number; category?: string; steps?: ReportStep[] } = {},
): ReportStep {
  return {
    title,
    category: options.category ?? 'test.step',
    location:
      options.line === undefined
        ? undefined
        : { file: `${CWD}/specs/login.sanmaime`, line: options.line, column: 5 },
    error: options.error,
    steps: options.steps ?? [],
  };
}

/** The message the runtime gives a failed expectation (see formatExpectationFailure). */
export function sanmaimeError(fields: {
  screen?: string;
  element?: string;
  when?: string;
  expected: string;
  actual: string;
  location?: string;
  named?: boolean;
}): ReportError {
  const lines = [
    fields.screen !== undefined && `Screen: ${fields.screen}`,
    `Element: ${fields.element ?? 'E'}`,
    fields.when !== undefined && `When: ${fields.when}`,
    `Expected: ${fields.expected}`,
    `Actual: ${fields.actual}`,
    fields.location !== undefined && `Location: ${fields.location}`,
  ].filter((line) => line !== false);
  const details = "Details:\n  expect(locator).toBeVisible() failed\n\n  Locator: getByTestId('x')";
  const message = `${lines.join('\n')}\n\n${details}`;
  return { message: fields.named === false ? message : `NimaimeExpectationError: ${message}` };
}

export interface FakeTestOptions {
  /** Describe titles and the test title. */
  path: string[];
  file?: string;
  line?: number;
  project?: string;
  status?: ReportTestStatus;
  steps?: ReportStep[];
  errors?: ReportError[];
  /** Earlier attempts (retries), before the final one. */
  previous?: ReportResult[];
  outcome?: ReturnType<ReportTest['outcome']>;
  /** The test never ran (no results). */
  notRun?: boolean;
}

export function fakeTest(options: FakeTestOptions): ReportTest {
  const file = options.file ?? 'login.spec.ts';
  const status = options.status ?? 'passed';
  const result: ReportResult = {
    status,
    steps: options.steps ?? [],
    errors: options.errors ?? [],
    retry: options.previous?.length ?? 0,
  };
  const results = options.notRun ? [] : [...(options.previous ?? []), result];
  const outcome =
    options.outcome ??
    (status === 'skipped' || options.notRun
      ? 'skipped'
      : status === 'passed'
        ? options.previous?.length
          ? 'flaky'
          : 'expected'
        : 'unexpected');
  const location: ReportLocation = {
    file: `${CWD}/gen/${file}`,
    line: options.line ?? 1,
    column: 5,
  };
  return {
    title: options.path.at(-1) ?? '',
    titlePath: () => ['', options.project ?? 'chromium', file, ...options.path],
    location,
    results,
    outcome: () => outcome,
  };
}

export function fakeSuite(tests: ReportTest[]): ReportSuite {
  return { allTests: () => tests };
}

/** An output that collects what is written. */
export function fakeOutput(isTTY = false): {
  write(chunk: string): void;
  isTTY: boolean;
  text: string;
} {
  return {
    isTTY,
    text: '',
    write(chunk: string) {
      this.text += chunk;
    },
  };
}
