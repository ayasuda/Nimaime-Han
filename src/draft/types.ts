/**
 * The observation of a screen (docs/draft.md, "Observation"): what `nimaime draft` saw on a live
 * page, as plain JSON, so that it can be saved (`--observation out.json`) and proposed from again
 * offline, or handed to an LLM adapter.
 */

/** Identifies a saved observation file. */
export const OBSERVATION_FORMAT = 'nimaime-observation';

/** Version of the observation format; bumped on incompatible changes. */
export const OBSERVATION_VERSION = 1;

/**
 * The kind of a region: an HTML landmark (by tag or ARIA role), or `page` for everything outside
 * any landmark.
 */
export type RegionKind =
  | 'header'
  | 'nav'
  | 'main'
  | 'form'
  | 'section'
  | 'aside'
  | 'footer'
  | 'dialog'
  | 'region'
  | 'search'
  | 'page';

/** A landmark (or the synthetic `page` region) that groups observed elements. */
export interface ObservedRegion {
  /** Unique within the observation: `page`, `r1`, `r2`, … in document order. */
  id: string;
  kind: RegionKind;
  /** Tag name of the landmark element (`body` for `page`). */
  tag: string;
  /** Explicit `role` attribute, when the region has one. */
  role?: string;
  /** `aria-label` / `aria-labelledby` text. */
  label?: string;
  /** The HTML `id` (or, for a form, the `name`) attribute. */
  htmlId?: string;
  /** Id of the enclosing region, if the landmark is nested in another one. */
  parent?: string;
}

/** Where an element's accessible name comes from (affects which locator can find it). */
export type NameSource =
  | 'aria-labelledby'
  | 'aria-label'
  | 'label'
  | 'content'
  | 'alt'
  | 'title'
  | 'placeholder'
  | 'value';

/** One interesting element: it has a test id, or an ARIA role with an accessible name. */
export interface ObservedElement {
  /** Value of the test id attribute (`data-testid` by default). */
  testId?: string;
  /** Explicit or implicit ARIA role (`button`, `link`, `textbox`, `heading`, …). */
  role?: string;
  /** Accessible name (approximation of the accname algorithm, whitespace collapsed). */
  name?: string;
  nameSource?: NameSource;
  /** Visible text content (collapsed, at most 80 characters); not recorded for form controls. */
  text?: string;
  /** Lower-case tag name. */
  tag: string;
  /** `type` attribute of an `<input>`. */
  type?: string;
  /** Heading level (1–6) of a heading. */
  level?: number;
  /** Visible in Playwright's sense: a non-empty box and not `visibility: hidden`. */
  visible: boolean;
  /** `false` when the element is disabled (native `disabled`, or `aria-disabled="true"`). */
  enabled: boolean;
  /** Present on controls (elements that can be disabled): whether it is disabled. */
  disabled?: boolean;
  /** Id of the innermost region containing the element. */
  region: string;
}

/** Everything `observeScreen()` collected. JSON-serialisable. */
export interface ScreenObservation {
  format: typeof OBSERVATION_FORMAT;
  version: typeof OBSERVATION_VERSION;
  url: string;
  title: string;
  /** `lang` attribute of `<html>`. */
  lang?: string;
  /** The attribute read as the test id (`page.getByTestId()` must be configured the same). */
  testIdAttribute: string;
  /** Regions in document order; `page` first. Regions without elements are left out. */
  regions: ObservedRegion[];
  /** Elements in document order. */
  elements: ObservedElement[];
  /** `true` when the page had more elements than `maxElements` and the rest were dropped. */
  truncated: boolean;
}
