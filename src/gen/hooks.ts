/**
 * Hooks at generation time (docs/hooks.md): which `beforeScreen` / `afterScreen` /
 * `beforeElement` / `afterElement` hooks apply to each Screen and Element of a resolved document,
 * and which fixtures the generated `test.beforeAll` / `test.beforeEach` / … must destructure for
 * them. Computed from the registry (after `loadDefinitions()`) by `nimaime-gen` and passed to
 * `generateSpecFile()` as data, so that the generator itself stays pure.
 */
import { fixtureNamesOf } from '../runtime/resolve';
import { hooksFor, type HookDefinition } from '../runtime/registry';
import { formatSource } from '../runtime/source';
import type { ResolvedDocument } from './match';

/** Fixture requested by a screen hook whose fixtures cannot be determined (worker-scoped). */
export const SCREEN_HOOK_FALLBACK_FIXTURE = 'browser';

/** Fixture requested by an element hook whose fixtures cannot be determined. */
export const ELEMENT_HOOK_FALLBACK_FIXTURE = 'page';

/** One generated hook (`test.beforeAll`, `test.afterEach`, …) and the fixtures it destructures. */
export interface HookCall {
  /** Fixture names the hooks destructure, sorted (the fallback fixture included if needed). */
  fixtures: string[];
  /** Hooks whose first parameter is not destructured, e.g. `beforeElement hook (hooks.ts:3:1)`. */
  unknown: string[];
  /** The fixture requested for the `unknown` hooks. */
  fallback: string;
}

/** The generated hooks of one scope; a side is absent when no hook of that kind applies. */
export interface HookUsage {
  before?: HookCall;
  after?: HookCall;
}

/** The hooks of one Screen `describe` and of each of its Element `describe`s (by name). */
export interface ScreenHookUsage extends HookUsage {
  elements: Map<string, HookUsage>;
}

/** The hooks of a document, by Screen name (the name as written in the spec). */
export type DocumentHooks = Map<string, ScreenHookUsage>;

function hookCall(hooks: readonly HookDefinition[], fallback: string): HookCall | undefined {
  if (hooks.length === 0) return undefined;
  const names = new Set<string>();
  const unknown: string[] = [];
  for (const hook of hooks) {
    const found = fixtureNamesOf(hook.fn);
    if (found === undefined) unknown.push(`${hook.kind} hook (${formatSource(hook.source)})`);
    else for (const name of found) names.add(name);
  }
  if (unknown.length > 0) names.add(fallback);
  names.delete('$nimaime');
  return { fixtures: [...names].sort(), unknown: [...new Set(unknown)], fallback };
}

function usage(
  set: { before: HookDefinition[]; after: HookDefinition[] },
  fallback: string,
): HookUsage {
  const result: HookUsage = {};
  const before = hookCall(set.before, fallback);
  const after = hookCall(set.after, fallback);
  if (before) result.before = before;
  if (after) result.after = after;
  return result;
}

/** Whether a scope has any generated hook. */
export function hasHooks(scope: HookUsage | undefined): boolean {
  return scope?.before !== undefined || scope?.after !== undefined;
}

/**
 * The hooks that apply to each Screen and Element of `doc`, looked up in the process-wide registry
 * (`hooksFor`). Screens and elements without hooks are left out.
 */
export function documentHooks(doc: ResolvedDocument): DocumentHooks {
  const result: DocumentHooks = new Map();
  for (const screen of doc.screens) {
    const screenUsage: ScreenHookUsage = {
      ...usage(hooksFor(screen.name), SCREEN_HOOK_FALLBACK_FIXTURE),
      elements: new Map(),
    };
    for (const element of screen.elements) {
      const elementUsage = usage(
        hooksFor(screen.name, element.name),
        ELEMENT_HOOK_FALLBACK_FIXTURE,
      );
      if (hasHooks(elementUsage)) screenUsage.elements.set(element.name, elementUsage);
    }
    if (hasHooks(screenUsage) || screenUsage.elements.size > 0) {
      result.set(screen.name, screenUsage);
    }
  }
  return result;
}
