import { describe, expect, it } from 'vitest';
import { classifyLine, splitLines, tokenize } from '../../src/parser/tokens';
import { readFixture } from './fixtures';

describe('splitLines', () => {
  it('accepts LF, CRLF and lone CR, mixed', () => {
    expect(splitLines('a\nb\r\nc\rd')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps an empty last line after a final line break', () => {
    expect(splitLines('a\n')).toEqual(['a', '']);
    expect(splitLines('')).toEqual(['']);
  });

  it('drops a leading BOM only', () => {
    expect(splitLines('﻿Screen: A')).toEqual(['Screen: A']);
    expect(splitLines('a\n﻿b')).toEqual(['a', '﻿b']);
  });

  it('reads the BOM and CRLF fixtures byte-exact', () => {
    const bom = readFixture('valid', 'utf8-bom').source;
    expect(bom.startsWith('﻿')).toBe(true);
    expect(tokenize(bom)[0]).toMatchObject({ type: 'comment', location: { line: 1, column: 1 } });

    const crlf = readFixture('valid', 'crlf-line-endings').source;
    expect(crlf).toContain('\r\n');
    const lines = splitLines(crlf);
    expect(lines.every((l) => !l.includes('\r'))).toBe(true);
  });
});

describe('classifyLine', () => {
  it('classifies blank lines, including whitespace-only and full-width spaces', () => {
    expect(classifyLine('', 1).type).toBe('blank');
    expect(classifyLine(' \t　 ', 1).type).toBe('blank');
  });

  it('trims full-width spaces and reports the first non-whitespace column', () => {
    expect(classifyLine('　Enable　', 3)).toEqual({
      type: 'bare-keyword',
      keyword: 'Enable',
      hasArgument: false,
      location: { line: 3, column: 2 },
    });
    expect(classifyLine('\t\tShow: X', 1).location).toEqual({ line: 1, column: 3 });
  });

  it('classifies comments and detects the language directive shape', () => {
    expect(classifyLine('  # a comment', 1)).toEqual({
      type: 'comment',
      text: '# a comment',
      directive: undefined,
      location: { line: 1, column: 3 },
    });
    expect(classifyLine('# language: en', 1)).toMatchObject({ directive: 'en' });
    expect(classifyLine('#language:ja  ', 1)).toMatchObject({ directive: 'ja' });
    expect(classifyLine('#  language  :  ', 1)).toMatchObject({ directive: '' });
    expect(classifyLine('# languages: en', 1)).toMatchObject({ directive: undefined });
  });

  it('treats # inside a line as an ordinary character', () => {
    expect(classifyLine('Show: Order #1234', 1)).toMatchObject({
      type: 'name-keyword',
      keyword: 'Show',
      name: 'Order #1234',
    });
  });

  it('classifies name keywords with or without a space after the colon', () => {
    for (const keyword of ['Screen', 'Element', 'When', 'Show', 'Hide', 'And'] as const) {
      expect(classifyLine(`${keyword}: A  b`, 1)).toMatchObject({
        type: 'name-keyword',
        keyword,
        name: 'A  b',
      });
      expect(classifyLine(`${keyword}:A`, 1)).toMatchObject({ keyword, name: 'A' });
    }
  });

  it('only treats the first colon as special', () => {
    expect(classifyLine('Show: Time: 12:00', 1)).toMatchObject({ name: 'Time: 12:00' });
  });

  it('returns an empty name for a keyword without a name (E002)', () => {
    expect(classifyLine('When:   ', 1)).toMatchObject({ type: 'name-keyword', name: '' });
    expect(classifyLine('Show:　', 1)).toMatchObject({ type: 'name-keyword', name: '' });
  });

  it('classifies bare keywords and bare keywords with an argument (E003)', () => {
    expect(classifyLine('Disable', 1)).toMatchObject({ type: 'bare-keyword', hasArgument: false });
    for (const text of ['Enable:', 'Enable: X', 'Enable X', 'Disable\tX', 'Disable :']) {
      expect(classifyLine(text, 1)).toMatchObject({ type: 'bare-keyword', hasArgument: true });
    }
    expect(classifyLine('Enabled', 1).type).toBe('unknown');
    expect(classifyLine('enable', 1).type).toBe('unknown');
  });

  it('is case-sensitive and requires the colon', () => {
    expect(classifyLine('show: X', 1).type).toBe('unknown');
    expect(classifyLine('Show X', 1).type).toBe('unknown');
    expect(classifyLine('Show : X', 1).type).toBe('unknown');
    expect(classifyLine('Then: X', 1).type).toBe('unknown');
  });

  it('classifies Background: as reserved', () => {
    expect(classifyLine('  Background: logged in', 2)).toEqual({
      type: 'reserved',
      keyword: 'Background',
      location: { line: 2, column: 3 },
    });
    expect(classifyLine('Background', 1).type).toBe('unknown');
  });

  it('tokenises tag lines with per-tag columns in code points', () => {
    expect(classifyLine('  @smoke\t @a:b  @\u{1F389}x @y', 4)).toEqual({
      type: 'tags',
      location: { line: 4, column: 3 },
      tags: [
        { name: '@smoke', location: { line: 4, column: 3 } },
        { name: '@a:b', location: { line: 4, column: 11 } },
        { name: '@\u{1F389}x', location: { line: 4, column: 17 } },
        { name: '@y', location: { line: 4, column: 21 } },
      ],
    });
  });

  it('rejects malformed tag lines (E020)', () => {
    expect(classifyLine('@smoke regression', 1)).toMatchObject({
      type: 'invalid-tags',
      token: 'regression',
    });
    expect(classifyLine('@', 1)).toMatchObject({ type: 'invalid-tags', token: '@' });
    expect(classifyLine('@a@b', 1)).toMatchObject({ type: 'invalid-tags', token: '@a@b' });
    expect(classifyLine('@a#b', 1)).toMatchObject({ type: 'invalid-tags', token: '@a#b' });
  });
});

describe('tokenize', () => {
  it('numbers lines from 1 across mixed line breaks', () => {
    const tokens = tokenize('Screen: A\r\n\rElement: B\n  Show: C');
    expect(tokens.map((t) => [t.type, t.location.line, t.location.column])).toEqual([
      ['name-keyword', 1, 1],
      ['blank', 2, 1],
      ['name-keyword', 3, 1],
      ['name-keyword', 4, 3],
    ]);
  });
});
