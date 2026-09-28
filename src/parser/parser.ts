/**
 * Sanmaime parser: source text -> AST + diagnostics (docs/sanmaime.md §4–§7).
 *
 * `parse()` is a pure function. It never throws on malformed input: every problem is reported as
 * a diagnostic (in source order) and a best-effort document is returned, following the recovery
 * rules of §7.3.
 */
import type {
  ConditionBlock,
  Element,
  Expectation,
  LanguageDirective,
  Location,
  SanmaimeDocument,
  Screen,
  StateExpectation,
  Tag,
} from './ast';
import { type Diagnostic, DiagnosticCode, messages } from './diagnostics';
import {
  BARE_KEYWORDS,
  type BareKeywordToken,
  type CommentToken,
  type LineToken,
  NAME_KEYWORDS,
  type NameKeywordToken,
  isInsignificant,
  tokenize,
} from './tokens';

/** Keyword languages accepted by the `# language:` directive in v0. */
export const SUPPORTED_LANGUAGES: readonly string[] = ['en'];

/** The language used when the file has no (valid) directive. */
export const DEFAULT_LANGUAGE = 'en';

export interface ParseOptions {
  /** Identifies the source (file path or URL). Copied to `document.uri`; not read by the parser. */
  uri?: string;
}

export interface ParseResult {
  /** Best-effort document. It has no defined meaning when `diagnostics` contains an error. */
  document: SanmaimeDocument;
  /** All diagnostics of the file, sorted by location. Empty for a valid file. */
  diagnostics: Diagnostic[];
}

/** Parse Sanmaime source text. */
export function parse(source: string, options: ParseOptions = {}): ParseResult {
  return new Parser(options).run(source);
}

interface Asserted {
  line: number;
}

interface StateAsserted extends Asserted {
  keyword: StateExpectation['keyword'];
}

interface BlockState {
  expectations: Expectation[];
  /** `undefined` for the element's unconditional block. */
  condition: ConditionBlock | undefined;
  targets: Map<string, Asserted>;
  state: StateAsserted | undefined;
  /** Kind of the open `Show:`/`Hide:` group that an `And:` may continue. */
  groupKind: 'show' | 'hide' | undefined;
}

interface ElementState {
  node: Element;
  conditionNames: Map<string, number>;
  unconditional: BlockState;
  block: BlockState;
}

interface ScreenState {
  node: Screen;
  elementNames: Map<string, number>;
  element: ElementState | undefined;
}

interface PendingTags {
  tags: Tag[];
  location: Location;
}

/** §7.3 recovery: lines skipped after a structural error. */
type SkipMode = 'none' | 'until-screen' | 'until-element';

class Parser {
  private readonly diagnostics: Diagnostic[] = [];
  private readonly document: SanmaimeDocument;
  private readonly screenNames = new Map<string, number>();
  private screen: ScreenState | undefined;
  private pendingTags: PendingTags | undefined;
  private skip: SkipMode = 'none';

  constructor(options: ParseOptions) {
    this.document = {
      uri: options.uri,
      language: DEFAULT_LANGUAGE,
      languageDirective: undefined,
      screens: [],
    };
  }

  run(source: string): ParseResult {
    const tokens = tokenize(source);
    let inHeader = true;
    for (const token of tokens) {
      if (isInsignificant(token)) {
        if (inHeader && token.type === 'comment') this.directive(token);
        continue;
      }
      inHeader = false;
      this.line(token);
    }
    this.endOfFile();
    // Stable sort: diagnostics found at the end of a construct (E008–E010, E018) move to its start.
    const diagnostics = [...this.diagnostics].sort(
      (a, b) => a.location.line - b.location.line || a.location.column - b.location.column,
    );
    return { document: this.document, diagnostics };
  }

  private report(code: DiagnosticCode, message: string, location: Location): void {
    this.diagnostics.push({ code, severity: 'error', message, location: { ...location } });
  }

  // --- header -----------------------------------------------------------------------------------

  private directive(token: CommentToken): void {
    if (token.directive === undefined) return;
    const first = this.document.languageDirective;
    if (first !== undefined) {
      this.report(
        DiagnosticCode.InvalidLanguage,
        messages.duplicateLanguage(first.location.line),
        token.location,
      );
      return;
    }
    const directive: LanguageDirective = { value: token.directive, location: token.location };
    this.document.languageDirective = directive;
    if (SUPPORTED_LANGUAGES.includes(directive.value)) {
      this.document.language = directive.value;
    } else {
      this.report(
        DiagnosticCode.InvalidLanguage,
        messages.unsupportedLanguage(directive.value, SUPPORTED_LANGUAGES),
        token.location,
      );
    }
  }

  // --- significant lines ------------------------------------------------------------------------

  private line(token: Exclude<LineToken, { type: 'blank' | 'comment' }>): void {
    switch (token.type) {
      case 'unknown':
        // E001: ignore the line.
        this.report(
          DiagnosticCode.UnrecognisedLine,
          messages.unrecognisedLine(token.text, hintFor(token.text)),
          token.location,
        );
        return;
      case 'reserved':
        // E019: ignore the line.
        this.report(
          DiagnosticCode.ReservedKeyword,
          messages.reservedKeyword(token.keyword),
          token.location,
        );
        return;
      case 'invalid-tags':
        // E020: ignore the line and discard its tags.
        this.report(DiagnosticCode.InvalidTag, messages.invalidTag(token.token), token.location);
        return;
      case 'tags':
        this.skip = 'none';
        if (this.pendingTags) this.pendingTags.tags.push(...token.tags);
        else this.pendingTags = { tags: [...token.tags], location: token.location };
        return;
      case 'name-keyword':
        if (token.name === '') {
          // E002: continue with an empty name.
          this.report(
            DiagnosticCode.MissingName,
            messages.missingName(token.keyword),
            token.location,
          );
        }
        this.nameKeyword(token);
        return;
      case 'bare-keyword':
        if (token.hasArgument) {
          // E003: continue as the bare keyword.
          this.report(
            DiagnosticCode.BareKeywordWithArgument,
            messages.bareKeywordWithArgument(token.keyword),
            token.location,
          );
        }
        this.expectation(token);
        return;
    }
  }

  private nameKeyword(token: NameKeywordToken): void {
    switch (token.keyword) {
      case 'Screen':
        this.startScreen(token);
        return;
      case 'Element':
        this.startElement(token);
        return;
      case 'When':
        this.startCondition(token);
        return;
      case 'Show':
      case 'Hide':
      case 'And':
        this.expectation(token);
        return;
    }
  }

  /** Take the pending tags for a `Screen:`/`Element:` line. */
  private takeTags(): Tag[] {
    const tags = this.pendingTags?.tags ?? [];
    this.pendingTags = undefined;
    return tags;
  }

  /** A line other than `Screen:`/`Element:` ends a tag group: E018, discard the tags. */
  private rejectTags(): void {
    if (!this.pendingTags) return;
    this.report(DiagnosticCode.MisplacedTags, messages.misplacedTags(), this.pendingTags.location);
    this.pendingTags = undefined;
  }

  private startScreen(token: NameKeywordToken): void {
    this.skip = 'none';
    this.endScreen();
    const node: Screen = {
      name: token.name,
      tags: this.takeTags(),
      location: token.location,
      elements: [],
    };
    if (token.name !== '') {
      const first = this.screenNames.get(token.name);
      if (first === undefined) this.screenNames.set(token.name, token.location.line);
      else
        this.report(
          DiagnosticCode.DuplicateScreen,
          messages.duplicateScreen(token.name, first),
          token.location,
        );
    }
    this.document.screens.push(node);
    this.screen = { node, elementNames: new Map(), element: undefined };
  }

  private startElement(token: NameKeywordToken): void {
    if (this.skip === 'until-screen') return;
    this.skip = 'none';
    const tags = this.takeTags();
    const screen = this.screen;
    if (!screen) {
      this.report(
        DiagnosticCode.ElementOutsideScreen,
        messages.elementOutsideScreen(),
        token.location,
      );
      this.skip = 'until-screen';
      return;
    }
    this.endElement(screen);
    const node: Element = {
      name: token.name,
      tags,
      location: token.location,
      unconditional: [],
      conditions: [],
    };
    if (token.name !== '') {
      const first = screen.elementNames.get(token.name);
      if (first === undefined) screen.elementNames.set(token.name, token.location.line);
      else
        this.report(
          DiagnosticCode.DuplicateElement,
          messages.duplicateElement(token.name, screen.node.name, first),
          token.location,
        );
    }
    screen.node.elements.push(node);
    const unconditional = newBlock(node.unconditional, undefined);
    screen.element = { node, conditionNames: new Map(), unconditional, block: unconditional };
  }

  private startCondition(token: NameKeywordToken): void {
    if (this.skip !== 'none') return;
    this.rejectTags();
    const element = this.screen?.element;
    if (!element) {
      this.report(DiagnosticCode.WhenOutsideElement, messages.whenOutsideElement(), token.location);
      this.skip = 'until-element';
      return;
    }
    this.endBlock(element.block);
    const node: ConditionBlock = { name: token.name, location: token.location, expectations: [] };
    if (token.name !== '') {
      const first = element.conditionNames.get(token.name);
      if (first === undefined) element.conditionNames.set(token.name, token.location.line);
      else
        this.report(
          DiagnosticCode.DuplicateCondition,
          messages.duplicateCondition(token.name, element.node.name, first),
          token.location,
        );
    }
    element.node.conditions.push(node);
    element.block = newBlock(node.expectations, node);
  }

  private expectation(token: NameKeywordToken | BareKeywordToken): void {
    if (this.skip !== 'none') return;
    this.rejectTags();
    const element = this.screen?.element;
    if (!element) {
      const keyword = token.type === 'name-keyword' ? `${token.keyword}:` : token.keyword;
      this.report(
        DiagnosticCode.ExpectationOutsideElement,
        messages.expectationOutsideElement(keyword),
        token.location,
      );
      this.skip = 'until-element';
      return;
    }
    const block = element.block;
    if (token.type === 'bare-keyword') this.stateExpectation(token, element, block);
    else this.visibilityExpectation(token, element, block);
  }

  private visibilityExpectation(
    token: NameKeywordToken,
    element: ElementState,
    block: BlockState,
  ): void {
    let kind: 'show' | 'hide';
    if (token.keyword === 'And') {
      if (block.groupKind === undefined) {
        // E007: ignore the line.
        this.report(DiagnosticCode.DanglingAnd, messages.danglingAnd(), token.location);
        return;
      }
      kind = block.groupKind;
    } else {
      kind = token.keyword === 'Show' ? 'show' : 'hide';
      block.groupKind = kind;
    }
    const keyword = token.keyword as 'Show' | 'Hide' | 'And';
    const target = token.name;

    if (target !== '') {
      const inBlock = block.targets.get(target);
      const unconditional = block.condition ? element.unconditional.targets.get(target) : undefined;
      if (inBlock) {
        this.report(
          DiagnosticCode.DuplicateTarget,
          messages.duplicateTarget(target, inBlock.line),
          token.location,
        );
      } else {
        block.targets.set(target, { line: token.location.line });
        if (unconditional) {
          this.report(
            DiagnosticCode.ConflictsWithUnconditional,
            messages.conflictsWithUnconditional(target, element.node.name, unconditional.line),
            token.location,
          );
        }
      }
    }

    block.expectations.push({
      kind,
      target,
      keyword,
      viaAnd: keyword === 'And',
      location: token.location,
    });
  }

  private stateExpectation(
    token: BareKeywordToken,
    element: ElementState,
    block: BlockState,
  ): void {
    block.groupKind = undefined;
    const keyword = token.keyword;
    if (block.state) {
      this.report(
        DiagnosticCode.DuplicateState,
        messages.duplicateState(block.state.keyword, block.state.line),
        token.location,
      );
    } else {
      block.state = { keyword, line: token.location.line };
      const unconditional = block.condition ? element.unconditional.state : undefined;
      if (unconditional) {
        this.report(
          DiagnosticCode.ConflictsWithUnconditional,
          messages.stateConflictsWithUnconditional(
            keyword,
            unconditional.keyword,
            element.node.name,
            unconditional.line,
          ),
          token.location,
        );
      }
    }
    block.expectations.push({
      kind: keyword === 'Enable' ? 'enable' : 'disable',
      keyword,
      location: token.location,
    });
  }

  // --- end of constructs ------------------------------------------------------------------------

  private endBlock(block: BlockState): void {
    if (block.condition && block.expectations.length === 0) {
      this.report(
        DiagnosticCode.EmptyConditionBlock,
        messages.emptyConditionBlock(block.condition.name),
        block.condition.location,
      );
    }
  }

  private endElement(screen: ScreenState): void {
    const element = screen.element;
    if (!element) return;
    this.endBlock(element.block);
    const node = element.node;
    if (node.unconditional.length === 0 && node.conditions.length === 0) {
      this.report(DiagnosticCode.EmptyElement, messages.emptyElement(node.name), node.location);
    }
    screen.element = undefined;
  }

  private endScreen(): void {
    const screen = this.screen;
    if (!screen) return;
    this.endElement(screen);
    if (screen.node.elements.length === 0) {
      this.report(
        DiagnosticCode.EmptyScreen,
        messages.emptyScreen(screen.node.name),
        screen.node.location,
      );
    }
    this.screen = undefined;
  }

  private endOfFile(): void {
    this.rejectTags();
    this.endScreen();
  }
}

function newBlock(expectations: Expectation[], condition: ConditionBlock | undefined): BlockState {
  return { expectations, condition, targets: new Map(), state: undefined, groupKind: undefined };
}

/** Suggest a fix for an unrecognised line (§7.2, E001). */
function hintFor(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const keyword of NAME_KEYWORDS) {
    // Wrong case: "show: X" -> "Show:".
    if (lower.startsWith(`${keyword.toLowerCase()}:`)) return `Did you mean '${keyword}:'?`;
    // Missing colon: "Show X" -> "Show: X", "Show : X" -> "Show: X".
    const missingColon = new RegExp(`^${keyword}\\s+:?\\s*(.*)$`).exec(text);
    if (missingColon) {
      const rest = missingColon[1] ?? '';
      return rest === '' ? `Did you mean '${keyword}:'?` : `Did you mean '${keyword}: ${rest}'?`;
    }
  }
  for (const keyword of BARE_KEYWORDS) {
    // Wrong case: "enable" -> "Enable".
    if (lower === keyword.toLowerCase()) return `Did you mean '${keyword}'?`;
  }
  return undefined;
}
