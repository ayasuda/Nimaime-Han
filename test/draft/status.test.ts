/** Rewriting the `# status:` directive byte for byte (src/draft/status.ts). */
import { describe, expect, it } from 'vitest';
import { setStatusDirective, statusDirectiveLine } from '../../src/draft';
import { parse } from '../../src/parser';

const BODY = 'Screen: S\n  Element: E\n    Show: A\n';

describe('setStatusDirective', () => {
  it('inserts the directive as the first line when there is none', () => {
    expect(setStatusDirective(BODY, 'draft')).toBe(`# status: draft\n${BODY}`);
    expect(setStatusDirective('', 'draft')).toBe('# status: draft\n');
    // The first line break of the file is reused.
    expect(setStatusDirective('Screen: S\r\nElement: E\r\nEnable', 'draft')).toBe(
      '# status: draft\r\nScreen: S\r\nElement: E\r\nEnable',
    );
  });

  it('keeps a byte order mark in front', () => {
    const text = setStatusDirective(`\uFEFF${BODY}`, 'draft');
    expect(text).toBe(`\uFEFF# status: draft\n${BODY}`);
    expect(parse(text).document.status).toBe('draft');
  });

  it('rewrites an existing directive in place, keeping its spacing', () => {
    const source = `# language: en\r\n  #  status :  draft  \r\n\r\n${BODY.replaceAll('\n', '\r\n')}`;
    const text = setStatusDirective(source, 'approved');
    expect(text).toBe(source.replace('draft', 'approved'));
    expect(setStatusDirective('#status:draft\nScreen: S', 'approved')).toBe(
      '#status: approved\nScreen: S',
    );
    // Also an invalid value (E024) is rewritten.
    expect(setStatusDirective('# status: drat\n' + BODY, 'approved')).toBe(
      '# status: approved\n' + BODY,
    );
  });

  it('is a no-op when the directive already says so', () => {
    const source = `# status: draft\n${BODY}`;
    expect(setStatusDirective(source, 'draft')).toBe(source);
  });

  it('removes the directive line with undefined', () => {
    expect(setStatusDirective(`# status: draft\n# title\n${BODY}`, undefined)).toBe(
      `# title\n${BODY}`,
    );
    expect(setStatusDirective(`\uFEFF# status: draft\r\n${BODY}`, undefined)).toBe(`\uFEFF${BODY}`);
    expect(setStatusDirective(`# a\r# status: draft\r${BODY}`, undefined)).toBe(`# a\r${BODY}`);
    expect(setStatusDirective(BODY, undefined)).toBe(BODY);
  });

  it('only touches the header directive, not a comment after the header', () => {
    const source = `${BODY}# status: draft\n`;
    expect(statusDirectiveLine(source)).toBeUndefined();
    expect(setStatusDirective(source, 'draft')).toBe(`# status: draft\n${source}`);
  });
});
