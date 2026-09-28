/**
 * Matching parsed Sanmaime documents against loaded definitions (the counterpart of playwright-bdd
 * matching Gherkin steps against step definitions).
 *
 * Names are matched exactly after `trim()` on both sides (Sanmaime names and definition names).
 * The result is a resolved model the code generator consumes directly, plus reports of missing and
 * unused definitions. See docs/definitions.md, "Definition loading and matching".
 */
import {
  CONDITION_SEPARATOR,
  type Expectation,
  type Location,
  type StateExpectation,
  type Tag,
  type VisibilityExpectation,
} from '../parser';
import type { SourceLocation } from '../runtime/source';
import type {
  ConditionDefinition,
  ElementDefinition,
  Registry,
  ScreenDefinition,
} from '../runtime/registry';
import { hasErrors, type ParsedSpec } from './load-specs';

/** `Show:` / `Hide:` / `And:` with its target resolved against the element definition. */
export interface ResolvedVisibilityExpectation {
  kind: 'show' | 'hide';
  target: string;
  keyword: 'Show' | 'Hide' | 'And';
  viaAnd: boolean;
  /** Whether the element definition maps `target` to a locator. */
  targetDefined: boolean;
  location: Location;
}

/** `Enable` / `Disable` with the element's `self` locator resolved. */
export interface ResolvedStateExpectation {
  kind: 'enable' | 'disable';
  keyword: 'Enable' | 'Disable';
  /** Whether the element definition has a `self` locator. */
  selfDefined: boolean;
  location: Location;
}

export type ResolvedExpectation = ResolvedVisibilityExpectation | ResolvedStateExpectation;

/**
 * A condition name resolved to its definition (screen-scoped first, then global): a
 * `Background:` line, or the `When:` / an `And when:` line of a block.
 */
export interface ResolvedConditionRef {
  name: string;
  location: Location;
  definition: ConditionDefinition | undefined;
}

/** `When: <name>` (plus its `And when:` lines) resolved to the condition definitions. */
export interface ResolvedCondition {
  /** The primary condition (`When:`): `conditions[0].name`. */
  name: string;
  /** The block's display name, `A and B` (the test title is `When: <title>`). */
  title: string;
  /** Tags written before `When:` (block-level tags). */
  tags: Tag[];
  location: Location;
  /** The definition of the primary condition: `conditions[0].definition`. */
  definition: ConditionDefinition | undefined;
  /** Every condition of the block, in execution order (`When:`, then each `And when:`). */
  conditions: ResolvedConditionRef[];
  expectations: ResolvedExpectation[];
}

/** `Element: <name>` resolved to its definition. */
export interface ResolvedElement {
  name: string;
  tags: Tag[];
  location: Location;
  definition: ElementDefinition | undefined;
  unconditional: ResolvedExpectation[];
  conditions: ResolvedCondition[];
}

/** `Screen: <name>` resolved to its definition. */
export interface ResolvedScreen {
  name: string;
  tags: Tag[];
  location: Location;
  /** Absolute path of the `.sanmaime` file. */
  file: string;
  /** `undefined` is allowed: the screen then has no `open` (see `MissingDefinition`). */
  definition: ScreenDefinition | undefined;
  /** The screen's `Background:` conditions, in order (established before every block's own). */
  background: ResolvedConditionRef[];
  elements: ResolvedElement[];
}

/** One `.sanmaime` file, resolved. */
export interface ResolvedDocument {
  spec: ParsedSpec;
  /** Absolute path of the `.sanmaime` file. */
  file: string;
  /** `spec.document.uri`: the path relative to the config directory. */
  uri: string;
  screens: ResolvedScreen[];
}

/** What kind of definition is missing. */
export type MissingDefinitionKind = 'screen' | 'element' | 'target' | 'self' | 'condition';

/**
 * A name used in a spec that no definition provides.
 *
 * - `screen` has severity `info`: a screen without `defineScreen` is allowed (it just has no `open`).
 * - `element`, `target`, `self` and `condition` have severity `error`: the spec cannot run.
 *   `target` / `self` are only reported for elements that are defined (a missing element is
 *   reported once, as `element`).
 *
 * Each (kind, file, screen, element, name) is reported once, at its first occurrence.
 */
export interface MissingDefinition {
  kind: MissingDefinitionKind;
  severity: 'error' | 'info';
  /** The screen the name is used in. */
  screen: string;
  /**
   * The element the name is used in (for `element`, `target`, `self` and `condition`); not set
   * for a condition used by the screen's `Background:`.
   */
  element?: string;
  /** The missing name: the screen, element, target or condition name (the element name for `self`). */
  name: string;
  /** Absolute path of the `.sanmaime` file. */
  file: string;
  /** Location of the first use in `file`. */
  location: Location;
}

/** What kind of definition is unused. */
export type UnusedDefinitionKind = 'screen' | 'element' | 'target' | 'condition';

/** A definition (or an element target) that no matched spec references. */
export interface UnusedDefinition {
  kind: UnusedDefinitionKind;
  /** The screen, element, target or condition name. */
  name: string;
  /** For `target`: the element the target belongs to. */
  element?: string;
  /** For a screen-scoped `condition`: its screen. */
  screen?: string;
  /** Where the definition was made. */
  source: SourceLocation | undefined;
}

export interface MatchResult {
  /** Resolved documents, for every spec without error diagnostics, in input order. */
  documents: ResolvedDocument[];
  /** Specs skipped because they have error diagnostics (they must not be generated). */
  skipped: ParsedSpec[];
  missing: MissingDefinition[];
  unused: UnusedDefinition[];
}

/** Registry lookups by trimmed name. */
interface Lookup {
  screens: Map<string, ScreenDefinition>;
  elements: Map<string, ElementDefinition>;
  /** Element definition -> trimmed target name -> target name as defined. */
  targets: Map<ElementDefinition, Map<string, string>>;
  globalConditions: Map<string, ConditionDefinition>;
  /** Trimmed screen name -> trimmed condition name -> definition. */
  scopedConditions: Map<string, Map<string, ConditionDefinition>>;
}

function buildLookup(registry: Registry): Lookup {
  const lookup: Lookup = {
    screens: new Map(),
    elements: new Map(),
    targets: new Map(),
    globalConditions: new Map(),
    scopedConditions: new Map(),
  };
  // The first definition wins if two names differ only in surrounding whitespace.
  for (const def of registry.screens.values()) setOnce(lookup.screens, def.name.trim(), def);
  for (const def of registry.elements.values()) {
    setOnce(lookup.elements, def.name.trim(), def);
    const targets = new Map<string, string>();
    for (const target of def.targets.keys()) setOnce(targets, target.trim(), target);
    lookup.targets.set(def, targets);
  }
  for (const scopes of registry.conditions.values()) {
    if (scopes.global) setOnce(lookup.globalConditions, scopes.global.name.trim(), scopes.global);
    for (const [screen, def] of scopes.screens) {
      const key = screen.trim();
      let byName = lookup.scopedConditions.get(key);
      if (!byName) {
        byName = new Map();
        lookup.scopedConditions.set(key, byName);
      }
      setOnce(byName, def.name.trim(), def);
    }
  }
  return lookup;
}

function isVisibility(expectation: Expectation): expectation is VisibilityExpectation {
  return expectation.kind === 'show' || expectation.kind === 'hide';
}

function setOnce<K, V>(map: Map<K, V>, key: K, value: V): void {
  if (!map.has(key)) map.set(key, value);
}

/**
 * Resolves every name of `specs` against `registry` (e.g. from `loadDefinitions()`).
 *
 * Specs with error diagnostics are not matched (they are returned in `skipped`).
 */
export function matchSpecs(specs: readonly ParsedSpec[], registry: Registry): MatchResult {
  const lookup = buildLookup(registry);
  const used = new Set<object>();
  /** Element definition -> original target names referenced by some spec. */
  const usedTargets = new Map<ElementDefinition, Set<string>>();
  const missing: MissingDefinition[] = [];
  const missingKeys = new Set<string>();
  const documents: ResolvedDocument[] = [];
  const skipped: ParsedSpec[] = [];

  const reportMissing = (entry: MissingDefinition): void => {
    const key = JSON.stringify([entry.kind, entry.file, entry.screen, entry.element, entry.name]);
    if (missingKeys.has(key)) return;
    missingKeys.add(key);
    missing.push(entry);
  };

  for (const spec of specs) {
    if (hasErrors(spec)) {
      skipped.push(spec);
      continue;
    }
    const { file } = spec;
    const screens = spec.document.screens.map((screen): ResolvedScreen => {
      const screenName = screen.name.trim();
      const screenDef = lookup.screens.get(screenName);
      if (screenDef) used.add(screenDef);
      else {
        reportMissing({
          kind: 'screen',
          severity: 'info',
          screen: screenName,
          name: screenName,
          file,
          location: screen.location,
        });
      }

      /** Resolves a condition name used in this screen (by `element`, or by the background). */
      const resolveConditionRef = (
        ref: { name: string; location: Location },
        element: string | undefined,
      ): ResolvedConditionRef => {
        const conditionName = ref.name.trim();
        const conditionDef =
          lookup.scopedConditions.get(screenName)?.get(conditionName) ??
          lookup.globalConditions.get(conditionName);
        if (conditionDef) used.add(conditionDef);
        else {
          reportMissing({
            kind: 'condition',
            severity: 'error',
            screen: screenName,
            ...(element === undefined ? {} : { element }),
            name: conditionName,
            file,
            location: ref.location,
          });
        }
        return { name: conditionName, location: ref.location, definition: conditionDef };
      };
      const background = screen.background.map((entry) => resolveConditionRef(entry, undefined));

      const elements = screen.elements.map((element): ResolvedElement => {
        const elementName = element.name.trim();
        const elementDef = lookup.elements.get(elementName);
        if (elementDef) used.add(elementDef);
        else {
          reportMissing({
            kind: 'element',
            severity: 'error',
            screen: screenName,
            element: elementName,
            name: elementName,
            file,
            location: element.location,
          });
        }
        const targets = elementDef ? lookup.targets.get(elementDef) : undefined;

        const resolveExpectation = (expectation: Expectation): ResolvedExpectation =>
          isVisibility(expectation) ? resolveVisibility(expectation) : resolveState(expectation);

        const resolveVisibility = (
          expectation: VisibilityExpectation,
        ): ResolvedVisibilityExpectation => {
          const target = expectation.target.trim();
          const original = targets?.get(target);
          if (elementDef && original !== undefined) {
            let set = usedTargets.get(elementDef);
            if (!set) {
              set = new Set();
              usedTargets.set(elementDef, set);
            }
            set.add(original);
          } else if (elementDef) {
            reportMissing({
              kind: 'target',
              severity: 'error',
              screen: screenName,
              element: elementName,
              name: target,
              file,
              location: expectation.location,
            });
          }
          return {
            kind: expectation.kind,
            target,
            keyword: expectation.keyword,
            viaAnd: expectation.viaAnd,
            targetDefined: original !== undefined,
            location: expectation.location,
          };
        };

        const resolveState = (expectation: StateExpectation): ResolvedStateExpectation => {
          const selfDefined = elementDef?.self !== undefined;
          if (elementDef && !selfDefined) {
            reportMissing({
              kind: 'self',
              severity: 'error',
              screen: screenName,
              element: elementName,
              name: elementName,
              file,
              location: expectation.location,
            });
          }
          return {
            kind: expectation.kind,
            keyword: expectation.keyword,
            selfDefined,
            location: expectation.location,
          };
        };

        const conditions = element.conditions.map((condition): ResolvedCondition => {
          const resolved = condition.conditions.map((ref) => resolveConditionRef(ref, elementName));
          const [primary] = resolved;
          return {
            name: primary?.name ?? condition.name.trim(),
            title: resolved.map((ref) => ref.name).join(CONDITION_SEPARATOR),
            tags: condition.tags,
            location: condition.location,
            definition: primary?.definition,
            conditions: resolved,
            expectations: condition.expectations.map(resolveExpectation),
          };
        });

        return {
          name: elementName,
          tags: element.tags,
          location: element.location,
          definition: elementDef,
          unconditional: element.unconditional.map(resolveExpectation),
          conditions,
        };
      });

      return {
        name: screenName,
        tags: screen.tags,
        location: screen.location,
        file,
        definition: screenDef,
        background,
        elements,
      };
    });
    documents.push({ spec, file, uri: spec.document.uri ?? file, screens });
  }

  return { documents, skipped, missing, unused: findUnused(registry, used, usedTargets) };
}

function findUnused(
  registry: Registry,
  used: ReadonlySet<object>,
  usedTargets: ReadonlyMap<ElementDefinition, ReadonlySet<string>>,
): UnusedDefinition[] {
  const unused: UnusedDefinition[] = [];
  for (const def of registry.screens.values()) {
    if (!used.has(def)) unused.push({ kind: 'screen', name: def.name, source: def.source });
  }
  for (const def of registry.elements.values()) {
    if (!used.has(def)) {
      unused.push({ kind: 'element', name: def.name, source: def.source });
      continue;
    }
    const targetsUsed = usedTargets.get(def);
    for (const target of def.targets.keys()) {
      if (!targetsUsed?.has(target)) {
        unused.push({ kind: 'target', name: target, element: def.name, source: def.source });
      }
    }
  }
  for (const scopes of registry.conditions.values()) {
    const defs = [...(scopes.global ? [scopes.global] : []), ...scopes.screens.values()];
    for (const def of defs) {
      if (used.has(def)) continue;
      unused.push({
        kind: 'condition',
        name: def.name,
        ...(def.screen === undefined ? {} : { screen: def.screen }),
        source: def.source,
      });
    }
  }
  return unused;
}
