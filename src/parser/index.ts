/**
 * nimaime-han/parser — Sanmaime DSL parser (pure functions: source text -> AST).
 *
 * ```ts
 * import { parse } from 'nimaime-han/parser';
 * const { document, diagnostics } = parse(source, { uri });
 * // Default keyword language for files without a `# language:` directive (e.g. from the config):
 * parse(source, { uri, language: 'ja' });
 * ```
 *
 * The module has no Node-specific dependencies: callers read files themselves and pass the text.
 */
export { CONDITION_SEPARATOR, joinConditions, parse, SPEC_STATUSES } from './parser';
export { DEFAULT_LANGUAGE, LANGUAGES, SUPPORTED_LANGUAGES, getLanguage } from './languages';
export type { LanguageDefinition, LanguageKeywords } from './languages';
export type { ParseOptions, ParseResult } from './parser';
export { DiagnosticCode, formatDiagnostic } from './diagnostics';
export type { Diagnostic, DiagnosticSeverity } from './diagnostics';
export type {
  BackgroundEntry,
  ConditionBlock,
  ConditionRef,
  Element,
  Expectation,
  LanguageDirective,
  Location,
  SanmaimeDocument,
  Screen,
  SpecStatus,
  StateExpectation,
  StatusDirective,
  Tag,
  VisibilityExpectation,
} from './ast';
