/**
 * Definition snippets for missing definitions (the counterpart of the step snippets that
 * playwright-bdd's `bddgen` prints for undefined steps). See docs/cli.md, "Missing definitions".
 *
 * The output is TypeScript to paste into a definition file: one `defineElement()` per element that
 * is not defined at all (with every target the specs use, and a `self` locator when they use
 * `Enable` / `Disable`), the lines to add to an existing `defineElement()` for missing targets, one
 * global `defineCondition()` per missing condition and — only when asked, since a screen without
 * `defineScreen` is allowed — one `defineScreen()` per screen without a definition. Locators are
 * `page.getByTestId('TODO')` placeholders.
 *
 * Code that is meant to be pasted as is (not the lines for existing definitions) is laid out the
 * way Prettier formats it with the repository's options, like the generated spec files.
 */
import type { QuoteStyle } from '../config/types';
import { quote, textWidth } from './generate';
import type { MissingDefinition, ResolvedDocument, ResolvedExpectation } from './match';

export interface SnippetOptions {
  /** Quote style of string literals (`config.quotes`). */
  quotes: QuoteStyle;
  /**
   * The resolved documents (`matchSpecs().documents`). Used to list the targets of an element that
   * is not defined at all, and whether it needs a `self` locator; without them, a snippet for such
   * an element has a TODO comment instead of targets.
   */
  documents?: readonly ResolvedDocument[] | undefined;
  /** Also emit `defineScreen()` for screens without a definition (severity `info`). Default: `false`. */
  includeScreens?: boolean | undefined;
}

const PRINT_WIDTH = 100;
const INDENT = '  ';
/** An identifier (Unicode letters included, e.g. Japanese): Prettier leaves such keys unquoted. */
const IDENTIFIER = /^[\p{ID_Start}$_][\p{ID_Continue}$\u200C\u200D]*$/u;

/** A missing element, or the missing parts of an existing one. */
interface ElementGroup {
  name: string;
  /** Whether a `defineElement()` for it exists (only targets / `self` are missing). */
  defined: boolean;
  targets: string[];
  self: boolean;
}

function isVisibility(
  expectation: ResolvedExpectation,
): expectation is Extract<ResolvedExpectation, { kind: 'show' | 'hide' }> {
  return expectation.kind === 'show' || expectation.kind === 'hide';
}

/** The targets and `Enable` / `Disable` use of an undefined element, in order of first use. */
function usageOf(
  element: string,
  documents: readonly ResolvedDocument[],
): { targets: string[]; self: boolean } {
  const targets = new Set<string>();
  let self = false;
  for (const doc of documents) {
    for (const screen of doc.screens) {
      for (const resolved of screen.elements) {
        if (resolved.name !== element || resolved.definition !== undefined) continue;
        const expectations = [
          ...resolved.unconditional,
          ...resolved.conditions.flatMap((condition) => condition.expectations),
        ];
        for (const expectation of expectations) {
          if (isVisibility(expectation)) targets.add(expectation.target);
          else self = true;
        }
      }
    }
  }
  return { targets: [...targets], self };
}

class SnippetWriter {
  constructor(private readonly quotes: QuoteStyle) {}

  q(value: string): string {
    return quote(value, this.quotes);
  }

  /** `({ page }) => page.getByTestId('TODO')` */
  locator(): string {
    return `({ page }) => page.getByTestId(${this.q('TODO')})`;
  }

  /** An object key: bare when it is an identifier, else a string literal. */
  key(name: string): string {
    return IDENTIFIER.test(name) ? name : this.q(name);
  }

  /** `  key: ({ page }) => page.getByTestId('TODO'),`, broken as Prettier does when too long. */
  targetLines(name: string): string[] {
    const flat = `${INDENT}${this.key(name)}: ${this.locator()},`;
    if (textWidth(flat) <= PRINT_WIDTH) return [flat];
    const head = `${INDENT}${this.key(name)}: ({ page }) =>`;
    if (textWidth(head) <= PRINT_WIDTH) {
      return [head, `${INDENT}${INDENT}page.getByTestId(${this.q('TODO')}),`];
    }
    // Prettier breaks the destructured parameter when even the head does not fit.
    return [
      `${INDENT}${this.key(name)}: ({`,
      `${INDENT}${INDENT}page,`,
      `${INDENT}}) => page.getByTestId(${this.q('TODO')}),`,
    ];
  }

  element(group: ElementGroup): string[] {
    const name = this.q(group.name);
    if (group.defined) {
      const lines: string[] = [];
      if (group.self) {
        lines.push(
          `// The existing defineElement(${name}, …) has no locator for the element itself,`,
          '// which Enable / Disable need. Pass it as the second argument, before the targets:',
          `// defineElement(${name}, ${this.locator()}, { … });`,
        );
      }
      if (group.targets.length > 0) {
        lines.push(`// Add to the existing defineElement(${name}, { … }):`);
        for (const target of group.targets) lines.push(...this.targetLines(target));
      }
      return lines;
    }
    const self = group.self ? `${this.locator()}, ` : '';
    if (group.self && group.targets.length === 0) {
      return [`defineElement(${name}, ${this.locator()});`];
    }
    const lines = [`defineElement(${name}, ${self}{`];
    if (group.targets.length === 0) lines.push(`${INDENT}// TODO: the targets the specs use`);
    for (const target of group.targets) lines.push(...this.targetLines(target));
    lines.push('});');
    return lines;
  }

  condition(name: string, screens: readonly string[]): string[] {
    const lines: string[] = [];
    if (screens.length === 1) {
      const screen = screens[0] ?? '';
      lines.push(
        `// Used on Screen "${screen}" (add { screen: ${this.q(screen)} } to define it for that screen only).`,
      );
    } else if (screens.length > 1) {
      lines.push(`// Used on Screens ${screens.map((s) => `"${s}"`).join(', ')}.`);
    }
    lines.push(`defineCondition(${this.q(name)}, async ({ page }) => {`);
    lines.push(`${INDENT}// TODO: bring the screen into this state`);
    lines.push('});');
    return lines;
  }

  screen(name: string): string[] {
    return [
      `defineScreen(${this.q(name)}, {`,
      `${INDENT}open: async ({ page }) => {`,
      `${INDENT}${INDENT}await page.goto(${this.q('/TODO')});`,
      `${INDENT}},`,
      '});',
    ];
  }
}

/**
 * TypeScript snippets that define everything in `missing` (see the module comment), preceded by a
 * commented-out hint of how to get the `defineXxx` functions. Each element target, `self` locator,
 * condition and screen appears once, however often it is reported. Returns `''` when there is
 * nothing to define.
 */
export function generateSnippets(
  missing: readonly MissingDefinition[],
  options: SnippetOptions,
): string {
  const w = new SnippetWriter(options.quotes);
  const screens: string[] = [];
  const elements = new Map<string, ElementGroup>();
  const conditions = new Map<string, string[]>();

  const group = (name: string, defined: boolean): ElementGroup => {
    let entry = elements.get(name);
    if (!entry) {
      entry = { name, defined, targets: [], self: false };
      elements.set(name, entry);
    }
    return entry;
  };

  for (const entry of missing) {
    switch (entry.kind) {
      case 'screen':
        if (options.includeScreens === true && !screens.includes(entry.name)) {
          screens.push(entry.name);
        }
        break;
      case 'element': {
        const g = group(entry.name, false);
        if (options.documents) {
          const usage = usageOf(entry.name, options.documents);
          g.targets = usage.targets;
          g.self = usage.self;
        }
        break;
      }
      case 'target': {
        const g = group(entry.element ?? '', true);
        if (!g.targets.includes(entry.name)) g.targets.push(entry.name);
        break;
      }
      case 'self':
        group(entry.name, true).self = true;
        break;
      case 'condition': {
        const used = conditions.get(entry.name) ?? [];
        if (!used.includes(entry.screen)) used.push(entry.screen);
        conditions.set(entry.name, used);
        break;
      }
    }
  }

  const blocks: string[][] = [
    ...screens.map((name) => w.screen(name)),
    ...[...elements.values()].map((g) => w.element(g)),
    ...[...conditions].map(([name, used]) => w.condition(name, used)),
  ].filter((block) => block.length > 0);
  if (blocks.length === 0) return '';

  const functions = [
    screens.length > 0 ? 'defineScreen' : undefined,
    elements.size > 0 ? 'defineElement' : undefined,
    conditions.size > 0 ? 'defineCondition' : undefined,
  ].filter((name) => name !== undefined);
  const header = [
    `// import { createNimaime } from ${w.q('nimaime-han')};`,
    `// const { ${functions.join(', ')} } = createNimaime(test);`,
  ];
  return `${[header, ...blocks].map((block) => block.join('\n')).join('\n\n')}\n`;
}
