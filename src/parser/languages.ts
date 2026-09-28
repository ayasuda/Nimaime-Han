/**
 * Keyword dictionaries of Sanmaime (docs/sanmaime.md §3.4–§3.5, docs/i18n.md).
 *
 * The equivalent of Gherkin's `gherkin-languages.json`: one entry per language code, mapping each
 * keyword slot to one or more spellings. The lexer is driven entirely by these tables, so adding a
 * language means adding an entry here (plus fixtures and docs) — no parser change.
 */

/** The keyword slots of Sanmaime. Each slot corresponds to one canonical (English) keyword. */
export interface LanguageKeywords {
  /** `Screen:` — name keyword. */
  screen: readonly string[];
  /** `Element:` — name keyword. */
  element: readonly string[];
  /** `When:` — name keyword. */
  when: readonly string[];
  /** `And when:` — name keyword (a further condition of a `When:` block, v0.2). */
  andWhen: readonly string[];
  /** `Show:` — name keyword. */
  show: readonly string[];
  /** `Hide:` — name keyword. */
  hide: readonly string[];
  /** `And:` — name keyword. */
  and: readonly string[];
  /** `Enable` — bare keyword. */
  enable: readonly string[];
  /** `Disable` — bare keyword. */
  disable: readonly string[];
  /** `Background:` — name keyword (conditions shared by every element of a screen, v0.2). */
  background: readonly string[];
}

/**
 * One keyword language.
 *
 * Keyword spellings are stored **without** a colon. The lexer appends a colon to name keywords
 * (`screen` … `and`, `andWhen` and `background`) and matches bare keywords (`enable`,
 * `disable`) against the whole line. Every slot has at least one spelling; the first one is the
 * *primary* spelling used in diagnostics and by tools that write Sanmaime. Further spellings are
 * synonyms, as in Gherkin.
 */
export interface LanguageDefinition {
  /** Language code used by `# language: <code>` and the `language` option, e.g. `"ja"`. */
  code: string;
  /** English name of the language, e.g. `"Japanese"`. */
  name: string;
  /** Name of the language in the language itself, e.g. `"日本語"`. */
  nativeName: string;
  /**
   * Characters accepted as the colon after a name keyword. Always contains `":"`; languages
   * usually typed with a CJK input method also accept the full-width colon `"："` (U+FF1A).
   */
  colons: readonly string[];
  keywords: LanguageKeywords;
}

const en: LanguageDefinition = {
  code: 'en',
  name: 'English',
  nativeName: 'English',
  colons: [':'],
  keywords: {
    screen: ['Screen'],
    element: ['Element'],
    when: ['When'],
    andWhen: ['And when'],
    show: ['Show'],
    hide: ['Hide'],
    and: ['And'],
    enable: ['Enable'],
    disable: ['Disable'],
    background: ['Background'],
  },
};

const ja: LanguageDefinition = {
  code: 'ja',
  name: 'Japanese',
  nativeName: '日本語',
  colons: [':', '：'],
  keywords: {
    screen: ['画面'],
    element: ['要素'],
    when: ['条件'],
    andWhen: ['かつ条件'],
    show: ['表示'],
    hide: ['非表示'],
    and: ['かつ'],
    enable: ['有効'],
    disable: ['無効'],
    background: ['背景'],
  },
};

function freeze(definition: LanguageDefinition): LanguageDefinition {
  for (const spellings of Object.values(definition.keywords)) Object.freeze(spellings);
  Object.freeze(definition.keywords);
  Object.freeze(definition.colons);
  return Object.freeze(definition);
}

/** All keyword languages, keyed by language code. The objects are frozen. */
export const LANGUAGES: Readonly<Record<string, LanguageDefinition>> = Object.freeze({
  en: freeze(en),
  ja: freeze(ja),
});

/** Language codes accepted by `# language:` and by the `language` option of `parse()`. */
export const SUPPORTED_LANGUAGES: readonly string[] = Object.freeze(Object.keys(LANGUAGES));

/** The language used when neither a (valid) directive nor the `language` option selects one. */
export const DEFAULT_LANGUAGE = 'en';

/** The definition of a language code, or `undefined` when the code is not supported. */
export function getLanguage(code: string): LanguageDefinition | undefined {
  return Object.hasOwn(LANGUAGES, code) ? LANGUAGES[code] : undefined;
}
