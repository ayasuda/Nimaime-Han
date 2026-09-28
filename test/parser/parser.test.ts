import { describe, expect, it } from 'vitest';
import { type Diagnostic, DiagnosticCode, formatDiagnostic, parse } from '../../src/parser';

/** Compact `code@line:col` form of the diagnostics of `source`. */
function codes(source: string): string[] {
  return parse(source).diagnostics.map(
    (d) => `${d.code}@${String(d.location.line)}:${String(d.location.column)}`,
  );
}

const lines = (...ls: string[]): string => ls.join('\n');

describe('parse: structure', () => {
  it('returns an empty document for an empty source', () => {
    expect(parse('')).toEqual({
      document: { uri: undefined, language: 'en', languageDirective: undefined, screens: [] },
      diagnostics: [],
    });
  });

  it('keeps the unconditional block and the When: blocks of an element', () => {
    const { document, diagnostics } = parse(
      lines(
        'Screen: S',
        'Element: E',
        'Show: A',
        'Enable',
        'When: C1',
        'Hide: B',
        'When: C2',
        'Show: B',
      ),
    );
    expect(diagnostics).toEqual([]);
    const element = document.screens[0]?.elements[0];
    expect(element?.unconditional.map((x) => x.kind)).toEqual(['show', 'enable']);
    expect(element?.conditions.map((c) => [c.name, c.expectations.map((x) => x.kind)])).toEqual([
      ['C1', ['hide']],
      ['C2', ['show']],
    ]);
  });

  it('normalises And: to the kind of its group across blank and comment lines', () => {
    const { document } = parse(
      lines('Screen: S', 'Element: E', 'Hide: A', '', '# comment', 'And: B', 'Show: C', 'And: D'),
    );
    expect(document.screens[0]?.elements[0]?.unconditional).toEqual([
      {
        kind: 'hide',
        target: 'A',
        keyword: 'Hide',
        viaAnd: false,
        location: { line: 3, column: 1 },
      },
      { kind: 'hide', target: 'B', keyword: 'And', viaAnd: true, location: { line: 6, column: 1 } },
      {
        kind: 'show',
        target: 'C',
        keyword: 'Show',
        viaAnd: false,
        location: { line: 7, column: 1 },
      },
      { kind: 'show', target: 'D', keyword: 'And', viaAnd: true, location: { line: 8, column: 1 } },
    ]);
  });

  it('allows the same condition name in several elements of a screen', () => {
    expect(
      codes(
        lines('Screen: S', 'Element: A', 'When: C', 'Enable', 'Element: B', 'When: C', 'Show: X'),
      ),
    ).toEqual([]);
  });

  it('allows the same target in different blocks when there is no unconditional assertion', () => {
    expect(
      codes(lines('Screen: S', 'Element: E', 'When: C1', 'Show: X', 'When: C2', 'Hide: X')),
    ).toEqual([]);
  });

  it('records the header language directive', () => {
    const { document, diagnostics } = parse(
      lines('# title', '', '# language: en', 'Screen: S', 'Element: E', 'Enable'),
      { uri: 'a.sanmaime' },
    );
    expect(diagnostics).toEqual([]);
    expect(document.uri).toBe('a.sanmaime');
    expect(document.language).toBe('en');
    expect(document.languageDirective).toEqual({ value: 'en', location: { line: 3, column: 1 } });
  });

  it('treats a language directive after the header as a comment', () => {
    const { document, diagnostics } = parse(
      lines('Screen: S', '# language: xx', 'Element: E', 'Enable'),
    );
    expect(diagnostics).toEqual([]);
    expect(document.languageDirective).toBeUndefined();
  });

  it('ends the header at the first significant line, even an erroneous one', () => {
    expect(codes(lines('Oops', '# language: xx', 'Screen: S', 'Element: E', 'Enable'))).toEqual([
      'SANMAIME_E001@1:1',
    ]);
  });
});

describe('parse: diagnostics', () => {
  it('never throws and collects several errors in source order', () => {
    const source = lines(
      '# language: fr', // E017
      '@smoke extra', // E020
      'Element: Orphan', // E004 (skips to the next Screen:)
      'Show: skipped',
      'Screen: S', // E010 (no element)
      'Screen: T',
      'Background: x', // E019
      'Element: E',
      'Show: A',
      'Show: A', // E014
      'Enable',
      'Disable', // E015
      'And: B', // E007
      'Hide:', // E002
      'When: C',
      'Show: A', // E016
      'Enable', // E016
      'When: C', // E013 + E008
      'Element: E', // E012 + E009
      'show: X', // E001
      '@dangling', // E018 (end of file)
    );
    expect(() => parse(source)).not.toThrow();
    expect(codes(source)).toEqual([
      'SANMAIME_E017@1:1',
      'SANMAIME_E020@2:1',
      'SANMAIME_E004@3:1',
      'SANMAIME_E010@5:1',
      'SANMAIME_E019@7:1',
      'SANMAIME_E014@10:1',
      'SANMAIME_E015@12:1',
      'SANMAIME_E007@13:1',
      'SANMAIME_E002@14:1',
      'SANMAIME_E016@16:1',
      'SANMAIME_E016@17:1',
      'SANMAIME_E013@18:1',
      'SANMAIME_E008@18:1',
      'SANMAIME_E012@19:1',
      'SANMAIME_E009@19:1',
      'SANMAIME_E001@20:1',
      'SANMAIME_E018@21:1',
    ]);
  });

  it('keeps offending constructs in the best-effort document', () => {
    const { document } = parse(
      lines('Screen: S', 'Element: E', 'When: C', 'Show: A', 'When: C', 'Hide: A', 'Screen: S'),
    );
    expect(document.screens.map((s) => s.name)).toEqual(['S', 'S']);
    expect(document.screens[0]?.elements[0]?.conditions.map((c) => c.name)).toEqual(['C', 'C']);
  });

  it('E002: keeps the keyword with an empty name', () => {
    const { document, diagnostics } = parse(lines('Screen:', 'Element: E', 'Enable'));
    expect(diagnostics.map((d) => d.message)).toEqual([`'Screen:' requires a name.`]);
    expect(document.screens[0]?.name).toBe('');
  });

  it('E003: treats the line as the bare keyword', () => {
    const { document, diagnostics } = parse(lines('Screen: S', 'Element: E', 'Enable: now'));
    expect(diagnostics.map((d) => d.code)).toEqual([DiagnosticCode.BareKeywordWithArgument]);
    expect(document.screens[0]?.elements[0]?.unconditional).toEqual([
      { kind: 'enable', keyword: 'Enable', location: { line: 3, column: 1 } },
    ]);
  });

  it('E005/E006: skip lines up to the next Element:, Screen: or tag line', () => {
    expect(
      codes(lines('When: C', 'Show: A', 'When: D', 'Screen: S', 'Element: E', 'Enable')),
    ).toEqual(['SANMAIME_E005@1:1']);
    expect(codes(lines('Screen: S', 'Show: A', 'When: D', 'Element: E', 'Enable'))).toEqual([
      'SANMAIME_E006@2:1',
    ]);
    // A tag line ends the skipped region; the tags then need a Screen:/Element:.
    expect(codes(lines('Screen: S', 'Show: A', '@t', 'Show: B', 'Element: E', 'Enable'))).toEqual([
      'SANMAIME_E006@2:1',
      'SANMAIME_E018@3:1',
      'SANMAIME_E006@4:1',
    ]);
  });

  it('E004: skips lines up to the next Screen: or tag line', () => {
    expect(
      codes(lines('Element: A', 'When: C', 'Element: B', 'Screen: S', 'Element: E', 'Enable')),
    ).toEqual(['SANMAIME_E004@1:1']);
    expect(
      codes(lines('Element: A', '@t', 'Element: B', 'Screen: S', 'Element: E', 'Enable')),
    ).toEqual(['SANMAIME_E004@1:1', 'SANMAIME_E004@3:1']);
  });

  it('E007: And: after When:, after Enable/Disable, or across blocks', () => {
    expect(codes(lines('Screen: S', 'Element: E', 'And: A', 'Show: B'))).toEqual([
      'SANMAIME_E007@3:1',
    ]);
    expect(codes(lines('Screen: S', 'Element: E', 'Show: A', 'Disable', 'And: B'))).toEqual([
      'SANMAIME_E007@5:1',
    ]);
    expect(
      codes(lines('Screen: S', 'Element: E', 'Show: A', 'When: C', 'And: B', 'Show: D')),
    ).toEqual(['SANMAIME_E007@5:1']);
    expect(
      codes(lines('Screen: S', 'Element: A', 'Show: X', 'Element: B', 'And: Y', 'Show: Z')),
    ).toEqual(['SANMAIME_E007@5:1']);
  });

  it('E008: a When: block whose only line was rejected is empty', () => {
    expect(codes(lines('Screen: S', 'Element: E', 'When: C', 'And: X'))).toEqual([
      'SANMAIME_E008@3:1',
      'SANMAIME_E007@4:1',
    ]);
  });

  it('E009/E010 at end of file', () => {
    expect(codes(lines('Screen: S', 'Element: E'))).toEqual(['SANMAIME_E009@2:1']);
    expect(codes(lines('Screen: S'))).toEqual(['SANMAIME_E010@1:1']);
  });

  it('E016: state re-asserted or contradicted in a condition block', () => {
    const { diagnostics } = parse(
      lines('Screen: S', 'Element: E', 'Enable', 'When: C', 'Disable', 'When: D', 'Enable'),
    );
    expect(diagnostics.map((d) => [d.code, d.location.line])).toEqual([
      ['SANMAIME_E016', 5],
      ['SANMAIME_E016', 7],
    ]);
    expect(diagnostics[0]?.message).toContain(`'Enable'`);
  });

  it('E014 takes precedence over E016 for a repeated target', () => {
    expect(
      codes(lines('Screen: S', 'Element: E', 'Show: A', 'When: C', 'Hide: A', 'And: A')),
    ).toEqual(['SANMAIME_E016@5:1', 'SANMAIME_E014@6:1']);
  });

  it('E017: empty value and duplicate directive', () => {
    const empty = parse(lines('# language:', 'Screen: S', 'Element: E', 'Enable'));
    expect(empty.diagnostics.map((d) => d.code)).toEqual(['SANMAIME_E017']);
    expect(empty.document.language).toBe('en');
    expect(empty.document.languageDirective?.value).toBe('');

    const dup = parse(
      lines('# language: en', '  # language: en', 'Screen: S', 'Element: E', 'Enable'),
    );
    expect(dup.diagnostics.map((d) => [d.code, d.location, d.message])).toEqual([
      ['SANMAIME_E017', { line: 2, column: 3 }, 'Duplicate language directive (first on line 1).'],
    ]);
  });

  it('E018: tags before a non-header keyword are discarded; E001 lines are transparent', () => {
    const { document, diagnostics } = parse(
      lines(
        '@a',
        'Screen: S',
        'Element: E',
        '@b',
        '',
        '@c',
        'Enable',
        '@d',
        'free text',
        'Element: F',
        'Enable',
      ),
    );
    expect(diagnostics.map((d) => `${d.code}@${String(d.location.line)}`)).toEqual([
      'SANMAIME_E018@4',
      'SANMAIME_E001@9',
    ]);
    expect(document.screens[0]?.tags.map((t) => t.name)).toEqual(['@a']);
    expect(document.screens[0]?.elements.map((e) => e.tags.map((t) => t.name))).toEqual([
      [],
      ['@d'],
    ]);
  });

  it('E020: discards the tags of the malformed line only', () => {
    const { document, diagnostics } = parse(
      lines('@ok', '@bad tag', 'Screen: S', 'Element: E', 'Enable'),
    );
    expect(diagnostics.map((d) => d.message)).toEqual([
      `Invalid tag 'tag'. A tag is '@' followed by characters other than whitespace, '@' and '#'.`,
    ]);
    expect(document.screens[0]?.tags.map((t) => t.name)).toEqual(['@ok']);
  });

  it('E001: hints for wrong case and missing colon', () => {
    const messages = parse(
      lines(
        'Screen: S',
        'Element: E',
        'Enable',
        'show: A',
        'Show B',
        'Show : C',
        'disable',
        'Hello',
      ),
    ).diagnostics.map((d) => d.message);
    expect(messages[0]).toMatch(/^Unrecognised line 'show: A'\. .* Did you mean 'Show:'\?$/);
    expect(messages[1]).toMatch(/Did you mean 'Show: B'\?$/);
    expect(messages[2]).toMatch(/Did you mean 'Show: C'\?$/);
    expect(messages[3]).toMatch(/Did you mean 'Disable'\?$/);
    expect(messages[4]).toMatch(/or tags \(@\)\.$/);
  });

  it('uses the spec message texts', () => {
    const { diagnostics } = parse(
      lines('Screen: S', 'Element: E', 'Show: A', 'Element: E', 'Hide: A', 'Hide: A'),
    );
    expect(diagnostics.map((d) => d.message)).toEqual([
      `Duplicate element 'E' in screen 'S' (first declared on line 2).`,
      `'A' is already asserted in this block (line 5).`,
    ]);
  });
});

describe('formatDiagnostic', () => {
  const diagnostic: Diagnostic = {
    code: DiagnosticCode.DanglingAnd,
    severity: 'error',
    message: `'And:' must follow 'Show:', 'Hide:' or 'And:' in the same block.`,
    location: { line: 7, column: 5 },
  };

  it('renders the problem-matcher format of §7.1', () => {
    expect(formatDiagnostic(diagnostic, 'specs/login.sanmaime')).toBe(
      `specs/login.sanmaime:7:5: error SANMAIME_E007: 'And:' must follow 'Show:', 'Hide:' or 'And:' in the same block.`,
    );
    expect(formatDiagnostic(diagnostic)).toMatch(/^7:5: error SANMAIME_E007: /);
  });
});
