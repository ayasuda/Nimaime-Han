/**
 * The definitions draft of `nimaime draft --definitions`: TypeScript with one `defineScreen()` and
 * one `defineElement()` per proposed element, binding the proposed names to locators.
 *
 * Laid out the way Prettier formats it with the repository's options (print width 100, trailing
 * commas), like the files `nimaime-gen` writes, so that the draft can be committed as is once
 * reviewed; the unit tests check that Prettier leaves drafts unchanged.
 */
import type { QuoteStyle } from '../config/types';
import { quote, textWidth } from '../gen/generate';

/** How a target (or an element itself) is located. Preference: test id > role > label > text. */
export type LocatorSpec = (
  | { method: 'getByTestId'; value: string }
  | { method: 'getByRole'; role: string; name: string; exact?: boolean }
  | {
      method: 'getByLabel' | 'getByPlaceholder' | 'getByAltText' | 'getByTitle' | 'getByText';
      value: string;
      exact?: boolean;
    }
) & {
  /** More than one element matches (e.g. repeated links): take the first one. */
  first?: boolean;
};

/** What the definitions draft needs of one element. */
export interface DefinitionElement {
  name: string;
  /** Locator of the element itself (needed by `Enable` / `Disable`). */
  self?: LocatorSpec | undefined;
  /** `undefined` (or a missing locator) means: not observed, write a `TODO` placeholder. */
  selfTodo?: boolean;
  targets: { name: string; locator: LocatorSpec | undefined }[];
}

export interface DefinitionsOptions {
  screen: string;
  /** The observed URL, opened by `defineScreen`'s `open`. */
  url: string;
  elements: readonly DefinitionElement[];
  /** Default: `single`. */
  quotes?: QuoteStyle;
}

const PRINT_WIDTH = 100;
const INDENT = '  ';
const TODO_LOCATOR: LocatorSpec = { method: 'getByTestId', value: 'TODO' };
/** An identifier (Unicode letters included): Prettier leaves such keys unquoted. */
const IDENTIFIER = /^[\p{ID_Start}$_][\p{ID_Continue}$‌‍]*$/u;

class DefinitionWriter {
  constructor(private readonly quotes: QuoteStyle) {}

  q(value: string): string {
    return quote(value, this.quotes);
  }

  key(name: string): string {
    return IDENTIFIER.test(name) ? name : this.q(name);
  }

  fits(depth: number, text: string): boolean {
    return INDENT.length * depth + textWidth(text) <= PRINT_WIDTH;
  }

  /** `[first argument, option entries]` of a locator call. */
  private parts(locator: LocatorSpec): { first: string; options: string[] } {
    if (locator.method === 'getByRole') {
      const options = [`name: ${this.q(locator.name)}`];
      if (locator.exact === true) options.push('exact: true');
      return { first: this.q(locator.role), options };
    }
    if (locator.method === 'getByTestId') return { first: this.q(locator.value), options: [] };
    return { first: this.q(locator.value), options: locator.exact === true ? ['exact: true'] : [] };
  }

  /** `getByRole('button', { name: 'Log in' })` (without `page.` and `.first()`). */
  private flatCall(locator: LocatorSpec): string {
    const { first, options } = this.parts(locator);
    const rest = options.length > 0 ? `, { ${options.join(', ')} }` : '';
    return `${locator.method}(${first}${rest})`;
  }

  /** `page.getByRole('button', { name: 'Log in' })`, with `.first()` when asked. */
  flat(locator: LocatorSpec): string {
    return `page.${this.flatCall(locator)}${locator.first === true ? '.first()' : ''}`;
  }

  /** The call broken over lines (lines relative to the call's own indentation). */
  private brokenCall(locator: LocatorSpec, end: string): string[] {
    const { first, options } = this.parts(locator);
    if (options.length === 0) return [`${locator.method}(`, `${INDENT}${first},`, `)${end}`];
    return [
      `${locator.method}(${first}, {`,
      ...options.map((option) => `${INDENT}${option},`),
      `})${end}`,
    ];
  }

  /**
   * The locator expression starting at `depth`, followed by `end` (`,` or `);`): flat when it
   * fits, else with its options object (or its only argument) broken over lines, as Prettier does.
   * Lines after the first are indented relative to the first one.
   */
  call(depth: number, locator: LocatorSpec, end: string): string[] {
    const flat = `${this.flat(locator)}${end}`;
    if (this.fits(depth, flat)) return [flat];
    if (locator.first !== true) {
      const [head = '', ...rest] = this.brokenCall(locator, end);
      return [`page.${head}`, ...rest];
    }
    // A member chain: `page` / `.getByRole(…)` / `.first()`, one call per line.
    const call = `.${this.flatCall(locator)}`;
    const middle = this.fits(depth + 1, call)
      ? [call]
      : this.brokenCall(locator, '').map((line, i) => (i === 0 ? `.${line}` : line));
    return ['page', ...middle.map((line) => INDENT + line), `${INDENT}.first()${end}`];
  }

  /** Lines (with indentation) of `head ({ page }) => <locator><end>`, where `head` starts at `depth`. */
  arrow(depth: number, head: string, locator: LocatorSpec, end: string): string[] {
    const pad = INDENT.repeat(depth);
    const oneLine = `${head}({ page }) => ${this.flat(locator)}${end}`;
    if (this.fits(depth, oneLine)) return [pad + oneLine];
    const body = this.call(depth + 1, locator, end);
    return [`${pad}${head}({ page }) =>`, ...body.map((line) => INDENT.repeat(depth + 1) + line)];
  }

  target(depth: number, name: string, locator: LocatorSpec | undefined): string[] {
    const lines: string[] = [];
    if (locator === undefined) {
      lines.push(`${INDENT.repeat(depth)}// TODO: not observed; write its locator.`);
    }
    lines.push(...this.arrow(depth, `${this.key(name)}: `, locator ?? TODO_LOCATOR, ','));
    return lines;
  }

  element(element: DefinitionElement): string[] {
    const name = this.q(element.name);
    const self = element.self ?? (element.selfTodo === true ? TODO_LOCATOR : undefined);
    const comment =
      element.self === undefined && element.selfTodo === true
        ? ['// TODO: the element itself was not observed; write its locator.']
        : [];
    const targets = element.targets.flatMap((t) => this.target(1, t.name, t.locator));
    if (self === undefined) {
      return [...comment, `defineElement(${name}, {`, ...targets, '});'];
    }
    const selfFlat = `({ page }) => ${this.flat(self)}`;
    if (element.targets.length === 0) {
      const oneLine = `defineElement(${name}, ${selfFlat});`;
      if (this.fits(0, oneLine)) return [...comment, oneLine];
      // Prettier hugs the last argument (the arrow function) and breaks after `=>`.
      return [
        ...comment,
        `defineElement(${name}, ({ page }) =>`,
        ...this.call(1, self, ',').map((line) => INDENT + line),
        ');',
      ];
    }
    const head = `defineElement(${name}, ${selfFlat}, {`;
    if (this.fits(0, head)) return [...comment, head, ...targets, '});'];
    // Every argument on its own line.
    return [
      ...comment,
      'defineElement(',
      `${INDENT}${name},`,
      ...this.arrow(1, '', self, ','),
      `${INDENT}{`,
      ...element.targets.flatMap((t) => this.target(2, t.name, t.locator)),
      `${INDENT}},`,
      ');',
    ];
  }

  screen(screen: string, url: string): string[] {
    const goto = `await page.goto(${this.q(url)});`;
    const body = this.fits(2, goto)
      ? [`${INDENT}${INDENT}${goto}`]
      : [
          `${INDENT}${INDENT}await page.goto(`,
          `${INDENT}${INDENT}${INDENT}${this.q(url)},`,
          `${INDENT}${INDENT});`,
        ];
    return [
      `defineScreen(${this.q(screen)}, {`,
      `${INDENT}open: async ({ page }) => {`,
      ...body,
      `${INDENT}},`,
      '});',
    ];
  }
}

/** The definitions draft (see the module comment). Ends with a newline. */
export function renderDefinitions(options: DefinitionsOptions): string {
  const w = new DefinitionWriter(options.quotes ?? 'single');
  const header = [
    `// Draft definitions proposed by \`nimaime draft\` for Screen "${options.screen}".`,
    '// Review every locator before committing (see docs/draft.md).',
    `import { createNimaime } from ${w.q('nimaime-han')};`,
    '',
    'const { defineScreen, defineElement } = createNimaime();',
  ];
  const blocks = [header, w.screen(options.screen, options.url)];
  for (const element of options.elements) blocks.push(w.element(element));
  return `${blocks.map((block) => block.join('\n')).join('\n\n')}\n`;
}
