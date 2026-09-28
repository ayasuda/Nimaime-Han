/**
 * Code generator internals used by the `nimaime-gen` CLI: resolving spec and definition files,
 * loading definitions, parsing specs and matching Sanmaime names to definitions.
 *
 * TODO(#9): implement code generation (Sanmaime AST -> Playwright `.spec.ts` in `.sanmaime-gen/`).
 */
export {
  resolveDefinitionFiles,
  resolveFiles,
  resolveSpecFiles,
  type FileResolutionConfig,
} from './files';
export {
  DefinitionLoadError,
  loadDefinitions,
  type LoadDefinitionsOptions,
} from './load-definitions';
export {
  hasErrors,
  loadSpecs,
  specUri,
  type ParsedSpec,
  type SpecLoadingConfig,
} from './load-specs';
export {
  matchSpecs,
  type MatchResult,
  type MissingDefinition,
  type MissingDefinitionKind,
  type ResolvedCondition,
  type ResolvedDocument,
  type ResolvedElement,
  type ResolvedExpectation,
  type ResolvedScreen,
  type ResolvedStateExpectation,
  type ResolvedVisibilityExpectation,
  type UnusedDefinition,
  type UnusedDefinitionKind,
} from './match';
