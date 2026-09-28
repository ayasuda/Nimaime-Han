/**
 * Configuration types for `defineSanmaimeConfig()`.
 *
 * `SanmaimeConfig` is what users write in `playwright.config.ts`; `ResolvedSanmaimeConfig` is the
 * validated, fully-defaulted form that is stored in `process.env.NIMAIME_CONFIGS` and read back by
 * the `nimaime-gen` CLI (see docs/config.md).
 */

/** One glob pattern or a list of glob patterns. */
export type GlobPatterns = string | readonly string[];

/** Quote style used for string literals in generated `.spec.ts` files. */
export type QuoteStyle = 'single' | 'double';

/** Where generated specs import the Playwright `test` object from (custom fixtures). */
export interface ImportTestFrom {
  /** Path of the file that exports the extended `test`. Relative paths are resolved against `configDir`. */
  file: string;
  /** Name of the exported variable. Default: `'test'`. */
  varName?: string;
}

/** User-facing options accepted by `defineSanmaimeConfig()`. */
export interface SanmaimeConfig {
  /** Glob pattern(s) of `.sanmaime` specification files, relative to `configDir`. Required. */
  specs: GlobPatterns;
  /** Glob pattern(s) of TypeScript/JavaScript definition files, relative to `configDir`. Required. */
  definitions: GlobPatterns;
  /** Directory for generated spec files (returned as `testDir`). Default: `'.sanmaime-gen'`. */
  outputDir?: string;
  /** Default keyword language of `.sanmaime` files without a `# language:` directive. Default: `'en'`. */
  language?: string;
  /**
   * Tag expression selecting the tests to generate, e.g. `'@smoke and not @wip'` (Cucumber syntax:
   * `and`, `or`, `not`, parentheses). Tests whose tags do not match are not generated. The
   * `nimaime-gen --tags` option overrides it. Default: every test is generated.
   */
  tags?: string;
  /**
   * File exporting a custom Playwright `test` (e.g. created with `test.extend()`), used by generated
   * specs instead of `@playwright/test`. A string is shorthand for `{ file, varName: 'test' }`.
   */
  importTestFrom?: string | ImportTestFrom;
  /** Quote style for string literals in generated code. Default: `'single'`. */
  quotes?: QuoteStyle;
  /** Print extra information while generating. Default: `false`. */
  verbose?: boolean;
  /**
   * Base directory for resolving the relative paths above. Default: `process.env.NIMAIME_CONFIG_DIR`
   * (set by `nimaime-gen` to the directory of the loaded Playwright config), else `process.cwd()`.
   * Set it to `import.meta.dirname` / `__dirname` if Playwright may be started from another directory.
   */
  configDir?: string;
}

/** `importTestFrom` after resolution. */
export interface ResolvedImportTestFrom {
  /** Absolute path of the file. */
  file: string;
  /** Name of the exported variable. */
  varName: string;
}

/** A validated configuration with every default applied and every path made absolute. */
export interface ResolvedSanmaimeConfig {
  /** Absolute directory the relative paths and globs were resolved against. */
  configDir: string;
  /**
   * Glob patterns of `.sanmaime` files, as written by the user (normalized to an array).
   * Relative patterns are relative to `configDir`: glob them with `cwd: configDir`.
   */
  specs: string[];
  /** Glob patterns of definition files, relative to `configDir` (same rules as `specs`). */
  definitions: string[];
  /** Absolute path of the output directory. Also the key in `NIMAIME_CONFIGS`. */
  outputDir: string;
  /** Default keyword language. */
  language: string;
  /** Tag expression, if any. */
  tags?: string;
  /** Custom `test` import, if any. */
  importTestFrom?: ResolvedImportTestFrom;
  /** Quote style for generated code. */
  quotes: QuoteStyle;
  /** Verbose output. */
  verbose: boolean;
}
