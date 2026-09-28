/**
 * nimaime-han/runtime — code imported by generated `.sanmaime-gen/*.spec.ts` files at test time:
 * the `test` with the `$nimaime` fixture (the counterpart of playwright-bdd's `$bddContext`),
 * the definition registry, and the helpers the generator uses to query it. Also the Sanmaime spec
 * registry used by `$nimaime.verify()` from hand-written steps (`loadSanmaimeSpecs`).
 */
export {
  createNimaimeTest,
  expect,
  nimaimeFixtures,
  playwrightDriver,
  test,
  type NimaimeTestArgs,
  type NimaimeTestType,
} from './test';
export {
  createNimaimeRuntime,
  type Nimaime,
  type NimaimeDriver,
  type NimaimeFixtures,
  type StepLocation,
} from './nimaime';
export {
  EXPECTATION_KEYWORDS,
  expectationTitle,
  type ExpectationContext,
  type ExpectationKind,
  type NimaimeExpectation,
  type NimaimePlan,
  type SanmaimePosition,
} from './plan';
export {
  collectFixtureNames,
  fixtureNamesOf,
  validateExpectations,
  validatePlan,
  type PlanFixtures,
} from './resolve';
// Sanmaime specs at run time, for $nimaime.verify() (e.g. from playwright-bdd steps).
export {
  findScreenSpec,
  listScreenSpecs,
  registerScreenSpec,
  resetScreenSpecs,
  screenSpecsFromDocument,
  type ConditionSpec,
  type ElementSpec,
  type ScreenSpec,
} from './spec-registry';
export { loadSanmaimeSpecs, type LoadSanmaimeSpecsOptions } from './specs';
export { planVerify, type VerifyElementPlan, type VerifyOptions, type VerifyPlan } from './verify';
export {
  createExpectationError,
  describeExpected,
  describeLocator,
  detectTimeout,
  formatActual,
  formatExpectationFailure,
  formatFailureDetails,
  formatFailureHeader,
  NimaimeExpectationError,
  parseExpectationFailure,
  probeActual,
  type ExpectationFailureContext,
  type ExpectationFailureJSON,
  type SanmaimeFrame,
} from './failure';
export {
  createHookRunner,
  HOOK_TITLES,
  playwrightHookDriver,
  runHooks,
  type HookDriver,
  type RunHooks,
} from './hooks';
export {
  findCondition,
  findElement,
  findHooks,
  findScreen,
  getRegistry,
  hooksFor,
  listDefinitions,
  resetRegistry,
} from './registry';
export type {
  ConditionDefinition,
  ConditionScopes,
  DefinitionBase,
  DefinitionList,
  ElementDefinition,
  HookDefinition,
  HookSet,
  Registry,
  ScreenDefinition,
} from './registry';
export { NimaimeDefinitionError, NimaimeHookError, NimaimeRuntimeError } from './errors';
export type {
  ElementHookFn,
  ElementHookInfo,
  ElementHookOptions,
  HookInfo,
  HookKind,
  ScreenHookFn,
  ScreenHookInfo,
  ScreenHookOptions,
} from './types';
export type { SourceLocation } from './source';
