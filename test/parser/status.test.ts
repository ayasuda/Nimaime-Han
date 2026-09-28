/**
 * The `# status:` header directive (docs/sanmaime.md §3.4, docs/review-workflow.md) and E024.
 */
import { describe, expect, it } from 'vitest';
import { DiagnosticCode, parse, SPEC_STATUSES } from '../../src/parser';

const lines = (...ls: string[]): string => ls.join('\n');
const BODY = ['Screen: S', 'Element: E', 'Show: A'];

describe('# status: directive', () => {
  it('defaults to approved without a directive', () => {
    const { document, diagnostics } = parse(lines(...BODY));
    expect(diagnostics).toEqual([]);
    expect(document.status).toBe('approved');
    expect(document.statusDirective).toBeUndefined();
  });

  it.each(SPEC_STATUSES)('records "%s"', (status) => {
    const { document, diagnostics } = parse(lines(`# status: ${status}`, ...BODY));
    expect(diagnostics).toEqual([]);
    expect(document.status).toBe(status);
    expect(document.statusDirective).toEqual({ value: status, location: { line: 1, column: 1 } });
  });

  it('is order independent with # language: and other comments, and tolerates spacing', () => {
    const { document, diagnostics } = parse(
      lines(
        '# language: ja',
        '# A title',
        '',
        '  #status :draft  ',
        '画面: S',
        '要素: E',
        '表示: A',
      ),
    );
    expect(diagnostics).toEqual([]);
    expect(document.language).toBe('ja');
    expect(document.status).toBe('draft');
    expect(document.statusDirective).toEqual({ value: 'draft', location: { line: 4, column: 3 } });
  });

  it('is an ordinary comment after the header', () => {
    const { document, diagnostics } = parse(
      lines('Screen: S', '# status: draft', 'Element: E', 'Enable'),
    );
    expect(diagnostics).toEqual([]);
    expect(document.status).toBe('approved');
    expect(document.statusDirective).toBeUndefined();
  });

  it('accepts CRLF line breaks and a byte order mark', () => {
    const { document, diagnostics } = parse(`\uFEFF# status: draft\r\n${BODY.join('\r\n')}\r\n`);
    expect(diagnostics).toEqual([]);
    expect(document.status).toBe('draft');
  });

  it('E024: unknown, empty or wrong-case value keeps the default (approved)', () => {
    for (const value of ['reviewed', '', 'Draft']) {
      const { document, diagnostics } = parse(lines(`# status: ${value}`, ...BODY));
      expect(diagnostics.map((d) => [d.code, d.location, d.message])).toEqual([
        [
          DiagnosticCode.InvalidStatus,
          { line: 1, column: 1 },
          `Unknown status '${value}'. Use 'draft' or 'approved'.`,
        ],
      ]);
      expect(document.status).toBe('approved');
      expect(document.statusDirective?.value).toBe(value);
    }
  });

  it('E024: a second directive is an error and the first one stays in effect', () => {
    const { document, diagnostics } = parse(
      lines('# status: draft', '# language: en', '# status: approved', ...BODY),
    );
    expect(diagnostics.map((d) => [d.code, d.location, d.message])).toEqual([
      ['SANMAIME_E024', { line: 3, column: 1 }, 'Duplicate status directive (first on line 1).'],
    ]);
    expect(document.status).toBe('draft');
    expect(document.statusDirective?.location.line).toBe(1);
  });

  it('does not affect the language directive and vice versa', () => {
    const { document, diagnostics } = parse(lines('# status: draft', '# language: xx', ...BODY));
    expect(diagnostics.map((d) => d.code)).toEqual(['SANMAIME_E017']);
    expect(document.status).toBe('draft');
  });
});
