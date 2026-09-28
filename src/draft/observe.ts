/**
 * The observation phase of `nimaime draft` (docs/draft.md): collect the landmarks of a live page
 * and, inside them, the elements a specification can talk about — elements with a test id, and
 * elements with an ARIA role and an accessible name.
 *
 * Everything is collected by one `page.evaluate()` call. The in-page code is plain JavaScript kept
 * in a string (this package is type-checked without the DOM library); it approximates Playwright's
 * role, accessible-name, visibility and enabled-state rules, which is enough to propose names and
 * locators that a human then reviews. The end-to-end tests in test/e2e/draft run it in Chromium.
 */
import type { Page } from '@playwright/test';
import {
  OBSERVATION_FORMAT,
  OBSERVATION_VERSION,
  type ObservedElement,
  type ObservedRegion,
  type ScreenObservation,
} from './types';

export interface ObserveOptions {
  /** Attribute read as the test id. Default: `data-testid` (Playwright's default). */
  testIdAttribute?: string;
  /** At most this many elements are recorded (the observation says `truncated`). Default: 500. */
  maxElements?: number;
}

interface InPageResult {
  url: string;
  title: string;
  lang: string;
  regions: ObservedRegion[];
  elements: ObservedElement[];
  truncated: boolean;
}

/**
 * The in-page collector: `(options) => InPageResult`. Kept free of closures over Node values so it
 * can be serialised into the page.
 */
export const OBSERVE_SCRIPT = String.raw`(options) => {
  const TEST_ID = options.testIdAttribute;
  const MAX = options.maxElements;
  const INTERESTING_ROLES = new Set([
    'button', 'link', 'textbox', 'searchbox', 'checkbox', 'radio', 'combobox', 'listbox',
    'spinbutton', 'slider', 'switch', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
    'heading', 'img', 'alert', 'status', 'progressbar', 'meter', 'option', 'treeitem',
  ]);
  // Roles whose descendants are part of the element itself (recorded only with a test id).
  const LEAF_ROLES = new Set([
    'button', 'link', 'textbox', 'searchbox', 'checkbox', 'radio', 'combobox', 'listbox',
    'spinbutton', 'slider', 'switch', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
    'heading', 'img', 'option', 'treeitem',
  ]);
  const NAME_FROM_CONTENT = new Set([
    'button', 'link', 'heading', 'checkbox', 'radio', 'switch', 'tab', 'menuitem',
    'menuitemcheckbox', 'menuitemradio', 'option', 'treeitem', 'cell', 'columnheader',
    'rowheader', 'tooltip',
  ]);
  const WIDGET_ROLES = new Set([
    'button', 'textbox', 'searchbox', 'checkbox', 'radio', 'combobox', 'listbox', 'spinbutton',
    'slider', 'switch', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option',
    'treeitem', 'link',
  ]);
  const REGION_ROLES = {
    banner: 'header', navigation: 'nav', main: 'main', form: 'form', region: 'region',
    complementary: 'aside', contentinfo: 'footer', dialog: 'dialog', alertdialog: 'dialog',
    search: 'search',
  };
  const REGION_TAGS = {
    header: 'header', nav: 'nav', main: 'main', form: 'form', aside: 'aside', footer: 'footer',
    dialog: 'dialog', search: 'search',
  };
  const SKIP_TAGS = new Set(['script', 'style', 'template', 'noscript', 'head', 'meta', 'link']);

  const collapse = (text) => (text || '').replace(/\s+/g, ' ').trim();
  const clip = (text) => (text.length > 80 ? text.slice(0, 79) + '…' : text);

  const isRendered = (el) => {
    const style = getComputedStyle(el);
    return style.display !== 'none';
  };

  // Playwright: visible = non-empty bounding box and visibility: visible.
  const isVisible = (el) => {
    const style = getComputedStyle(el);
    if (style.display === 'contents') {
      for (const child of el.children) if (isVisible(child)) return true;
      return false;
    }
    if (style.visibility !== 'visible') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const explicitRole = (el) => {
    const value = (el.getAttribute('role') || '').trim().split(/\s+/)[0];
    return value ? value.toLowerCase() : undefined;
  };

  const inputRole = (el) => {
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    switch (type) {
      case 'checkbox': return 'checkbox';
      case 'radio': return 'radio';
      case 'button': case 'submit': case 'reset': case 'image': return 'button';
      case 'range': return 'slider';
      case 'number': return 'spinbutton';
      case 'search': return el.hasAttribute('list') ? 'combobox' : 'searchbox';
      case 'email': case 'tel': case 'text': case 'url':
        return el.hasAttribute('list') ? 'combobox' : 'textbox';
      default: return undefined; // password, date, file, color, hidden, …
    }
  };

  const implicitRole = (el) => {
    const tag = el.localName;
    switch (tag) {
      case 'a': case 'area': return el.hasAttribute('href') ? 'link' : undefined;
      case 'button': return 'button';
      case 'input': return inputRole(el);
      case 'select':
        return el.multiple || el.size > 1 ? 'listbox' : 'combobox';
      case 'textarea': return 'textbox';
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': return 'heading';
      case 'img': return el.getAttribute('alt') === '' ? 'presentation' : 'img';
      case 'progress': return 'progressbar';
      case 'meter': return 'meter';
      case 'output': return 'status';
      case 'option': return 'option';
      case 'dialog': return 'dialog';
      default: return undefined;
    }
  };

  const roleOf = (el) => explicitRole(el) || implicitRole(el);

  const isFormControl = (el) =>
    ['input', 'select', 'textarea', 'button', 'meter', 'progress', 'output'].includes(el.localName);

  // Text of a subtree for name computation: rendered text, <img alt>, without nested controls'
  // values (a label wrapping its input).
  const textOf = (node, skip) => {
    let out = '';
    for (const child of node.childNodes) {
      if (child.nodeType === 3) { out += child.nodeValue; continue; }
      if (child.nodeType !== 1) continue;
      if (skip && skip(child)) continue;
      if (SKIP_TAGS.has(child.localName)) continue;
      if (child.getAttribute('aria-hidden') === 'true' || !isRendered(child)) continue;
      if (child.localName === 'img') { out += ' ' + (child.getAttribute('alt') || '') + ' '; continue; }
      if (['input', 'select', 'textarea'].includes(child.localName)) continue;
      const block = getComputedStyle(child).display !== 'inline';
      out += (block ? ' ' : '') + textOf(child, skip) + (block ? ' ' : '');
    }
    return out;
  };

  const byIds = (el, attr) => {
    const ids = (el.getAttribute(attr) || '').trim().split(/\s+/).filter(Boolean);
    const root = el.getRootNode();
    return collapse(
      ids.map((id) => {
        const target = root.getElementById ? root.getElementById(id) : document.getElementById(id);
        return target ? (target.getAttribute('aria-label') || textOf(target)) : '';
      }).join(' '),
    );
  };

  const nameOf = (el, role) => {
    if (el.hasAttribute('aria-labelledby')) {
      const text = byIds(el, 'aria-labelledby');
      if (text) return [text, 'aria-labelledby'];
    }
    const aria = collapse(el.getAttribute('aria-label'));
    if (aria) return [aria, 'aria-label'];
    const tag = el.localName;
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (tag === 'input' && ['button', 'submit', 'reset'].includes(type)) {
      const value = collapse(el.value);
      if (value) return [value, 'value'];
      if (type === 'submit') return ['Submit', 'value'];
      if (type === 'reset') return ['Reset', 'value'];
    }
    if ((tag === 'input' && type === 'image') || tag === 'img' || tag === 'area') {
      const alt = collapse(el.getAttribute('alt'));
      if (alt) return [alt, 'alt'];
    }
    if (isFormControl(el) && el.labels && el.labels.length > 0) {
      const text = collapse(
        Array.from(el.labels).map((label) => textOf(label, (child) => child === el)).join(' '),
      );
      if (text) return [text, 'label'];
    }
    if (tag === 'fieldset') {
      const legend = el.querySelector(':scope > legend');
      if (legend) { const text = collapse(textOf(legend)); if (text) return [text, 'content']; }
    }
    if ((role && NAME_FROM_CONTENT.has(role)) || tag === 'button' || (tag === 'a' && el.hasAttribute('href'))) {
      const text = collapse(textOf(el));
      if (text) return [text, 'content'];
    }
    const title = collapse(el.getAttribute('title'));
    if (title) return [title, 'title'];
    const placeholder = collapse(el.getAttribute('placeholder'));
    if (placeholder && ['input', 'textarea'].includes(tag)) return [placeholder, 'placeholder'];
    return [undefined, undefined];
  };

  const canBeDisabled = (el, role) =>
    ['button', 'input', 'select', 'textarea', 'fieldset', 'option', 'optgroup'].includes(el.localName) ||
    (role !== undefined && WIDGET_ROLES.has(role) && role !== 'link');

  const isDisabled = (el) => {
    if (['button', 'input', 'select', 'textarea', 'fieldset', 'option', 'optgroup'].includes(el.localName)) {
      if (el.matches(':disabled')) return true;
    }
    for (let node = el; node; node = node.parentElement) {
      if (node.getAttribute && node.getAttribute('aria-disabled') === 'true') return true;
    }
    return false;
  };

  const regionKindOf = (el) => {
    const role = explicitRole(el);
    if (role) return REGION_ROLES[role];
    const tag = el.localName;
    if (tag === 'section') {
      const labelled = el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby');
      return labelled || el.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]') ? 'section' : undefined;
    }
    if (tag === 'dialog' && !el.open) return undefined;
    return REGION_TAGS[tag];
  };

  const regions = [{ id: 'page', kind: 'page', tag: 'body' }];
  const elements = [];
  const used = new Set();
  let truncated = false;
  let nextRegion = 1;

  const visit = (el, regionId, insideLeaf) => {
    if (SKIP_TAGS.has(el.localName)) return;
    if (el.localName === 'input' && (el.getAttribute('type') || '').toLowerCase() === 'hidden') return;
    let region = regionId;
    const kind = regionKindOf(el);
    if (kind) {
      const entry = { id: 'r' + String(nextRegion++), kind, tag: el.localName };
      const role = explicitRole(el);
      if (role) entry.role = role;
      const label = el.hasAttribute('aria-labelledby')
        ? byIds(el, 'aria-labelledby')
        : collapse(el.getAttribute('aria-label'));
      if (label) entry.label = label;
      const htmlId = el.getAttribute('id') || (el.localName === 'form' ? el.getAttribute('name') : '');
      if (htmlId) entry.htmlId = htmlId;
      if (regionId !== 'page') entry.parent = regionId;
      regions.push(entry);
      region = entry.id;
    }
    const role = roleOf(el);
    const testId = el.getAttribute(TEST_ID) || undefined;
    let leaf = insideLeaf;
    if (!insideLeaf || testId) {
      const [name, nameSource] = role === 'presentation' || role === 'none' ? [undefined, undefined] : nameOf(el, role);
      const named = name !== undefined && (INTERESTING_ROLES.has(role) || (role === undefined && ['input', 'select', 'textarea'].includes(el.localName)));
      if (testId || named) {
        if (elements.length >= MAX) { truncated = true; return; }
        const item = { tag: el.localName };
        if (testId) item.testId = testId;
        if (role && role !== 'presentation' && role !== 'none') item.role = role;
        if (name) { item.name = name; item.nameSource = nameSource; }
        if (!isFormControl(el)) {
          const text = clip(collapse(textOf(el)));
          if (text) item.text = text;
        }
        if (el.localName === 'input') item.type = (el.getAttribute('type') || 'text').toLowerCase();
        if (role === 'heading') {
          const level = /^h([1-6])$/.exec(el.localName);
          const aria = Number(el.getAttribute('aria-level'));
          item.level = level ? Number(level[1]) : (aria >= 1 ? aria : 2);
        }
        item.visible = isVisible(el);
        const disabled = isDisabled(el);
        item.enabled = !disabled;
        if (canBeDisabled(el, role)) item.disabled = disabled;
        item.region = region;
        elements.push(item);
        used.add(region);
      }
      if (role && LEAF_ROLES.has(role)) leaf = true;
    }
    const children = el.shadowRoot ? [...el.shadowRoot.children, ...el.children] : el.children;
    for (const child of children) visit(child, region, leaf);
  };

  if (document.body) for (const child of document.body.children) visit(child, 'page', false);

  const result = {
    url: location.href,
    title: document.title,
    lang: document.documentElement.getAttribute('lang') || '',
    regions: regions.filter((r) => used.has(r.id)),
    elements,
    truncated,
  };
  return result;
}`;

/** Collects the observation of the page as it is now (it does not navigate or wait). */
export async function observeScreen(
  page: Page,
  options: ObserveOptions = {},
): Promise<ScreenObservation> {
  const testIdAttribute = options.testIdAttribute ?? 'data-testid';
  const maxElements = options.maxElements ?? 500;
  const result = await page.evaluate<InPageResult>(
    `(${OBSERVE_SCRIPT})(${JSON.stringify({ testIdAttribute, maxElements })})`,
  );
  const observation: ScreenObservation = {
    format: OBSERVATION_FORMAT,
    version: OBSERVATION_VERSION,
    url: result.url,
    title: result.title,
    testIdAttribute,
    regions: result.regions,
    elements: result.elements,
    truncated: result.truncated,
  };
  if (result.lang !== '') observation.lang = result.lang;
  return observation;
}

/** Error in an observation file (not an observation, or of an unsupported version). */
export class ObservationFormatError extends Error {
  override name = 'ObservationFormatError';
}

/**
 * Checks that parsed JSON is an observation saved by `nimaime draft --observation`.
 * @throws ObservationFormatError
 */
export function parseObservation(json: unknown): ScreenObservation {
  if (typeof json !== 'object' || json === null) {
    throw new ObservationFormatError('Not an observation: expected a JSON object.');
  }
  const value = json as Partial<ScreenObservation>;
  if (value.format !== OBSERVATION_FORMAT) {
    throw new ObservationFormatError(
      `Not an observation: "format" must be "${OBSERVATION_FORMAT}" (save one with --observation).`,
    );
  }
  if (value.version !== OBSERVATION_VERSION) {
    throw new ObservationFormatError(
      `Unsupported observation version ${String(value.version)} (expected ${String(OBSERVATION_VERSION)}).`,
    );
  }
  if (!Array.isArray(value.regions) || !Array.isArray(value.elements)) {
    throw new ObservationFormatError(
      'Not an observation: "regions" and "elements" must be arrays.',
    );
  }
  if (typeof value.url !== 'string' || typeof value.title !== 'string') {
    throw new ObservationFormatError('Not an observation: "url" and "title" must be strings.');
  }
  return {
    ...value,
    testIdAttribute: value.testIdAttribute ?? 'data-testid',
    truncated: value.truncated === true,
  } as ScreenObservation;
}
