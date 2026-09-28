/**
 * Renders a `RunReport` as the ✓/✗ tree shown in the README:
 *
 * ```text
 * ✓ Screen: Login
 *   Background: Logged out
 *
 *   ✓ Element: Login Form
 *     ✓ Email address is shown
 *
 *   ✗ Element: Login Button
 *     When: Input is invalid
 *       ✗ disabled
 *         Expected: disabled
 *         Actual: enabled
 *         Location: specs/login.sanmaime:14
 *
 * 1 screen, 2 elements, 2 expectations: 1 passed, 1 failed, 0 skipped (1.2s)
 * ```
 */
import { stripAnsi } from './header';
import {
  countReport,
  type BlockReport,
  type ElementReport,
  type FailureDetails,
  type OtherTestReport,
  type RunReport,
  type ScreenReport,
  type Status,
} from './model';

export interface RenderOptions {
  colors: boolean;
  quiet: boolean;
  printSteps: boolean;
  printDetails: boolean;
  /** Run duration in milliseconds, for the summary. */
  duration?: number;
  /** Overall run status; `timedout` / `interrupted` are mentioned in the summary. */
  runStatus?: string;
  /** Errors outside tests (`onError`). */
  globalErrors?: readonly FailureDetails[];
}

type Paint = (text: string) => string;

interface Palette {
  green: Paint;
  red: Paint;
  yellow: Paint;
  dim: Paint;
  bold: Paint;
}

const ansi =
  (open: number, close: number): Paint =>
  (text) =>
    `\u001b[${String(open)}m${text}\u001b[${String(close)}m`;

function palette(colors: boolean): Palette {
  if (!colors) {
    const plain: Paint = (text) => text;
    return { green: plain, red: plain, yellow: plain, dim: plain, bold: plain };
  }
  return {
    green: ansi(32, 39),
    red: ansi(31, 39),
    yellow: ansi(33, 39),
    dim: ansi(2, 22),
    bold: ansi(1, 22),
  };
}

export const MARKS: Record<Status, string> = { passed: '✓', failed: '✗', skipped: '○' };

/** `850ms`, `1.2s`, `2.5m`. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${String(Math.round(ms))}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? '' : 's'}`;
}

class Writer {
  readonly lines: string[] = [];
  constructor(
    readonly p: Palette,
    readonly options: RenderOptions,
  ) {}

  mark(status: Status): string {
    const mark = MARKS[status];
    if (status === 'passed') return this.p.green(mark);
    if (status === 'failed') return this.p.red(mark);
    return this.p.yellow(mark);
  }

  line(indent: number, text: string): void {
    this.lines.push(`${' '.repeat(indent)}${text}`);
  }

  blank(): void {
    if (this.lines.length > 0 && this.lines.at(-1) !== '') this.lines.push('');
  }

  /** The message body, indented; ANSI codes are kept only with colours on. */
  body(indent: number, body: string): void {
    const text = this.options.colors ? body : stripAnsi(body);
    for (const line of text.trimEnd().split('\n')) {
      if (line.trim() === '') this.lines.push('');
      else this.line(indent, this.p.dim(line));
    }
  }

  /** Detail lines under a failure. `whenShown`: the block's `When:` line is already printed. */
  failure(indent: number, details: FailureDetails, whenShown: boolean): void {
    const { header } = details;
    const field = (key: string, value: string | undefined, paint: Paint = (t) => t): void => {
      if (value !== undefined) this.line(indent, `${this.p.dim(`${key}:`)} ${paint(value)}`);
    };
    if (header) {
      if (!whenShown) field('When', header.when);
      field('Expected', header.expected);
      field('Actual', header.actual ?? 'unknown', this.p.red);
    } else {
      const first = stripAnsi(details.body)
        .split('\n')
        .find((l) => l.trim() !== '');
      field('Error', first?.trim() ?? 'Unknown error', this.p.red);
    }
    field('Location', details.location);
    if (this.options.printDetails && (header ? details.body.trim() !== '' : true)) {
      this.body(indent + 2, details.body);
    }
  }
}

function showBlock(block: BlockReport, options: RenderOptions): boolean {
  if (options.quiet) return block.status === 'failed';
  return true;
}

function renderBlock(w: Writer, block: BlockReport, printedBefore: boolean): void {
  const { options, p } = w;
  const conditional = block.condition !== undefined;
  const indent = conditional ? 6 : 4;
  if (printedBefore) w.blank();
  if (block.status === 'skipped') {
    w.line(
      4,
      `${w.mark('skipped')} ${p.dim(conditional ? `When: ${block.condition ?? ''}` : block.title)}`,
    );
    return;
  }
  if (conditional) w.line(4, `When: ${block.condition ?? ''}`);
  for (const expectation of block.expectations) {
    if (expectation.status === 'passed' && (options.quiet || !options.printSteps)) continue;
    w.line(indent, `${w.mark(expectation.status)} ${expectation.text}`);
    if (expectation.failure) w.failure(indent + 2, expectation.failure, conditional);
  }
  if (block.error) {
    w.line(indent, `${w.mark('failed')} ${block.error.title}`);
    w.failure(indent + 2, block.error.details, conditional);
  }
}

function renderElement(w: Writer, element: ElementReport): void {
  const blocks = element.blocks.filter((b) => showBlock(b, w.options));
  w.blank();
  w.line(2, `${w.mark(element.status)} Element: ${element.name}`);
  let printed = false;
  for (const block of blocks) {
    const before = w.lines.length;
    renderBlock(w, block, printed);
    printed ||= w.lines.length > before;
  }
}

function renderScreen(w: Writer, screen: ScreenReport): void {
  const { options, p } = w;
  const elements = options.quiet
    ? screen.elements.filter((e) => e.status === 'failed')
    : screen.elements;
  w.blank();
  const project = screen.project === undefined ? '' : p.dim(` [${screen.project}]`);
  w.line(0, `${w.mark(screen.status)} ${p.bold(`Screen: ${screen.name}`)}${project}`);
  for (const name of screen.background) w.line(2, p.dim(`Background: ${name}`));
  for (const element of elements) renderElement(w, element);
}

function renderOthers(w: Writer, others: readonly OtherTestReport[]): void {
  const shown = w.options.quiet ? others.filter((o) => o.status === 'failed') : others;
  if (shown.length === 0) return;
  w.blank();
  w.line(0, w.p.bold('Other tests'));
  for (const other of shown) {
    w.line(2, `${w.mark(other.status)} ${other.title}`);
    if (other.error) w.failure(4, other.error, true);
  }
}

/** The summary line(s). */
export function renderSummary(report: RunReport, options: RenderOptions): string[] {
  const p = palette(options.colors);
  const c = countReport(report);
  const total = c.passed + c.failed + c.skipped;
  const counts = (passed: number, failed: number, skipped: number): string =>
    [
      p.green(`${String(passed)} passed`),
      failed > 0 ? p.red(`${String(failed)} failed`) : `${String(failed)} failed`,
      skipped > 0 ? p.yellow(`${String(skipped)} skipped`) : `${String(skipped)} skipped`,
    ].join(', ');
  const extra = [
    options.duration === undefined ? undefined : formatDuration(options.duration),
    options.runStatus === 'timedout' || options.runStatus === 'interrupted'
      ? options.runStatus
      : undefined,
  ].filter((part) => part !== undefined);
  const suffix = extra.length > 0 ? ` (${extra.join(', ')})` : '';
  const lines = [
    `${plural(c.screens, 'screen')}, ${plural(c.elements, 'element')}, ` +
      `${plural(total, 'expectation')}: ${counts(c.passed, c.failed, c.skipped)}${suffix}`,
  ];
  const others = c.others.passed + c.others.failed + c.others.skipped;
  if (others > 0) {
    lines.push(
      `${plural(others, 'other test')}: ${counts(c.others.passed, c.others.failed, c.others.skipped)}`,
    );
  }
  return lines;
}

/** Renders the whole report; the result ends with a newline. */
export function renderReport(report: RunReport, options: RenderOptions): string {
  const w = new Writer(palette(options.colors), options);
  const screens = options.quiet
    ? report.screens.filter((s) => s.status === 'failed')
    : report.screens;
  for (const screen of screens) renderScreen(w, screen);
  renderOthers(w, report.others);
  const globalErrors = options.globalErrors ?? [];
  if (globalErrors.length > 0) {
    w.blank();
    w.line(0, w.p.bold('Errors'));
    for (const error of globalErrors) {
      w.line(2, `${w.mark('failed')} ${stripAnsi(error.body).split('\n')[0] ?? ''}`);
      if (error.location !== undefined) w.line(4, `${w.p.dim('Location:')} ${error.location}`);
      if (options.printDetails) w.body(4, error.body);
    }
  }
  w.blank();
  w.lines.push(...renderSummary(report, options));
  return `${w.lines.join('\n')}\n`;
}
