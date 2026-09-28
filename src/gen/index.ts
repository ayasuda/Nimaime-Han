/**
 * Code generator internals used by the `nimaime-gen` CLI: resolving spec and definition files,
 * loading definitions, parsing specs, matching Sanmaime names to definitions, generating
 * Playwright `.spec.ts` files and the orchestration of a run (docs/cli.md).
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
export {
  FALLBACK_FIXTURE,
  generatedSpecPath,
  GENERATED_HEADER_PREFIX,
  generateSpecFile,
  importSpecifier,
  listTests,
  quote,
  RUNTIME_MODULE,
  textWidth,
  UNCONDITIONAL_TEST_TITLE,
  type GeneratedSpecFile,
  type GeneratedTest,
  type GenerateOptions,
  type UnknownFixtures,
} from './generate';
export { cleanOutputDir, writeGeneratedFiles, type CleanResult } from './output';
export {
  displayPath,
  formatDiagnostics,
  formatMissing,
  formatUnused,
  type FileDiagnostic,
  type MissingReportOptions,
  type ReportFormat,
  type ReportOptions,
} from './report';
export { generateSnippets, type SnippetOptions } from './snippets';
export {
  processConfig,
  runGeneration,
  withoutMissingDefinitions,
  type ConfigGenerationResult,
  type ExitCode,
  type GenerationMode,
  type RunGenerationOptions,
  type RunGenerationResult,
  type SkippedTest,
  type TextOutput,
} from './run';
