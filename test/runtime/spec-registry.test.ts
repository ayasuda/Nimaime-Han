import { beforeEach, describe, expect, it } from 'vitest';
import { parse } from '../../src/parser';
import {
  findScreenSpec,
  listScreenSpecs,
  NimaimeDefinitionError,
  registerScreenSpec,
  resetScreenSpecs,
  screenSpecsFromDocument,
} from '../../src/runtime/index';

beforeEach(() => {
  resetScreenSpecs();
});

describe('registerScreenSpec', () => {
  it('registers and finds screens by trimmed name, in registration order', () => {
    registerScreenSpec({ screen: ' User Details ', elements: [] });
    registerScreenSpec({ screen: 'Login', file: '/app/login.sanmaime', elements: [] });
    expect(findScreenSpec('User Details')?.screen).toBe('User Details');
    expect(findScreenSpec(' Login')?.file).toBe('/app/login.sanmaime');
    expect(findScreenSpec('Nope')).toBeUndefined();
    expect(listScreenSpecs().map((s) => s.screen)).toEqual(['User Details', 'Login']);
  });

  it('replaces a screen registered again from the same file', () => {
    const file = '/app/a.sanmaime';
    registerScreenSpec({ screen: 'A', file, elements: [] });
    const element = { element: 'E', unconditional: [], conditions: [] };
    registerScreenSpec({ screen: 'A', file, elements: [element] });
    expect(findScreenSpec('A')?.elements).toEqual([element]);
    expect(listScreenSpecs()).toHaveLength(1);
  });

  it('rejects the same screen from another file', () => {
    registerScreenSpec({ screen: 'A', file: '/app/a.sanmaime', elements: [] });
    expect(() => {
      registerScreenSpec({ screen: 'A', file: '/app/b.sanmaime', elements: [] });
    }).toThrow(NimaimeDefinitionError);
    expect(() => {
      registerScreenSpec({ screen: 'A', elements: [] });
    }).toThrow(
      'Duplicate Sanmaime screen "A".\n' +
        '  First registered from /app/a.sanmaime\n' +
        '  Registered again from (no file)',
    );
  });

  it('rejects an empty screen name', () => {
    expect(() => {
      registerScreenSpec({ screen: ' ', elements: [] });
    }).toThrow('A screen spec needs a screen name.');
  });

  it('is shared through globalThis', () => {
    registerScreenSpec({ screen: 'Shared', elements: [] });
    const store = (globalThis as Record<symbol, unknown>)[Symbol.for('nimaime-han.specs')];
    expect(store).toBeInstanceOf(Map);
    expect((store as Map<string, unknown>).has('Shared')).toBe(true);
  });
});

describe('screenSpecsFromDocument', () => {
  it('converts screens, elements, blocks and expectations with their positions', () => {
    const source = [
      'Screen: Login',
      '  Element: Login Button',
      '    Disable',
      '    Hide: Error message',
      '    When: Input is invalid',
      '    Show: Spinner',
      '    And: Hint',
      '    Hide: Help',
      'Screen: Other',
      '  Element: X',
      '    Show: Y',
    ].join('\n');
    const { document, diagnostics } = parse(source);
    expect(diagnostics).toEqual([]);
    const specs = screenSpecsFromDocument(document, '/app/login.sanmaime');
    expect(specs.map((s) => s.screen)).toEqual(['Login', 'Other']);
    expect(specs[0]).toEqual({
      screen: 'Login',
      file: '/app/login.sanmaime',
      location: { line: 1, column: 1 },
      elements: [
        {
          element: 'Login Button',
          location: { line: 2, column: 3 },
          unconditional: [
            { kind: 'disable', location: { line: 3, column: 5 } },
            { kind: 'hide', target: 'Error message', location: { line: 4, column: 5 } },
          ],
          conditions: [
            {
              name: 'Input is invalid',
              location: { line: 5, column: 5 },
              expectations: [
                { kind: 'show', target: 'Spinner', location: { line: 6, column: 5 } },
                { kind: 'show', target: 'Hint', location: { line: 7, column: 5 } },
                { kind: 'hide', target: 'Help', location: { line: 8, column: 5 } },
              ],
            },
          ],
        },
      ],
    });
  });

  it('keeps the targets and values of the vocabulary v1 (v0.3)', () => {
    const { document } = parse(
      'Screen: S\n  Element: E\n    Text: Title = "Hi"\n    Count: Items = 2\n    Check\n    Check: Box\n',
    );
    const [spec] = screenSpecsFromDocument(document);
    expect(spec?.elements[0]?.unconditional).toEqual([
      { kind: 'text', target: 'Title', value: 'Hi', location: { line: 3, column: 5 } },
      { kind: 'count', target: 'Items', value: 2, location: { line: 4, column: 5 } },
      { kind: 'check', location: { line: 5, column: 5 } },
      { kind: 'check', target: 'Box', location: { line: 6, column: 5 } },
    ]);
  });

  it('leaves out file when not given', () => {
    const { document } = parse('Screen: A\n  Element: B\n    Show: C\n');
    expect(screenSpecsFromDocument(document)[0]).not.toHaveProperty('file');
  });
});
