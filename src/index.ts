/**
 * nimaime-han — main entry point: the user-facing API used from `playwright.config.ts` and
 * element/condition definition files.
 */
export { VERSION } from './version';
// Imported from the individual modules (not the config barrel) so that the CLI-only config loader
// is not part of the entry imported by playwright.config.ts.
export { defineSanmaimeConfig } from './config/define';
export { SanmaimeConfigError } from './config/errors';
export type {
  GlobPatterns,
  ImportTestFrom,
  QuoteStyle,
  ResolvedImportTestFrom,
  ResolvedSanmaimeConfig,
  SanmaimeConfig,
} from './config/types';
// Definition API (createNimaime -> defineScreen / defineElement / defineCondition).
export { createNimaime } from './runtime/define';
export { NimaimeDefinitionError } from './runtime/errors';
export type {
  ConditionFn,
  ConditionOptions,
  DefaultFixtures,
  DefaultWorkerFixtures,
  DefineCondition,
  DefineElement,
  DefineElementHook,
  DefineScreen,
  DefineScreenHook,
  ElementHookFn,
  ElementHookInfo,
  ElementHookOptions,
  ElementTargets,
  FixturesOf,
  HookInfo,
  HookKind,
  LocatorFn,
  NimaimeDefinitions,
  OpenScreenFn,
  ScreenHookFn,
  ScreenHookInfo,
  ScreenHookOptions,
  ScreenOptions,
  WorkerFixturesOf,
} from './runtime/types';
// Runtime errors and the failure parser, re-exported so users and reporters can import them from
// the main entry (the classes are also exported from `nimaime-han/runtime`).
export { NimaimeHookError, NimaimeRuntimeError } from './runtime/errors';
export { NimaimeExpectationError, parseExpectationFailure } from './runtime/failure';
export type { ExpectationFailureJSON } from './runtime/failure';
// Types of `nimaime draft` (docs/draft.md), for users who write an LLM adapter in TypeScript:
// `const adapter: LlmAdapter = async ({ system, prompt }) => …; export default adapter;`
export type {
  LlmAdapter,
  LlmRequest,
  ObservedElement,
  ObservedRegion,
  ScreenObservation,
} from './draft';
