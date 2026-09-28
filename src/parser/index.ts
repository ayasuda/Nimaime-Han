/**
 * nimaime-han/parser — Sanmaime DSL parser (pure functions: source text -> AST).
 *
 * ```ts
 * import { parse } from 'nimaime-han/parser';
 * const { document, diagnostics } = parse(source, { uri });
 * ```
 *
 * The module has no Node-specific dependencies: callers read files themselves and pass the text.
 */
export { parse, DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './parser';
export type { ParseOptions, ParseResult } from './parser';
export { DiagnosticCode, formatDiagnostic } from './diagnostics';
export type { Diagnostic, DiagnosticSeverity } from './diagnostics';
export type {
  ConditionBlock,
  Element,
  Expectation,
  LanguageDirective,
  Location,
  SanmaimeDocument,
  Screen,
  StateExpectation,
  Tag,
  VisibilityExpectation,
} from './ast';
