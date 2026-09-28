import { joinConditions } from '../parser';
import {
  EXPECTATION_KINDS,
  EXPECTATIONS,
  type ExpectationKind,
  type ExpectationValue,
} from './expectations';

export { expectationTitle, type ExpectationKind, type ExpectationValue } from './expectations';

/** A position in a `.sanmaime` file (1-based). */
export interface SanmaimePosition {
  line: number;
  column: number;
}

/**
 * One expectation of a plan: `Show: X` (`{ kind: 'show', target: 'X' }`), `Enable` (`{ kind:
 * 'enable' }`, the element itself), `Check: X` (`{ kind: 'check', target: 'X' }`),
 * `Text: X = "a"` (`{ kind: 'text', target: 'X', value: 'a' }`), `Count: X = 3` (`value: 3`).
 * See `EXPECTATIONS` (src/runtime/expectations.ts) for every kind.
 */
export interface NimaimeExpectation {
  kind: ExpectationKind;
  /**
   * The target name: required for `show` / `hide` and the value kinds (`text`, `contain`,
   * `count`); for the state kinds (`enable`, `check`, …) the target, or absent for the element
   * itself (its `self` locator).
   */
  target?: string;
  /** The value of `text` / `contain` (a string) and `count` (a number). */
  value?: ExpectationValue;
  /** Position of the expectation line in the `.sanmaime` file. */
  location?: SanmaimePosition;
}

/**
 * What one generated test checks: one Element of one Screen, in the base state (no conditions)
 * or in the state established by a `When:` block's conditions. Emitted by the generator as a
 * literal.
 *
 * Execution order (`$nimaime.run`): open the screen, establish each `background` condition, then
 * each of `conditions`, then check the expectations.
 */
export interface NimaimePlan {
  /** `Screen:` name. */
  screen: string;
  /** `Element:` name. */
  element: string;
  /** The screen's `Background:` condition names, in order (v0.2). */
  background?: readonly string[];
  /**
   * The block's condition names: the `When:` name, then each `And when:` name (v0.2). Omitted
   * (or empty) for the element's unconditional block (the base state). Generated specs use this.
   */
  conditions?: readonly string[];
  /**
   * `When:` name of a single-condition block: the v0.1 form of `conditions: [condition]`, still
   * accepted. Ignored when `conditions` is set.
   */
  condition?: string;
  /** The expectations of the block, in source order. */
  expectations: readonly NimaimeExpectation[];
  /**
   * The `.sanmaime` file. A relative path is resolved against the directory of the running spec
   * file (the generated `.spec.ts`). Used for step locations and failure messages.
   */
  file?: string;
  /** Positions of the `Screen:`, `Element:`, `Background:`, `When:` and `And when:` lines in `file`. */
  locations?: {
    screen?: SanmaimePosition;
    element?: SanmaimePosition;
    /** One position per `background` name. */
    background?: readonly SanmaimePosition[];
    /** One position per `conditions` name. */
    conditions?: readonly SanmaimePosition[];
    /** Position of the `When:` line, with `condition` (v0.1 form). */
    condition?: SanmaimePosition;
  };
}

/** The condition names of a plan's block, in order: `conditions`, else `[condition]`, else `[]`. */
export function planConditions(plan: Pick<NimaimePlan, 'condition' | 'conditions'>): string[] {
  if (plan.conditions !== undefined && plan.conditions.length > 0) return [...plan.conditions];
  return plan.condition === undefined ? [] : [plan.condition];
}

/** Position of the `index`-th condition of a plan's block (`locations.conditions`, else `.condition`). */
export function planConditionLocation(
  plan: Pick<NimaimePlan, 'condition' | 'conditions' | 'locations'>,
  index: number,
): SanmaimePosition | undefined {
  if (plan.conditions !== undefined && plan.conditions.length > 0) {
    return (
      plan.locations?.conditions?.[index] ?? (index === 0 ? plan.locations?.condition : undefined)
    );
  }
  return index === 0 ? plan.locations?.condition : undefined;
}

/**
 * The display name of a plan's block, `A and B` (as in the test title `When: A and B`), or
 * `undefined` for the unconditional block. Used in failure messages (`When: A and B`).
 */
export function planConditionTitle(
  plan: Pick<NimaimePlan, 'condition' | 'conditions'>,
): string | undefined {
  const names = planConditions(plan);
  return names.length === 0 ? undefined : joinConditions(names);
}

/** Context passed to the low-level `Nimaime` methods (for step locations and failure messages). */
export interface ExpectationContext {
  /** `Screen:` name (used to resolve screen-scoped conditions and in failure messages). */
  screen?: string;
  /**
   * `When:` name (`A and B` for a block with `And when:`), if the expectation belongs to a
   * condition block.
   */
  condition?: string;
  /** The `.sanmaime` file (see `NimaimePlan.file`). */
  file?: string;
  /** Position of the expectation line. */
  location?: SanmaimePosition;
}

/** Step title prefixes of the conditions a test establishes (`Background: X`, `And when: Y`). */
export type ConditionStepKeyword = 'Background' | 'When' | 'And when';

/**
 * Keyword of an expectation kind as written in English Sanmaime (the step title prefix), from the
 * vocabulary table (`EXPECTATIONS`).
 */
export const EXPECTATION_KEYWORDS: Readonly<Record<ExpectationKind, string>> = Object.fromEntries(
  EXPECTATION_KINDS.map((kind) => [kind, EXPECTATIONS[kind].keyword]),
) as Record<ExpectationKind, string>;
