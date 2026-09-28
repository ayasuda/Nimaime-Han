/**
 * Rebuilds the Sanmaime structure (Screen > Element > block > expectation) of a test run from
 * Playwright's test titles and steps. Pure: no output, no Playwright runtime.
 *
 * - Tests: `test.describe('Screen: X') > test.describe('Element: Y') > test('When: C' | other)`.
 *   A test title that does not start with `When: ` is the element's unconditional block.
 * - Steps (category `test.step`, made by the runtime): `Screen: X`, `When: C`, `Show: T`,
 *   `Hide: T`, `Enable`, `Disable`.
 */
import { isAbsolute, relative } from 'node:path';
import { parseSanmaimeHeader, type SanmaimeHeader } from './header';
import type { ReportError, ReportLocation, ReportStep, ReportSuite, ReportTest } from './types';

export type Status = 'passed' | 'failed' | 'skipped';

/** Details of a failure, for display. */
export interface FailureDetails {
  /** The Sanmaime header of the error, if it has one. */
  header: SanmaimeHeader | undefined;
  /** The error message without the header (Playwright's own message). */
  body: string;
  /** `file:line` of the failure (the header's `Location:`, else the step / error location). */
  location: string | undefined;
}

/** One `Show:` / `Hide:` / `Enable` / `Disable` that ran. */
export interface ExpectationReport {
  /** `Email address is shown`, `Error message is hidden`, `enabled`, `disabled`. */
  text: string;
  status: 'passed' | 'failed';
  failure?: FailureDetails;
}

/** One test: an element's unconditional block or one of its `When:` blocks. */
export interface BlockReport {
  /** The test title. */
  title: string;
  /** The `When:` name; `undefined` for the unconditional block. */
  condition: string | undefined;
  status: Status;
  /** The expectations that ran, in order (none after the first failure). */
  expectations: ExpectationReport[];
  /** A failure that is not an expectation (opening the screen, the condition, a timeout, …). */
  error?: { title: string; details: FailureDetails };
}

export interface ElementReport {
  name: string;
  status: Status;
  blocks: BlockReport[];
}

export interface ScreenReport {
  name: string;
  /** Playwright project; only set when the run has several projects. */
  project: string | undefined;
  status: Status;
  elements: ElementReport[];
}

/** A test that is not shaped like a generated Nimaime test. */
export interface OtherTestReport {
  /** `file › describe › title` (with `[project] ` in front when there are several projects). */
  title: string;
  status: Status;
  error?: FailureDetails;
}

export interface RunReport {
  screens: ScreenReport[];
  others: OtherTestReport[];
}

const SCREEN_PREFIX = 'Screen: ';
const ELEMENT_PREFIX = 'Element: ';
const WHEN_PREFIX = 'When: ';

type ParsedStep =
  | { type: 'expectation'; text: string; step: ReportStep }
  | { type: 'screen' | 'condition'; name: string; step: ReportStep };

/** Interprets a runtime step title; `undefined` for other steps. */
export function parseStepTitle(
  title: string,
):
  | { type: 'expectation'; text: string }
  | { type: 'screen' | 'condition'; name: string }
  | undefined {
  if (title === 'Enable') return { type: 'expectation', text: 'enabled' };
  if (title === 'Disable') return { type: 'expectation', text: 'disabled' };
  if (title.startsWith('Show: '))
    return { type: 'expectation', text: `${title.slice(6)} is shown` };
  if (title.startsWith('Hide: '))
    return { type: 'expectation', text: `${title.slice(6)} is hidden` };
  if (title.startsWith(SCREEN_PREFIX)) return { type: 'screen', name: title.slice(8) };
  if (title.startsWith(WHEN_PREFIX)) return { type: 'condition', name: title.slice(6) };
  return undefined;
}

/** The runtime's steps of a result, depth first (steps nested in user steps are found too). */
function runtimeSteps(steps: readonly ReportStep[]): ParsedStep[] {
  const found: ParsedStep[] = [];
  for (const step of steps) {
    const parsed = step.category === 'test.step' ? parseStepTitle(step.title) : undefined;
    if (parsed) found.push({ ...parsed, step });
    else found.push(...runtimeSteps(step.steps));
  }
  return found;
}

/** Shows `file` relative to `cwd` when it is inside it. */
export function displayPath(file: string, cwd: string): string {
  if (!isAbsolute(file)) return file;
  const rel = relative(cwd, file);
  return rel === '' || rel.startsWith('..') || isAbsolute(rel) ? file : rel;
}

function formatLocation(location: ReportLocation | undefined, cwd: string): string | undefined {
  return location && `${displayPath(location.file, cwd)}:${String(location.line)}`;
}

function failureDetails(
  error: ReportError | undefined,
  fallbackLocation: ReportLocation | undefined,
  cwd: string,
): FailureDetails {
  const message = error?.message ?? error?.value ?? 'Unknown error';
  const parsed = parseSanmaimeHeader(message);
  const { header } = parsed;
  return {
    header,
    body: parsed.body,
    location:
      parsed.header?.location ??
      formatLocation(fallbackLocation, cwd) ??
      formatLocation(error?.location, cwd),
  };
}

/** The status of a test from its final result (retries: the last attempt counts). */
function testStatus(test: ReportTest): Status {
  const last = test.results.at(-1);
  if (last === undefined || last.status === 'skipped' || last.status === 'interrupted') {
    return 'skipped';
  }
  return test.outcome() === 'unexpected' ? 'failed' : 'passed';
}

function combine(statuses: Status[]): Status {
  if (statuses.includes('failed')) return 'failed';
  if (statuses.length > 0 && statuses.every((s) => s === 'skipped')) return 'skipped';
  return 'passed';
}

function buildBlock(test: ReportTest, blockTitle: string, cwd: string): BlockReport {
  const status = testStatus(test);
  const result = test.results.at(-1);
  const steps = runtimeSteps(result?.steps ?? []);
  const conditionStep = steps.find((s) => s.type === 'condition');
  const condition =
    conditionStep?.type === 'condition'
      ? conditionStep.name
      : blockTitle.startsWith(WHEN_PREFIX)
        ? blockTitle.slice(WHEN_PREFIX.length)
        : undefined;
  const block: BlockReport = { title: blockTitle, condition, status, expectations: [] };
  if (status === 'skipped') return block;

  for (const parsed of steps) {
    if (parsed.type !== 'expectation') continue;
    const { step } = parsed;
    if (step.error === undefined) {
      block.expectations.push({ text: parsed.text, status: 'passed' });
      continue;
    }
    block.expectations.push({
      text: parsed.text,
      status: 'failed',
      failure: failureDetails(step.error, step.location, cwd),
    });
    break;
  }

  const expectationFailed = block.expectations.some((e) => e.status === 'failed');
  if (status === 'failed' && !expectationFailed) {
    const failedStep = steps.find((s) => s.type !== 'expectation' && s.step.error !== undefined);
    const error = failedStep?.step.error ?? result?.errors[0];
    block.error = {
      title: failedStep ? failedStep.step.title : errorTitle(result?.status),
      details: failureDetails(error, failedStep?.step.location, cwd),
    };
  }
  return block;
}

function errorTitle(status: string | undefined): string {
  return status === 'timedOut' ? 'Timed out' : 'Failed';
}

interface Entry {
  test: ReportTest;
  project: string;
  projectIndex: number;
}

/** Order: project, then spec file, then source position of the test. */
function sortEntries(entries: Entry[]): Entry[] {
  return entries.sort(
    (a, b) =>
      a.projectIndex - b.projectIndex ||
      (a.test.location.file < b.test.location.file
        ? -1
        : a.test.location.file > b.test.location.file
          ? 1
          : 0) ||
      a.test.location.line - b.test.location.line ||
      a.test.location.column - b.test.location.column,
  );
}

/** Builds the report of a run. `cwd` is what file paths are shown relative to. */
export function buildReport(tests: readonly ReportTest[], cwd: string): RunReport {
  const projects: string[] = [];
  const entries: Entry[] = tests.map((test) => {
    const project = test.titlePath()[1] ?? '';
    let projectIndex = projects.indexOf(project);
    if (projectIndex === -1) projectIndex = projects.push(project) - 1;
    return { test, project, projectIndex };
  });
  const multiProject = projects.length > 1;

  const screens = new Map<string, ScreenReport & { byElement: Map<string, ElementReport> }>();
  const others: OtherTestReport[] = [];

  for (const { test, project } of sortEntries(entries)) {
    const path = test.titlePath();
    const describes = path.slice(3, -1);
    const screenIndex = describes.findIndex((t) => t.startsWith(SCREEN_PREFIX));
    const element = describes
      .slice(screenIndex + 1)
      .find((t) => t.startsWith(ELEMENT_PREFIX))
      ?.slice(ELEMENT_PREFIX.length);
    const screenTitle = describes[screenIndex];

    if (screenIndex === -1 || screenTitle === undefined || element === undefined) {
      const status = testStatus(test);
      const title = path
        .slice(2)
        .filter((t) => t !== '')
        .join(' › ');
      const last = test.results.at(-1);
      others.push({
        title: multiProject ? `[${project}] ${title}` : title,
        status,
        ...(status === 'failed' ? { error: failureDetails(last?.errors[0], undefined, cwd) } : {}),
      });
      continue;
    }

    const screenName = screenTitle.slice(SCREEN_PREFIX.length);
    const key = `${project}\u0000${screenName}`;
    let screen = screens.get(key);
    if (!screen) {
      screen = {
        name: screenName,
        project: multiProject ? project : undefined,
        status: 'passed',
        elements: [],
        byElement: new Map(),
      };
      screens.set(key, screen);
    }
    let elementReport = screen.byElement.get(element);
    if (!elementReport) {
      elementReport = { name: element, status: 'passed', blocks: [] };
      screen.byElement.set(element, elementReport);
      screen.elements.push(elementReport);
    }
    elementReport.blocks.push(buildBlock(test, test.title, cwd));
  }

  const screenReports: ScreenReport[] = [];
  for (const { byElement: _byElement, ...screen } of screens.values()) {
    for (const element of screen.elements) {
      element.status = combine(element.blocks.map((b) => b.status));
    }
    screen.status = combine(screen.elements.map((e) => e.status));
    screenReports.push(screen);
  }
  return { screens: screenReports, others };
}

/** Builds the report of the tests of a root suite. */
export function buildSuiteReport(suite: ReportSuite, cwd: string): RunReport {
  return buildReport(suite.allTests(), cwd);
}

/** Counts for the summary line. */
export interface ReportCounts {
  screens: number;
  elements: number;
  passed: number;
  failed: number;
  skipped: number;
  others: { passed: number; failed: number; skipped: number };
}

/**
 * Counts expectations: each expectation that ran is passed or failed; a failed block whose failure
 * is not an expectation (screen, condition, timeout) counts as one failed; a skipped block counts
 * as one skipped (its expectations never ran, so their number is unknown).
 */
export function countReport(report: RunReport): ReportCounts {
  const counts: ReportCounts = {
    screens: report.screens.length,
    elements: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    others: { passed: 0, failed: 0, skipped: 0 },
  };
  for (const screen of report.screens) {
    counts.elements += screen.elements.length;
    for (const element of screen.elements) {
      for (const block of element.blocks) {
        if (block.status === 'skipped') counts.skipped++;
        if (block.error) counts.failed++;
        for (const e of block.expectations) counts[e.status]++;
      }
    }
  }
  for (const other of report.others) counts.others[other.status]++;
  return counts;
}
