import { fileURLToPath } from 'node:url';

/** Where a definition was written: the call site of `defineScreen` / `defineElement` / `defineCondition`. */
export interface SourceLocation {
  /** Absolute file path (a `file://` URL in the stack is converted to a path). */
  file: string;
  /** 1-based line. */
  line: number;
  /** 1-based column. */
  column: number;
}

// `    at fn (/abs/file.ts:1:2)`, `    at /abs/file.ts:1:2`, `    at async file:///abs/file.ts:1:2`
const FRAME_RE = /^\s*at (?:async )?(?:.*? \()?(.+?):(\d+):(\d+)\)?\s*$/;

/**
 * Captures the source location of whoever called `callee` (like playwright-bdd does for step
 * definitions). The string stack is parsed instead of V8 call sites so that source maps installed
 * by Playwright's TS loader or vitest are honoured. Returns `undefined` when no frame can be parsed.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export function captureSource(callee: Function): SourceLocation | undefined {
  const holder: { stack?: string } = {};
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = Math.max(limit, 10);
  try {
    Error.captureStackTrace(holder, callee);
  } finally {
    Error.stackTraceLimit = limit;
  }
  return parseFirstFrame(holder.stack);
}

/** Parses the first stack frame that carries a `file:line:column` position. Exported for tests. */
export function parseFirstFrame(stack: string | undefined): SourceLocation | undefined {
  if (!stack) return undefined;
  for (const text of stack.split('\n')) {
    const match = FRAME_RE.exec(text);
    if (!match) continue;
    const [, rawFile = '', line = '0', column = '0'] = match;
    if (rawFile.startsWith('node:') || rawFile === '<anonymous>') continue;
    return { file: toPath(rawFile), line: Number(line), column: Number(column) };
  }
  return undefined;
}

function toPath(file: string): string {
  if (!file.startsWith('file://')) return file;
  try {
    return fileURLToPath(file);
  } catch {
    return file;
  }
}

/** `file:line:column`, or `<unknown location>`. */
export function formatSource(source: SourceLocation | undefined): string {
  return source
    ? `${source.file}:${String(source.line)}:${String(source.column)}`
    : '<unknown location>';
}

/** Whether two captured locations denote the same call site. */
export function sameSource(a: SourceLocation | undefined, b: SourceLocation | undefined): boolean {
  if (!a || !b) return false;
  return a.file === b.file && a.line === b.line && a.column === b.column;
}
