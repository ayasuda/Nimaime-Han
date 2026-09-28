/**
 * nimaime-han/runtime — code imported by generated `.sanmaime-gen/*.spec.ts` files at test time
 * (the definition registry, hooks, assertion helpers built on `@playwright/test`).
 *
 * TODO(#10): export the `test` with the `$nimaime` fixture.
 */
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
export { NimaimeDefinitionError } from './errors';
export type { SourceLocation } from './source';
