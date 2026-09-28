/**
 * Loading definition files (the Nimaime-Han counterpart of playwright-bdd importing step files).
 *
 * Each file is evaluated through Playwright's own loader (`requireOrImport`, see
 * `src/config/playwright-internals.ts`), so TypeScript definition files work exactly as they do
 * under `playwright test`. Evaluating a file runs its `createNimaime()` / `defineXxx()` calls, which
 * register definitions in the process-wide registry (`src/runtime/registry.ts`).
 *
 * Repeated runs in one process (several configs, watch mode): a module is evaluated at most once
 * per process (Node's module cache; Playwright's ESM loader cannot re-evaluate a file). To still
 * give each call a registry that contains exactly the definitions of its files, the definitions
 * registered while a file is first evaluated are remembered per file, and every call starts from an
 * empty registry (`resetRegistry()`) and replays the remembered definitions of already-loaded files.
 * Consequences:
 *
 * - Duplicates are detected among the files of one call only (two projects may define the same name).
 * - Do not call `resetRegistry()` yourself between calls; it is not needed and does not re-evaluate files.
 * - Edits to an already-loaded file are NOT picked up in the same process: a watch mode must run
 *   each generation in a fresh process (child process or worker), as Playwright does.
 * - Definitions made by a helper module are attributed to the first definition file that imported it.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getPlaywrightRequireOrImport, type RequireOrImport } from '../config/playwright-internals';
import {
  getRegistry,
  registerCondition,
  registerElement,
  registerScreen,
  resetRegistry,
  type ConditionDefinition,
  type ElementDefinition,
  type Registry,
  type ScreenDefinition,
} from '../runtime/registry';

/** Error thrown when a definition file cannot be loaded; `file` names the offending file. */
export class DefinitionLoadError extends Error {
  override name = 'DefinitionLoadError';

  constructor(
    /** Absolute path of the definition file. */
    readonly file: string,
    cause: unknown,
  ) {
    super(`Failed to load definition file ${file}: ${describeError(cause)}`, { cause });
  }
}

export interface LoadDefinitionsOptions {
  /**
   * Directories from which `@playwright/test` is resolved (normally the config directory).
   * Default: the directory of the first file, then `process.cwd()`.
   */
  searchDirs?: readonly string[];
}

/** A definition as recorded for replay, tagged with its kind. */
type RecordedDefinition =
  | { kind: 'screen'; def: ScreenDefinition }
  | { kind: 'element'; def: ElementDefinition }
  | { kind: 'condition'; def: ConditionDefinition };

// Kept on globalThis (like the registry) so that every copy of this module in the process agrees
// on which files were already evaluated.
const LOADED_KEY = Symbol.for('nimaime-han.loadedDefinitionFiles');
type GlobalWithLoaded = typeof globalThis & {
  [LOADED_KEY]?: Map<string, RecordedDefinition[]>;
};

function loadedFiles(): Map<string, RecordedDefinition[]> {
  const g = globalThis as GlobalWithLoaded;
  g[LOADED_KEY] ??= new Map();
  return g[LOADED_KEY];
}

/**
 * Loads `files` (in the given order) and returns a registry holding exactly their definitions.
 *
 * The returned registry is a snapshot, independent of later calls. The process-wide registry
 * (`getRegistry()`) is also left holding these definitions.
 *
 * @throws DefinitionLoadError wrapping the first error thrown while evaluating a file (syntax
 *   error, `NimaimeDefinitionError` for an invalid or duplicate definition, ...).
 */
export async function loadDefinitions(
  files: readonly string[],
  options: LoadDefinitionsOptions = {},
): Promise<Registry> {
  const absFiles = files.map((file) => path.resolve(file));
  const searchDirs = options.searchDirs ?? [
    ...(absFiles[0] === undefined ? [] : [path.dirname(absFiles[0])]),
    process.cwd(),
  ];
  let requireOrImport: RequireOrImport | undefined;
  const loaded = loadedFiles();

  resetRegistry();
  for (const file of absFiles) {
    const recorded = loaded.get(file);
    if (recorded !== undefined) {
      try {
        replay(recorded);
      } catch (error) {
        throw new DefinitionLoadError(file, error);
      }
      continue;
    }
    requireOrImport ??= getPlaywrightRequireOrImport(searchDirs) ?? importJavaScript;
    const before = new Set(allDefinitions(getRegistry()).map((entry) => entry.def));
    try {
      await requireOrImport(file);
    } catch (error) {
      throw new DefinitionLoadError(file, error);
    }
    loaded.set(
      file,
      allDefinitions(getRegistry()).filter((entry) => !before.has(entry.def)),
    );
  }
  return snapshot(getRegistry());
}

/** Fallback when Playwright is not installed: plain JavaScript only. */
async function importJavaScript(file: string): Promise<unknown> {
  if (!/\.(?:js|mjs|cjs)$/.test(file)) {
    throw new Error('@playwright/test is not installed (it is needed to load TypeScript files).');
  }
  return import(pathToFileURL(file).href);
}

function allDefinitions(registry: Registry): RecordedDefinition[] {
  const result: RecordedDefinition[] = [];
  for (const def of registry.screens.values()) result.push({ kind: 'screen', def });
  for (const def of registry.elements.values()) result.push({ kind: 'element', def });
  for (const scopes of registry.conditions.values()) {
    if (scopes.global) result.push({ kind: 'condition', def: scopes.global });
    for (const def of scopes.screens.values()) result.push({ kind: 'condition', def });
  }
  return result;
}

function replay(recorded: readonly RecordedDefinition[]): void {
  for (const entry of recorded) {
    if (entry.kind === 'screen') registerScreen(entry.def);
    else if (entry.kind === 'element') registerElement(entry.def);
    else registerCondition(entry.def);
  }
}

function snapshot(registry: Registry): Registry {
  const conditions: Registry['conditions'] = new Map();
  for (const [name, scopes] of registry.conditions) {
    conditions.set(name, { global: scopes.global, screens: new Map(scopes.screens) });
  }
  return {
    screens: new Map(registry.screens),
    elements: new Map(registry.elements),
    conditions,
  };
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.name === 'Error' ? error.message : `${error.name}: ${error.message}`;
}
