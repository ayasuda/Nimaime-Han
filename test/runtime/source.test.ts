import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { captureSource, formatSource, parseFirstFrame, sameSource } from '../../src/runtime/source';

const thisFile = fileURLToPath(import.meta.url);

function callee() {
  return captureSource(callee);
}

describe('captureSource', () => {
  it('returns the call site of the given function (source-mapped)', () => {
    const first = callee();
    const second = callee();
    expect(first).toEqual({
      file: thisFile,
      line: expect.any(Number) as number,
      column: 19,
    });
    expect(second).toEqual({ file: thisFile, line: (first?.line ?? 0) + 1, column: 20 });
  });

  it('returns undefined when the function is not on the stack', () => {
    expect(captureSource(callee)).toBeUndefined();
  });
});

describe('parseFirstFrame', () => {
  it('parses named, anonymous and async frames and file:// URLs', () => {
    expect(parseFirstFrame('Error\n    at fn (/a/b.ts:3:7)\n    at /x.ts:1:1')).toEqual({
      file: '/a/b.ts',
      line: 3,
      column: 7,
    });
    expect(parseFirstFrame('Error\n    at /a/b.ts:3:7')).toEqual({
      file: '/a/b.ts',
      line: 3,
      column: 7,
    });
    expect(parseFirstFrame('Error\n    at async file:///a/b%20c.ts:10:2')).toEqual({
      file: '/a/b c.ts',
      line: 10,
      column: 2,
    });
  });

  it('skips node internals and unparsable frames', () => {
    expect(
      parseFirstFrame(
        'Error\n    at new Promise (<anonymous>)\n    at x (node:internal/mod:1:1)\n    at /u.ts:5:6',
      ),
    ).toEqual({ file: '/u.ts', line: 5, column: 6 });
    expect(parseFirstFrame('Error')).toBeUndefined();
    expect(parseFirstFrame(undefined)).toBeUndefined();
  });
});

describe('formatSource / sameSource', () => {
  const a = { file: '/a.ts', line: 1, column: 2 };
  it('formats a location', () => {
    expect(formatSource(a)).toBe('/a.ts:1:2');
    expect(formatSource(undefined)).toBe('<unknown location>');
  });
  it('compares locations', () => {
    expect(sameSource(a, { ...a })).toBe(true);
    expect(sameSource(a, { ...a, column: 3 })).toBe(false);
    expect(sameSource(undefined, undefined)).toBe(false);
  });
});
