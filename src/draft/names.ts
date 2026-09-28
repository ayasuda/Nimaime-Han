/**
 * Naming rules of the rule-based proposer (docs/draft.md, "What the rules do"): Sanmaime names for
 * regions (elements) and observed elements (targets). Names are always single-line, trimmed and
 * non-empty, so they are valid Sanmaime names (docs/sanmaime.md §3.6).
 */
import type { ObservedElement, ObservedRegion, RegionKind } from './types';

/** Languages the proposer writes keywords and default names in. */
export type DraftLanguage = 'en' | 'ja';

/** Collapses whitespace (including line breaks) and trims; `''` for nothing. */
export function cleanName(text: string | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * `user-full_name` / `userFullName` → `User full name` (sentence case), for test ids. With
 * `title`, `User Full Name`.
 */
export function humanize(id: string, title = false): string {
  const words = id
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_\-.:/]+/)
    .filter((word) => word !== '');
  return words
    .map((word, index) => {
      if (/^[A-Z0-9]+$/.test(word) && word.length > 1) return word; // acronyms: ID, URL
      if (index === 0 || title) return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      return word.toLowerCase();
    })
    .join(' ');
}

const DEFAULT_REGION_NAMES: Record<DraftLanguage, Record<RegionKind, string>> = {
  en: {
    header: 'Header',
    nav: 'Navigation',
    main: 'Main content',
    form: 'Form',
    section: 'Section',
    aside: 'Complementary',
    footer: 'Footer',
    dialog: 'Dialog',
    region: 'Region',
    search: 'Search',
    page: 'Main content',
  },
  ja: {
    header: 'ヘッダー',
    nav: 'ナビゲーション',
    main: 'メインコンテンツ',
    form: 'フォーム',
    section: 'セクション',
    aside: '補足',
    footer: 'フッター',
    dialog: 'ダイアログ',
    region: '領域',
    search: '検索',
    page: 'メインコンテンツ',
  },
};

/** The fallback name of a region kind, e.g. `Navigation`. */
export function defaultRegionName(kind: RegionKind, language: DraftLanguage): string {
  return DEFAULT_REGION_NAMES[language][kind];
}

/** Role words appended to target names so that they read as what they are (`Log in button`). */
const ROLE_SUFFIXES: Record<DraftLanguage, Partial<Record<string, string>>> = {
  en: {
    button: 'button',
    link: 'link',
    checkbox: 'checkbox',
    radio: 'radio button',
    switch: 'switch',
    tab: 'tab',
    heading: 'heading',
    img: 'image',
  },
  ja: {
    button: 'ボタン',
    link: 'リンク',
    checkbox: 'チェックボックス',
    radio: 'ラジオボタン',
    switch: 'スイッチ',
    tab: 'タブ',
    heading: '見出し',
    img: '画像',
  },
};

/** `name` followed by `suffix`, unless it already ends with it (case-insensitively). */
function withSuffix(name: string, suffix: string | undefined, language: DraftLanguage): string {
  if (suffix === undefined) return name;
  if (name.toLowerCase().endsWith(suffix.toLowerCase())) return name;
  // Japanese words are not separated by spaces, but a Latin name reads better with one.
  const last = name.slice(-1);
  const separator = language === 'ja' && !/[\x20-\x7e]/.test(last) ? '' : ' ';
  return `${name}${separator}${suffix}`;
}

/**
 * The target name of an observed element: its accessible name (with a role word for buttons,
 * links, headings, …), else its humanized test id, else its text. `''` when it has none.
 */
export function targetName(element: ObservedElement, language: DraftLanguage): string {
  const name = cleanName(element.name);
  if (name !== '') {
    return withSuffix(name, ROLE_SUFFIXES[language][element.role ?? ''], language);
  }
  if (element.testId !== undefined && cleanName(element.testId) !== '') {
    return humanize(cleanName(element.testId));
  }
  return cleanName(element.text);
}

/**
 * The element name proposed for a region: its label, else its first visible heading (not for
 * header, nav and footer, whose headings are usually the site's), else its humanized `id` (forms,
 * sections, dialogs, …), else a form's submit button + `form`, else the kind's default name.
 */
export function regionName(
  region: ObservedRegion,
  elements: readonly ObservedElement[],
  language: DraftLanguage,
): { name: string; fromHeading?: ObservedElement } {
  const label = cleanName(region.label);
  if (label !== '') return { name: label };
  if (!['header', 'nav', 'footer'].includes(region.kind)) {
    const heading = elements.find((e) => e.role === 'heading' && e.visible && cleanName(e.name));
    if (heading) return { name: cleanName(heading.name), fromHeading: heading };
  }
  const htmlId = cleanName(region.htmlId);
  if (htmlId !== '' && !['page', 'main', 'header', 'nav', 'footer'].includes(region.kind)) {
    return { name: humanize(htmlId, true) };
  }
  if (region.kind === 'form') {
    const buttons = elements.filter((e) => e.role === 'button' && e.visible && cleanName(e.name));
    const submit = buttons.length === 1 ? buttons[0] : undefined;
    if (submit) {
      const suffix = language === 'ja' ? 'フォーム' : 'form';
      return { name: withSuffix(cleanName(submit.name), suffix, language) };
    }
  }
  return { name: defaultRegionName(region.kind, language) };
}

/** `name`, or `name 2`, `name 3`, … — the first one not in `taken` (which it is added to). */
export function uniqueName(name: string, taken: Set<string>): string {
  let candidate = name;
  for (let n = 2; taken.has(candidate); n++) candidate = `${name} ${String(n)}`;
  taken.add(candidate);
  return candidate;
}
