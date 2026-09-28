/**
 * `nimaime draft` (docs/draft.md): observe a live screen, propose a Sanmaime draft and a
 * definitions draft, optionally refined by a user-supplied LLM adapter.
 */
export { observeScreen, parseObservation, ObservationFormatError, OBSERVE_SCRIPT } from './observe';
export type { ObserveOptions } from './observe';
export {
  proposeSanmaime,
  proposeElements,
  validateDraft,
  locatorFor,
  locatorsFor,
  DraftError,
} from './propose';
export type {
  DraftLanguage,
  DroppedLine,
  LocatorSpec,
  Proposal,
  ProposeOptions,
  ProposedElement,
  ProposedTarget,
} from './propose';
export { renderDefinitions } from './definitions';
export type { DefinitionElement, DefinitionsOptions } from './definitions';
export { proposeWithLlm, extractSanmaime, SANMAIME_GRAMMAR_SUMMARY } from './llm';
export type { LlmAdapter, LlmOptions, LlmProposal, LlmRequest, RejectedAnswer } from './llm';
export {
  runDraft,
  resolveSource,
  loadLlmAdapter,
  DraftUsageError,
  DEFINITIONS_SEPARATOR,
} from './run';
export type { DraftIO, DraftExitCode, DraftSource } from './run';
export { OBSERVATION_FORMAT, OBSERVATION_VERSION } from './types';
export type {
  NameSource,
  ObservedElement,
  ObservedRegion,
  RegionKind,
  ScreenObservation,
} from './types';
