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
  SpecStatus,
  StateExpectation,
  Tag,
} from './ast';
import { type Diagnostic, DiagnosticCode, type Messages, createMessages } from './diagnostics';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, getLanguage } from './languages';
import {
  type BareKeywordToken,
  type CommentToken,
  type KeywordTable,
  type LineToken,
  type NameKeywordToken,
  classifyLine,
  isInsignificant,
  keywordTable,
  splitLines,
} from './tokens';

export { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './languages';

/** The values of the `# status:` directive (§3.4). */
export const SPEC_STATUSES: readonly SpecStatus[] = ['draft', 'approved'];

/** A status directive, on a trimmed comment line (`\s` = the whitespace of §3.1). */
export const STATUS_DIRECTIVE = /^#\s*status\s*:\s*(.*)$/;

/** What joins the condition names of a block in its title (`When: A and B`, §5.10). */
export const CONDITION_SEPARATOR = ' and ';

/**
 * The display name of a block with the conditions `names` (`['A', 'B']` -> `'A and B'`). The same
 * in every keyword language: titles, like the AST, are language-independent.
 */
export function joinConditions(names: readonly string[]): string {
  return names.join(CONDITION_SEPARATOR);
}

export interface ParseOptions {
  /** Identifies the source (file path or URL). Copied to `document.uri`; not read by the parser. */
  uri?: string;
  /**
   * Keyword language of a file that has no valid `# language:` directive (default `"en"`). This
   * is what the config's `language` option feeds in; a directive in the file always wins.
   *
   * Unlike problems in the source, an unsupported code here is a programming or configuration
   * error: `parse()` throws a `TypeError` for it. Check with `getLanguage()` first if needed.
   */
  language?: string;
}

export interface ParseResult {
  /** Best-effort document. It has no defined meaning when `diagnostics` contains an error. */
  document: SanmaimeDocument;
  /** All diagnostics of the file, sorted by location. Empty for a valid file. */
  diagnostics: Diagnostic[];
}

/**
 * Parse Sanmaime source text. Never throws for malformed source; throws a `TypeError` only when
 * `options.language` is not a supported language code.
 */
export function parse(source: string, options: ParseOptions = {}): ParseResult {
  return new Parser(options).run(source);
}

interface Asserted {
  line: number;
}

interface StateAsserted extends Asserted {
  keyword: StateExpectation['keyword'];
  /** The keyword as written, for messages. */
  text: string;
}

interface BlockState {
  expectations: Expectation[];
  /** `undefined` for the element's unconditional block. */
  condition: ConditionBlock | undefined;
  targets: Map<string, Asserted>;
  state: StateAsserted | undefined;
  /** Kind of the open `Show:`/`Hide:` group that an `And:` may continue. */
  groupKind: 'show' | 'hide' | undefined;
  /**
   * Whether the block's condition list is still open: after `When:` and `And when:`, until the
   * first expectation (or the end of the block). Only then is `And when:` accepted (E023).
   */
  chainOpen: boolean;
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
  /** `Background:` names -> line of their first declaration. */
  backgroundNames: Map<string, number>;
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
  /** Keywords of the active language; replaced by a valid header directive. */
  private table: KeywordTable;
  private messages: Messages;

  constructor(options: ParseOptions) {
    // `unknown`: JavaScript callers may pass anything.
    const language: unknown = options.language ?? DEFAULT_LANGUAGE;
    if (typeof language !== 'string' || getLanguage(language) === undefined) {
      throw new TypeError(
        `parse(): unsupported language option '${String(language)}'. Supported languages: ${SUPPORTED_LANGUAGES.join(', ')}.`,
      );
    }
    this.document = {
      uri: options.uri,
      language,
      languageDirective: undefined,
      status: 'approved',
      screens: [],
    };
    this.table = keywordTable(language);
    this.messages = createMessages(this.table.primary);
  }

  run(source: string): ParseResult {
    let inHeader = true;
    // Lines are classified one at a time: a directive in the header selects the keyword table
    // used for every line after it.
    for (const [index, raw] of splitLines(source).entries()) {
      const token = classifyLine(raw, index + 1, this.table);
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
    const status = STATUS_DIRECTIVE.exec(token.text);
    if (status) {
      this.statusDirective(status[1]?.trim() ?? '', token.location);
      return;
    }
    if (token.directive === undefined) return;
    const first = this.document.languageDirective;
    if (first !== undefined) {
      this.report(
        DiagnosticCode.InvalidLanguage,
        this.messages.duplicateLanguage(first.location.line),
        token.location,
      );
      return;
    }
    const directive: LanguageDirective = { value: token.directive, location: token.location };
    this.document.languageDirective = directive;
    if (getLanguage(directive.value) !== undefined) {
      this.document.language = directive.value;
      this.table = keywordTable(directive.value);
      this.messages = createMessages(this.table.primary);
    } else {
      // E017: keep the default language (the `language` option, or `en`).
      this.report(
        DiagnosticCode.InvalidLanguage,
        this.messages.unsupportedLanguage(directive.value, SUPPORTED_LANGUAGES),
        token.location,
      );
    }
  }

  /** `# status: draft | approved` (§3.4); E024 keeps the default (`approved`), like E017. */
  private statusDirective(value: string, location: Location): void {
    const first = this.document.statusDirective;
    if (first !== undefined) {
      this.report(
        DiagnosticCode.InvalidStatus,
        this.messages.duplicateStatus(first.location.line),
        location,
      );
      return;
    }
    this.document.statusDirective = { value, location: { ...location } };
    if ((SPEC_STATUSES as readonly string[]).includes(value)) {
      this.document.status = value as SpecStatus;
    } else {
      this.report(DiagnosticCode.InvalidStatus, this.messages.unknownStatus(value), location);
    }
  }

  // --- significant lines ------------------------------------------------------------------------

  private line(token: Exclude<LineToken, { type: 'blank' | 'comment' }>): void {
    switch (token.type) {
      case 'unknown':
        // E001: ignore the line.
        this.report(
          DiagnosticCode.UnrecognisedLine,
          this.messages.unrecognisedLine(token.text, this.hintFor(token.text)),
          token.location,
        );
        return;
      case 'invalid-tags':
        // E020: ignore the line and discard its tags.
        this.report(
          DiagnosticCode.InvalidTag,
          this.messages.invalidTag(token.token),
          token.location,
        );
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
            this.messages.missingName(token.text),
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
            this.messages.bareKeywordWithArgument(token.text),
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
      case 'Background':
        this.background(token);
        return;
      case 'When':
        this.startCondition(token);
        return;
      case 'AndWhen':
        this.andWhen(token);
        return;
      case 'Show':
      case 'Hide':
      case 'And':
        this.expectation(token);
        return;
    }
  }

  /** Take the pending tags for a `Screen:`/`Element:`/`When:` line. */
  private takeTags(): Tag[] {
    const tags = this.pendingTags?.tags ?? [];
    this.pendingTags = undefined;
    return tags;
  }

  /** A line other than `Screen:`/`Element:`/`When:` ends a tag group: E018, discard the tags. */
  private rejectTags(): void {
    if (!this.pendingTags) return;
    this.report(
      DiagnosticCode.MisplacedTags,
      this.messages.misplacedTags(),
      this.pendingTags.location,
    );
    this.pendingTags = undefined;
  }

  private startScreen(token: NameKeywordToken): void {
    this.skip = 'none';
    this.endScreen();
    const node: Screen = {
      name: token.name,
      tags: this.takeTags(),
      location: token.location,
      background: [],
      elements: [],
    };
    if (token.name !== '') {
      const first = this.screenNames.get(token.name);
      if (first === undefined) this.screenNames.set(token.name, token.location.line);
      else
        this.report(
          DiagnosticCode.DuplicateScreen,
          this.messages.duplicateScreen(token.name, first),
          token.location,
        );
    }
    this.document.screens.push(node);
    this.screen = {
      node,
      elementNames: new Map(),
      backgroundNames: new Map(),
      element: undefined,
    };
  }

  /** `Background: <condition>`: directly under `Screen:`, before its first `Element:` (§5.9). */
  private background(token: NameKeywordToken): void {
    if (this.skip !== 'none') return;
    this.rejectTags();
    const screen = this.screen;
    if (!screen || screen.element !== undefined) {
      // E025: ignore the line.
      this.report(
        DiagnosticCode.MisplacedBackground,
        this.messages.misplacedBackground(token.text),
        token.location,
      );
      return;
    }
    if (token.name !== '') {
      const first = screen.backgroundNames.get(token.name);
      if (first === undefined) screen.backgroundNames.set(token.name, token.location.line);
      else
        this.report(
          DiagnosticCode.DuplicateConditionInChain,
          this.messages.duplicateBackground(token.name, screen.node.name, first),
          token.location,
        );
    }
    screen.node.background.push({ name: token.name, location: token.location });
  }

  private startElement(token: NameKeywordToken): void {
    if (this.skip === 'until-screen') return;
    this.skip = 'none';
    const tags = this.takeTags();
    const screen = this.screen;
    if (!screen) {
      this.report(
        DiagnosticCode.ElementOutsideScreen,
        this.messages.elementOutsideScreen(),
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
          this.messages.duplicateElement(token.name, screen.node.name, first),
          token.location,
        );
    }
    screen.node.elements.push(node);
    const unconditional = newBlock(node.unconditional, undefined);
    screen.element = { node, conditionNames: new Map(), unconditional, block: unconditional };
  }

  private startCondition(token: NameKeywordToken): void {
    if (this.skip !== 'none') return;
    // Tags before `When:` belong to the block (block-level tags); after E005 they are discarded.
    const tags = this.takeTags();
    const element = this.screen?.element;
    if (!element) {
      this.report(
        DiagnosticCode.WhenOutsideElement,
        this.messages.whenOutsideElement(),
        token.location,
      );
      this.skip = 'until-element';
      return;
    }
    this.endBlock(element);
    const node: ConditionBlock = {
      name: token.name,
      conditions: [{ name: token.name, keyword: 'When', location: token.location }],
      title: token.name,
      tags,
      location: token.location,
      expectations: [],
    };
    this.checkBackgroundConflict(token);
    element.node.conditions.push(node);
    element.block = newBlock(node.expectations, node);
    element.block.chainOpen = true;
  }

  /** `And when: <condition>`: a further condition of the block it directly follows (§5.10). */
  private andWhen(token: NameKeywordToken): void {
    if (this.skip !== 'none') return;
    this.rejectTags();
    const block = this.screen?.element?.block;
    const node = block?.condition;
    if (!block?.chainOpen || !node) {
      // E023: ignore the line.
      this.report(
        DiagnosticCode.MisplacedAndWhen,
        this.messages.misplacedAndWhen(token.text),
        token.location,
      );
      return;
    }
    if (!this.checkBackgroundConflict(token) && token.name !== '') {
      const first = node.conditions.find((c) => c.name === token.name);
      if (first) {
        this.report(
          DiagnosticCode.DuplicateConditionInChain,
          this.messages.duplicateBlockCondition(token.name, first.location.line),
          token.location,
        );
      }
    }
    node.conditions.push({ name: token.name, keyword: 'AndWhen', location: token.location });
    node.title = joinConditions(node.conditions.map((c) => c.name));
  }

  /** E022 when a `When:` / `And when:` condition is one of the screen's backgrounds. */
  private checkBackgroundConflict(token: NameKeywordToken): boolean {
    if (token.name === '') return false;
    const line = this.screen?.backgroundNames.get(token.name);
    if (line === undefined) return false;
    this.report(
      DiagnosticCode.DuplicateConditionInChain,
      this.messages.conditionInBackground(token.name, line),
      token.location,
    );
    return true;
  }

  /**
   * Ends the condition list of the element's current block (at its first expectation or at the
   * end of the block) and checks that no other block of the element has the same conditions
   * (E013, located at the second block's `When:` line).
   */
  private closeConditions(element: ElementState): void {
    const block = element.block;
    if (!block.chainOpen) return;
    block.chainOpen = false;
    const node = block.condition;
    if (!node || node.conditions.some((c) => c.name === '')) return;
    const first = element.conditionNames.get(node.title);
    if (first === undefined) element.conditionNames.set(node.title, node.location.line);
    else
      this.report(
        DiagnosticCode.DuplicateCondition,
        this.messages.duplicateCondition(node.title, element.node.name, first),
        node.location,
      );
  }

  private expectation(token: NameKeywordToken | BareKeywordToken): void {
    if (this.skip !== 'none') return;
    this.rejectTags();
    const element = this.screen?.element;
    if (!element) {
      const keyword = token.type === 'name-keyword' ? `${token.text}:` : token.text;
      if (this.screen && this.screen.node.background.length > 0) {
        // E021 (after `Background:`), else E006: skip to the next `Element:`.
        this.report(
          DiagnosticCode.BackgroundWithExpectations,
          this.messages.backgroundWithExpectations(keyword),
          token.location,
        );
      } else {
        this.report(
          DiagnosticCode.ExpectationOutsideElement,
          this.messages.expectationOutsideElement(keyword),
          token.location,
        );
      }
      this.skip = 'until-element';
      return;
    }
    this.closeConditions(element);
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
        this.report(DiagnosticCode.DanglingAnd, this.messages.danglingAnd(), token.location);
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
          this.messages.duplicateTarget(target, inBlock.line),
          token.location,
        );
      } else {
        block.targets.set(target, { line: token.location.line });
        if (unconditional) {
          this.report(
            DiagnosticCode.ConflictsWithUnconditional,
            this.messages.conflictsWithUnconditional(target, element.node.name, unconditional.line),
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
        this.messages.duplicateState(block.state.text, block.state.line),
        token.location,
      );
    } else {
      block.state = { keyword, text: token.text, line: token.location.line };
      const unconditional = block.condition ? element.unconditional.state : undefined;
      if (unconditional) {
        this.report(
          DiagnosticCode.ConflictsWithUnconditional,
          this.messages.stateConflictsWithUnconditional(
            token.text,
            unconditional.text,
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

  private endBlock(element: ElementState): void {
    this.closeConditions(element);
    const block = element.block;
    if (block.condition && block.expectations.length === 0) {
      this.report(
        DiagnosticCode.EmptyConditionBlock,
        this.messages.emptyConditionBlock(block.condition.title),
        block.condition.location,
      );
    }
  }

  private endElement(screen: ScreenState): void {
    const element = screen.element;
    if (!element) return;
    this.endBlock(element);
    const node = element.node;
    if (node.unconditional.length === 0 && node.conditions.length === 0) {
      this.report(
        DiagnosticCode.EmptyElement,
        this.messages.emptyElement(node.name),
        node.location,
      );
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
        this.messages.emptyScreen(screen.node.name),
        screen.node.location,
      );
    }
    this.screen = undefined;
  }

  private endOfFile(): void {
    this.rejectTags();
    this.endScreen();
  }

  /** Suggest a fix for an unrecognised line (§7.2, E001). */
  private hintFor(text: string): string | undefined {
    return (
      sameLanguageHint(text, this.table) ??
      otherLanguageHint(text, this.table, this.document.languageDirective !== undefined)
    );
  }
}

function newBlock(expectations: Expectation[], condition: ConditionBlock | undefined): BlockState {
  return {
    expectations,
    condition,
    targets: new Map(),
    state: undefined,
    groupKind: undefined,
    chainOpen: false,
  };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Hints within the active language: wrong case, missing or unaccepted colon (§7.2, E001). */
function sameLanguageHint(text: string, table: KeywordTable): string | undefined {
  for (const { text: keyword } of table.name) {
    // Wrong case: "show: X" -> "Show:".
    const head = text.slice(0, keyword.length);
    const rest = text.slice(keyword.length);
    if (
      head !== keyword &&
      head.toLowerCase() === keyword.toLowerCase() &&
      table.colons.some((colon) => rest.startsWith(colon))
    ) {
      return `Did you mean '${keyword}:'?`;
    }
    // Missing colon: "Show X" -> "Show: X", "Show : X" -> "Show: X"; a full-width colon in a
    // language that does not accept it: "Show：X" -> "Show: X".
    const missingColon = new RegExp(`^${escapeRegExp(keyword)}(?:\\s+[:：]?|[:：])\\s*(.*)$`).exec(
      text,
    );
    if (missingColon) {
      const name = missingColon[1] ?? '';
      return name === '' ? `Did you mean '${keyword}:'?` : `Did you mean '${keyword}: ${name}'?`;
    }
  }
  for (const { text: keyword } of table.bare) {
    // Wrong case: "enable" -> "Enable".
    if (text.toLowerCase() === keyword.toLowerCase()) return `Did you mean '${keyword}'?`;
  }
  return undefined;
}

/** A keyword of another language (e.g. `Show:` in a `# language: ja` file). */
function otherLanguageHint(
  text: string,
  table: KeywordTable,
  hasDirective: boolean,
): string | undefined {
  for (const code of SUPPORTED_LANGUAGES) {
    if (code === table.language.code) continue;
    const token = classifyLine(text, 1, keywordTable(code));
    if (token.type !== 'name-keyword' && token.type !== 'bare-keyword') continue;
    const colon = token.type === 'name-keyword' ? ':' : '';
    const other = keywordTable(code).language;
    const active = table.language;
    return (
      `'${token.text}${colon}' is a keyword of ${other.name} (${other.code}), but this file uses ${active.name} (${active.code}) keywords. ` +
      `Did you mean '${table.primary[token.keyword]}${colon}'?` +
      (hasDirective ? '' : ` Or add '# language: ${other.code}' to the file header.`)
    );
  }
  return undefined;
}
