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
      document: {
        uri: undefined,
        language: 'en',
        languageDirective: undefined,
        status: 'approved',
        screens: [],
      },
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
      'And when: x', // E023 (no When: block to extend)
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
      'SANMAIME_E023@7:1',
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

  it('attaches tags to Screen:, Element: and When: (several lines and tags per line)', () => {
    const { document, diagnostics } = parse(
      lines(
        '@s1 @s2',
        '# comment',
        '@s3',
        'Screen: S',
        '  @e1',
        '  Element: E',
        '    Show: A',
        '',
        '    @c1   @c2',
        '',
        '    When: C1',
        '    Hide: X',
        '    When: C2',
        '    Show: B',
        '    @c3',
        '    When: C3',
        '    Enable',
      ),
    );
    expect(diagnostics).toEqual([]);
    const names = (tags: readonly { name: string }[]): string[] => tags.map((t) => t.name);
    const screen = document.screens[0];
    expect(names(screen?.tags ?? [])).toEqual(['@s1', '@s2', '@s3']);
    expect(screen?.tags[2]?.location).toEqual({ line: 3, column: 1 });
    const element = screen?.elements[0];
    expect(names(element?.tags ?? [])).toEqual(['@e1']);
    expect(element?.conditions.map((c) => names(c.tags))).toEqual([['@c1', '@c2'], [], ['@c3']]);
    expect(element?.conditions[0]?.tags[1]?.location).toEqual({ line: 9, column: 11 });
  });

  it('E018: tags between When: and its expectations; E005 discards the tags of When:', () => {
    expect(
      parse(lines('Screen: S', 'Element: E', 'When: C', '@t', 'Enable')).diagnostics.map((d) => [
        d.code,
        d.location.line,
        d.message,
      ]),
    ).toEqual([['SANMAIME_E018', 4, `Tags must be followed by 'Screen:', 'Element:' or 'When:'.`]]);
    // No E018: the tags were taken by the When: line (and discarded with it).
    expect(codes(lines('Screen: S', '@t', 'When: C', 'Enable'))).toEqual([
      'SANMAIME_E010@1:1',
      'SANMAIME_E005@3:1',
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

describe('parse: Background: and And when: (v0.2)', () => {
  it('collects the Background: conditions of a screen in order', () => {
    const { document, diagnostics } = parse(
      lines(
        'Screen: S',
        '  Background: Logged in',
        '  # comments and blank lines are fine',
        '',
        '  Background: Has items',
        '  Element: E',
        '    Show: A',
        'Screen: T',
        '  Element: F',
        '    Enable',
      ),
    );
    expect(diagnostics).toEqual([]);
    expect(document.screens[0]?.background).toEqual([
      { name: 'Logged in', location: { line: 2, column: 3 } },
      { name: 'Has items', location: { line: 5, column: 3 } },
    ]);
    expect(document.screens[1]?.background).toEqual([]);
  });

  it('composes the conditions of a block with And when:', () => {
    const { document, diagnostics } = parse(
      lines(
        'Screen: S',
        'Element: E',
        'When: A',
        '',
        'And when: B',
        'And when:C',
        'Show: X',
        'When: A',
        'Hide: X',
      ),
    );
    expect(diagnostics).toEqual([]);
    const [composed, single] = document.screens[0]?.elements[0]?.conditions ?? [];
    expect(composed).toMatchObject({
      name: 'A',
      title: 'A and B and C',
      location: { line: 3, column: 1 },
      conditions: [
        { name: 'A', keyword: 'When', location: { line: 3, column: 1 } },
        { name: 'B', keyword: 'AndWhen', location: { line: 5, column: 1 } },
        { name: 'C', keyword: 'AndWhen', location: { line: 6, column: 1 } },
      ],
    });
    // `When: A` alone is another block than `When: A` + `And when: B` + `And when: C`.
    expect(single).toMatchObject({ name: 'A', title: 'A', conditions: [{ name: 'A' }] });
  });

  it('keeps the order of the conditions in the title and in E013', () => {
    // `When: B` alone differs from `When: A` + `And when: B`.
    expect(
      codes(
        lines('Screen: S', 'Element: E', 'When: A', 'And when: B', 'Enable', 'When: B', 'Enable'),
      ),
    ).toEqual([]);
    expect(
      codes(
        lines(
          'Screen: S',
          'Element: E',
          'When: A',
          'And when: B',
          'Enable',
          'When: B',
          'And when: A',
          'Enable',
          'When: A',
          'And when: B',
          'Disable',
        ),
      ),
    ).toEqual(['SANMAIME_E013@9:1']);
  });

  it('E013 and E008 of a composed block use its title', () => {
    const { diagnostics } = parse(
      lines(
        'Screen: S',
        'Element: E',
        'When: A',
        'And when: B',
        'Show: X',
        'When: A',
        'And when: B',
      ),
    );
    expect(diagnostics.map((d) => [d.code, d.message])).toEqual([
      [
        'SANMAIME_E013',
        `Duplicate condition 'A and B' in element 'E' (first declared on line 3). Merge the two blocks.`,
      ],
      ['SANMAIME_E008', `Condition 'A and B' has no expectations.`],
    ]);
  });

  it('E021: an expectation under Background: (then skips to the next Element:)', () => {
    const { diagnostics, document } = parse(
      lines('Screen: S', 'Background: B', 'Show: X', 'And: Y', 'Element: E', 'Show: Z'),
    );
    expect(diagnostics.map((d) => [d.code, d.location.line, d.message])).toEqual([
      [
        'SANMAIME_E021',
        3,
        `'Show:' is not allowed under 'Background:': a background takes no expectations. Put expectations under an 'Element:'.`,
      ],
    ]);
    expect(document.screens[0]?.elements[0]?.unconditional).toHaveLength(1);
    // Without a Background:, the same line is still E006.
    expect(codes(lines('Screen: S', 'Enable', 'Element: E', 'Enable'))).toEqual([
      'SANMAIME_E006@2:1',
    ]);
  });

  it('E022: a condition established twice for one test', () => {
    const { diagnostics } = parse(
      lines(
        'Screen: S',
        'Background: L',
        'Background: L', // E022 (duplicate background)
        'Element: E',
        'When: L', // E022 (already a background)
        'Show: X',
        'When: A',
        'And when: L', // E022 (already a background)
        'And when: A', // E022 (already in the block)
        'Show: X',
      ),
    );
    expect(diagnostics.map((d) => [d.code, d.location.line, d.message])).toEqual([
      ['SANMAIME_E022', 3, `Duplicate background condition 'L' in screen 'S' (first on line 2).`],
      [
        'SANMAIME_E022',
        5,
        `Condition 'L' is already established by 'Background:' (line 2). Background conditions apply to every block of the screen.`,
      ],
      [
        'SANMAIME_E022',
        8,
        `Condition 'L' is already established by 'Background:' (line 2). Background conditions apply to every block of the screen.`,
      ],
      ['SANMAIME_E022', 9, `Condition 'A' is already part of this block (line 7).`],
    ]);
  });

  it('E023: And when: that does not directly follow When: or And when:', () => {
    expect(
      codes(
        lines(
          'And when: A', // E023: no screen
          'Screen: S',
          'And when: A', // E023: no element
          'Element: E',
          'And when: A', // E023: unconditional block
          'Show: X',
          'When: B',
          'Show: Y',
          'And when: C', // E023: after an expectation
          '@t',
          'And when: D', // E018 (tags) + E023
        ),
      ),
    ).toEqual([
      'SANMAIME_E023@1:1',
      'SANMAIME_E023@3:1',
      'SANMAIME_E023@5:1',
      'SANMAIME_E023@9:1',
      'SANMAIME_E018@10:1',
      'SANMAIME_E023@11:1',
    ]);
    const { diagnostics } = parse(lines('Screen: S', 'Element: E', 'And when: A', 'Enable'));
    expect(diagnostics[0]?.message).toBe(
      `'And when:' must directly follow 'When:' or 'And when:'.`,
    );
  });

  it('E025: Background: outside a screen or after an Element:', () => {
    const { diagnostics, document } = parse(
      lines(
        'Background: A',
        'Screen: S',
        'Element: E',
        'Enable',
        'Background: B',
        'Element: F',
        'Enable',
      ),
    );
    expect(diagnostics.map((d) => [d.code, d.location.line, d.message])).toEqual([
      [
        'SANMAIME_E025',
        1,
        `'Background:' must appear directly under a 'Screen:', before its first 'Element:'.`,
      ],
      [
        'SANMAIME_E025',
        5,
        `'Background:' must appear directly under a 'Screen:', before its first 'Element:'.`,
      ],
    ]);
    expect(document.screens[0]?.background).toEqual([]);
    expect(document.screens[0]?.elements).toHaveLength(2);
  });

  it('E002 for Background: and And when: without a name; E018 for tags before Background:', () => {
    expect(
      codes(
        lines('Screen: S', '@t', 'Background:', 'Element: E', 'When: A', 'And when:', 'Enable'),
      ),
    ).toEqual(['SANMAIME_E018@2:1', 'SANMAIME_E002@3:1', 'SANMAIME_E002@6:1']);
  });

  it('hints at And when: for wrong case and a missing colon', () => {
    const messages = parse(
      lines('Screen: S', 'Element: E', 'When: A', 'and when: B', 'And when B', 'Enable'),
    ).diagnostics.map((d) => d.message);
    expect(messages[0]).toMatch(/Did you mean 'And when:'\?$/);
    expect(messages[1]).toMatch(/Did you mean 'And when: B'\?$/);
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
