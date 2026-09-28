import { NimaimeDefinitionError } from './errors';
import { formatSource, sameSource, type SourceLocation } from './source';
import type {
  AnyFixtures,
  AnyTestType,
  ConditionFn,
  HookKind,
  LocatorFn,
  OpenScreenFn,
} from './types';

/** Fields shared by every registered definition. */
export interface DefinitionBase {
  /** The name as written in Sanmaime (`Screen:` / `Element:` / `When:`). */
  name: string;
  /** Call site of the define function, when it could be determined. */
  source: SourceLocation | undefined;
  /** The `test` passed to `createNimaime(test)`, or `undefined` for the default. */
  test: AnyTestType | undefined;
  /** Whether a custom `test` was passed to `createNimaime`. */
  customTest: boolean;
}

/** A `defineScreen` entry. */
export interface ScreenDefinition extends DefinitionBase {
  open: OpenScreenFn<AnyFixtures> | undefined;
}

/** A `defineElement` entry. */
export interface ElementDefinition extends DefinitionBase {
  /** Locator of the Element itself (for `Enable` / `Disable`), if defined. */
  self: LocatorFn<AnyFixtures> | undefined;
  /** Target name -> locator, in definition order. */
  targets: ReadonlyMap<string, LocatorFn<AnyFixtures>>;
}

/** A `defineCondition` entry. */
export interface ConditionDefinition extends DefinitionBase {
  fn: ConditionFn<AnyFixtures>;
  /** The screen the condition is scoped to; `undefined` for a global condition. */
  screen: string | undefined;
}

/** A `beforeScreen` / `afterScreen` / `beforeElement` / `afterElement` entry. */
export interface HookDefinition {
  kind: HookKind;
  /** `(fixtures, info) => unknown`, with its fixture type erased. */
  fn: (fixtures: AnyFixtures, info: AnyFixtures) => unknown;
  /** The screen the hook is restricted to; `undefined` for every screen. */
  screen: string | undefined;
  /** The element the hook is restricted to (element hooks); `undefined` for every element. */
  element: string | undefined;
  /** The tag expression of the hook. Stored, but not applied yet (docs/hooks.md). */
  tags: string | undefined;
  /** Call site of the hook function, when it could be determined. */
  source: SourceLocation | undefined;
  /** The `test` passed to `createNimaime(test)`, or `undefined` for the default. */
  test: AnyTestType | undefined;
  /** Whether a custom `test` was passed to `createNimaime`. */
  customTest: boolean;
}

/** All definitions of one condition name: at most one global and one per screen. */
export interface ConditionScopes {
  global: ConditionDefinition | undefined;
  screens: Map<string, ConditionDefinition>;
}

/** The definition registry (one per process, shared by every copy of this module). */
export interface Registry {
  screens: Map<string, ScreenDefinition>;
  elements: Map<string, ElementDefinition>;
  /** Keyed by condition name. */
  conditions: Map<string, ConditionScopes>;
  /** Hooks, in registration order. */
  hooks: HookDefinition[];
}

// The registry lives on globalThis so that every bundle that includes this module (the main entry,
// `nimaime-han/runtime`, and their ESM and CJS builds) shares one registry per process.
const REGISTRY_KEY = Symbol.for('nimaime-han.registry');

type GlobalWithRegistry = typeof globalThis & { [REGISTRY_KEY]?: Registry };

/** Returns the process-wide registry, creating it on first use. */
export function getRegistry(): Registry {
  const g = globalThis as GlobalWithRegistry;
  g[REGISTRY_KEY] ??= {
    screens: new Map(),
    elements: new Map(),
    conditions: new Map(),
    hooks: [],
  };
  // A registry created by an older copy of this module in the same process has no hooks yet.
  const registry = g[REGISTRY_KEY] as Omit<Registry, 'hooks'> & { hooks?: HookDefinition[] };
  registry.hooks ??= [];
  return g[REGISTRY_KEY];
}

/** Removes every definition (for tests). */
export function resetRegistry(): void {
  const registry = getRegistry();
  registry.screens.clear();
  registry.elements.clear();
  registry.conditions.clear();
  registry.hooks.length = 0;
}

// ---------------------------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------------------------

/** Registers a screen; throws on a conflicting duplicate, ignores an equivalent one. */
export function registerScreen(def: ScreenDefinition): void {
  const { screens } = getRegistry();
  const existing = screens.get(def.name);
  if (existing) {
    if (sameSource(existing.source, def.source) || existing.open === def.open) return;
    throw duplicateError('screen', `"${def.name}"`, existing, def);
  }
  screens.set(def.name, def);
}

/** Registers an element; throws on a conflicting duplicate, ignores an equivalent one. */
export function registerElement(def: ElementDefinition): void {
  const { elements } = getRegistry();
  const existing = elements.get(def.name);
  if (existing) {
    if (sameSource(existing.source, def.source) || sameElement(existing, def)) return;
    throw duplicateError('element', `"${def.name}"`, existing, def);
  }
  elements.set(def.name, def);
}

/** Registers a condition in its scope; throws on a conflicting duplicate, ignores an equivalent one. */
export function registerCondition(def: ConditionDefinition): void {
  const { conditions } = getRegistry();
  let scopes = conditions.get(def.name);
  if (!scopes) {
    scopes = { global: undefined, screens: new Map() };
    conditions.set(def.name, scopes);
  }
  const existing = def.screen === undefined ? scopes.global : scopes.screens.get(def.screen);
  if (existing) {
    if (sameSource(existing.source, def.source) || existing.fn === def.fn) return;
    const scope = def.screen === undefined ? 'global' : `screen "${def.screen}"`;
    throw duplicateError('condition', `"${def.name}" (${scope})`, existing, def);
  }
  if (def.screen === undefined) scopes.global = def;
  else scopes.screens.set(def.screen, def);
}

/**
 * Registers a hook. Any number of hooks may apply to the same scope; they run in registration
 * order. Registering the same hook again (the same call site evaluated again, or the same function
 * with the same kind and scope) is ignored.
 */
export function registerHook(def: HookDefinition): void {
  const { hooks } = getRegistry();
  const equivalent = hooks.some(
    (existing) =>
      existing.kind === def.kind &&
      (sameSource(existing.source, def.source) ||
        (existing.fn === def.fn &&
          existing.screen === def.screen &&
          existing.element === def.element &&
          existing.tags === def.tags)),
  );
  if (!equivalent) hooks.push(def);
}

function sameElement(a: ElementDefinition, b: ElementDefinition): boolean {
  if (a.self !== b.self || a.targets.size !== b.targets.size) return false;
  for (const [target, fn] of a.targets) {
    if (b.targets.get(target) !== fn) return false;
  }
  return true;
}

function duplicateError(
  kind: string,
  label: string,
  existing: DefinitionBase,
  duplicate: DefinitionBase,
): NimaimeDefinitionError {
  return new NimaimeDefinitionError(
    `Duplicate ${kind} definition ${label}.\n` +
      `  First defined at ${formatSource(existing.source)}\n` +
      `  Defined again at ${formatSource(duplicate.source)}`,
  );
}

// ---------------------------------------------------------------------------------------------
// Queries (used by the generator and the runtime)
// ---------------------------------------------------------------------------------------------

/** The screen definition named `name`, if any. */
export function findScreen(name: string): ScreenDefinition | undefined {
  return getRegistry().screens.get(name);
}

/** The element definition named `name`, if any. Element definitions are global by name. */
export function findElement(name: string): ElementDefinition | undefined {
  return getRegistry().elements.get(name);
}

/**
 * The condition named `name` as seen from `screen`: the definition scoped to that screen if there
 * is one, otherwise the global definition. Without `screen`, only global conditions are found.
 */
export function findCondition(
  name: string,
  options: { screen?: string } = {},
): ConditionDefinition | undefined {
  const scopes = getRegistry().conditions.get(name);
  if (!scopes) return undefined;
  const scoped = options.screen === undefined ? undefined : scopes.screens.get(options.screen);
  return scoped ?? scopes.global;
}

/** The hooks that run around one Screen `describe` or one Element's tests, in execution order. */
export interface HookSet {
  /** `beforeScreen` / `beforeElement` hooks: global first, then screen-, then element-scoped. */
  before: HookDefinition[];
  /** `afterScreen` / `afterElement` hooks: the reverse (element-scoped first, global last). */
  after: HookDefinition[];
}

function sameName(a: string | undefined, b: string | undefined): boolean {
  return a === undefined || a.trim() === b?.trim();
}

/** 0 = global, 1 = screen, 2 = element, 3 = screen and element. */
function specificity(hook: HookDefinition): number {
  return (hook.screen === undefined ? 0 : 1) + (hook.element === undefined ? 0 : 2);
}

/**
 * The hooks of `kind` that apply to `screen` (and `element`, for element hooks), in execution
 * order: `before*` hooks from the least to the most specific scope (global, screen, element,
 * screen + element), in registration order within a scope; `after*` hooks in the reverse order.
 * Names are compared after `trim()`, like Sanmaime names are matched to definitions.
 */
export function findHooks(
  kind: HookKind,
  scope: { screen: string; element?: string | undefined },
): HookDefinition[] {
  const matching = getRegistry()
    .hooks.filter(
      (hook) =>
        hook.kind === kind &&
        sameName(hook.screen, scope.screen) &&
        sameName(hook.element, scope.element),
    )
    .map((hook, index) => ({ hook, index }))
    .sort((a, b) => specificity(a.hook) - specificity(b.hook) || a.index - b.index)
    .map(({ hook }) => hook);
  return kind.startsWith('after') ? matching.reverse() : matching;
}

/**
 * The hooks around `screen` (`beforeScreen` / `afterScreen`) or, with `element`, around the tests
 * of that element in that screen (`beforeElement` / `afterElement`), in execution order.
 */
export function hooksFor(screen: string, element?: string): HookSet {
  return element === undefined
    ? {
        before: findHooks('beforeScreen', { screen }),
        after: findHooks('afterScreen', { screen }),
      }
    : {
        before: findHooks('beforeElement', { screen, element }),
        after: findHooks('afterElement', { screen, element }),
      };
}

/** Every registered definition. */
export interface DefinitionList {
  /** In registration order. */
  screens: ScreenDefinition[];
  /** In registration order. */
  elements: ElementDefinition[];
  /**
   * Global and screen-scoped conditions (see `ConditionDefinition.screen`), grouped by name in
   * order of first registration; within a name the global definition comes first.
   */
  conditions: ConditionDefinition[];
}

/** Lists every registered definition (e.g. to report unused definitions or build snippets). */
export function listDefinitions(): DefinitionList {
  const registry = getRegistry();
  const conditions: ConditionDefinition[] = [];
  for (const scopes of registry.conditions.values()) {
    if (scopes.global) conditions.push(scopes.global);
    conditions.push(...scopes.screens.values());
  }
  return {
    screens: [...registry.screens.values()],
    elements: [...registry.elements.values()],
    conditions,
  };
}
