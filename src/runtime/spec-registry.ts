/**
 * The Sanmaime spec registry: the expectations of each `Screen:`, available at run time.
 *
 * Generated specs carry their expectations as literal plans, so they never need this registry.
 * `$nimaime.verify()` does: it is called from hand-written code (typically a playwright-bdd `Then`
 * step) with a screen name only, and looks the expectations up here. The registry is filled by
 * `loadSanmaimeSpecs()` (reads and parses `.sanmaime` files) or directly with `registerScreenSpec()`.
 */
import type { ConditionBlock, Element, Expectation, SanmaimeDocument } from '../parser';
import { NimaimeDefinitionError } from './errors';
import type { NimaimeExpectation, SanmaimePosition } from './plan';

/** One `When:` block of an element. */
export interface ConditionSpec {
  /** The `When:` name. */
  name: string;
  /** Position of the `When:` line. */
  location?: SanmaimePosition;
  /** The block's expectations, in source order. */
  expectations: readonly NimaimeExpectation[];
}

/** One `Element:` of a screen. */
export interface ElementSpec {
  /** The `Element:` name. */
  element: string;
  /** Position of the `Element:` line. */
  location?: SanmaimePosition;
  /** Expectations before the first `When:` — invariants that hold in every state of the screen. */
  unconditional: readonly NimaimeExpectation[];
  /** `When:` blocks, in source order. */
  conditions: readonly ConditionSpec[];
}

/** The expectations of one `Screen:`. */
export interface ScreenSpec {
  /** The `Screen:` name. */
  screen: string;
  /**
   * The `.sanmaime` file (absolute, or relative to the running test file). Used for step
   * locations and failure messages; also identifies the registration (see `registerScreenSpec`).
   */
  file?: string;
  /** Position of the `Screen:` line. */
  location?: SanmaimePosition;
  /** Elements, in source order. */
  elements: readonly ElementSpec[];
}

// Lives on globalThis like the definition registry, so that every bundle (ESM / CJS, main entry /
// runtime) shares one spec registry per process.
const SPECS_KEY = Symbol.for('nimaime-han.specs');

type GlobalWithSpecs = typeof globalThis & { [SPECS_KEY]?: Map<string, ScreenSpec> };

function specs(): Map<string, ScreenSpec> {
  const g = globalThis as GlobalWithSpecs;
  g[SPECS_KEY] ??= new Map();
  return g[SPECS_KEY];
}

/**
 * Registers the expectations of a screen for `$nimaime.verify()`.
 *
 * Registering a screen again from the same `file` (or again without a `file`) replaces the
 * previous entry, so loading the same files twice is harmless. Registering a screen name that is
 * already registered from another file throws a `NimaimeDefinitionError` (screen names should be
 * unique within a project).
 */
export function registerScreenSpec(spec: ScreenSpec): void {
  const name = spec.screen.trim();
  if (name === '') throw new NimaimeDefinitionError('A screen spec needs a screen name.');
  const registry = specs();
  const existing = registry.get(name);
  if (existing && existing.file !== spec.file) {
    throw new NimaimeDefinitionError(
      `Duplicate Sanmaime screen "${name}".\n` +
        `  First registered from ${existing.file ?? '(no file)'}\n` +
        `  Registered again from ${spec.file ?? '(no file)'}`,
    );
  }
  registry.set(name, { ...spec, screen: name });
}

/** The registered spec of the screen named `name`, if any. */
export function findScreenSpec(name: string): ScreenSpec | undefined {
  return specs().get(name.trim());
}

/** Every registered screen spec, in registration order. */
export function listScreenSpecs(): ScreenSpec[] {
  return [...specs().values()];
}

/** Removes every registered screen spec (for tests). */
export function resetScreenSpecs(): void {
  specs().clear();
}

/**
 * Converts a parsed document to screen specs (one per `Screen:`), with `file` set on each. The
 * caller must refuse documents with error diagnostics first.
 */
export function screenSpecsFromDocument(document: SanmaimeDocument, file?: string): ScreenSpec[] {
  return document.screens.map((screen) => ({
    screen: screen.name.trim(),
    ...(file === undefined ? {} : { file }),
    location: position(screen.location),
    elements: screen.elements.map(elementSpec),
  }));
}

function elementSpec(element: Element): ElementSpec {
  return {
    element: element.name.trim(),
    location: position(element.location),
    unconditional: element.unconditional.map(expectationOf),
    conditions: element.conditions.map(conditionSpec),
  };
}

function conditionSpec(block: ConditionBlock): ConditionSpec {
  return {
    name: block.name.trim(),
    location: position(block.location),
    expectations: block.expectations.map(expectationOf),
  };
}

function expectationOf(expectation: Expectation): NimaimeExpectation {
  return expectation.kind === 'show' || expectation.kind === 'hide'
    ? {
        kind: expectation.kind,
        target: expectation.target.trim(),
        location: position(expectation.location),
      }
    : { kind: expectation.kind, location: position(expectation.location) };
}

function position(location: SanmaimePosition): SanmaimePosition {
  return { line: location.line, column: location.column };
}
