/**
 * nimaime-han — main entry point: the user-facing API used from `playwright.config.ts` and
 * element/condition definition files.
 */
export { VERSION } from './version';
// Imported from the individual modules (not the config barrel) so that the CLI-only config loader
// is not part of the entry imported by playwright.config.ts.
export { defineSanmaimeConfig } from './config/define';
export { SanmaimeConfigError } from './config/errors';
export type {
  GlobPatterns,
  ImportTestFrom,
  QuoteStyle,
  ResolvedImportTestFrom,
  ResolvedSanmaimeConfig,
  SanmaimeConfig,
} from './config/types';
