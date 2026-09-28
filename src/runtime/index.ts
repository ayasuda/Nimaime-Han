/**
 * nimaime-han/runtime — code imported by generated `.sanmaime-gen/*.spec.ts` files at test time:
 * the `test` with the `$nimaime` fixture (the counterpart of playwright-bdd's `$bddContext`),
 * the definition registry, and the helpers the generator uses to query it.
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
export { collectFixtureNames, fixtureNamesOf, validatePlan, type PlanFixtures } from './resolve';
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
  findCondition,
  findElement,
  findScreen,
  getRegistry,
  listDefinitions,
  resetRegistry,
} from './registry';
export type {
  ConditionDefinition,
  ConditionScopes,
  DefinitionBase,
  DefinitionList,
  ElementDefinition,
  Registry,
  ScreenDefinition,
} from './registry';
export { NimaimeDefinitionError, NimaimeRuntimeError } from './errors';
export type { SourceLocation } from './source';
