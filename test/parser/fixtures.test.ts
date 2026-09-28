import { describe, expect, it } from 'vitest';
import { parse } from '../../src/parser';
import { listFixtures, readExpectation } from './fixtures';

describe('valid fixtures', () => {
  const fixtures = listFixtures('valid');

  it('exist', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it.each(fixtures.map((f) => [f.name, f] as const))('%s parses without diagnostics', (_, f) => {
    const { document, diagnostics } = parse(f.source, { uri: f.uri });
    expect(diagnostics).toEqual([]);
    expect(document.uri).toBe(f.uri);
    expect(document.language).toBe('en');
  });
});

describe('invalid fixtures', () => {
  const fixtures = listFixtures('invalid');

  it('exist', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it.each(fixtures.map((f) => [f.name, f] as const))(
    '%s reports exactly the declared diagnostic',
    (_, f) => {
      const expected = readExpectation(f.source);
      expect(f.name.startsWith(expected.code.slice('SANMAIME_'.length).toLowerCase())).toBe(true);
      const { diagnostics } = parse(f.source, { uri: f.uri });
      expect(
        diagnostics.map((d) => ({
          code: d.code,
          line: d.location.line,
          column: d.location.column,
        })),
      ).toEqual([expected]);
      expect(diagnostics[0]?.severity).toBe('error');
      expect(diagnostics[0]?.message).not.toBe('');
    },
  );

  it('cover every diagnostic code E001..E020', () => {
    const codes = new Set(fixtures.map((f) => readExpectation(f.source).code));
    for (let n = 1; n <= 20; n++) {
      expect(codes).toContain(`SANMAIME_E${String(n).padStart(3, '0')}`);
    }
  });
});
