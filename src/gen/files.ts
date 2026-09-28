/**
 * Resolving the `specs` / `definitions` globs of a `ResolvedSanmaimeConfig` to files.
 *
 * Uses Node's built-in `fs.promises.glob` (Node >= 22) and `path.matchesGlob`, so no glob library
 * is needed. Semantics (see docs/definitions.md, "Definition loading and matching"):
 *
 * - Relative patterns are matched with `cwd = config.configDir`; absolute patterns are allowed.
 * - A pattern starting with `!` excludes the files it matches from the result of all the positive
 *   patterns, wherever it appears in the list (like the `ignore` option of common glob libraries).
 * - Directories named `node_modules` and the config's `outputDir` are never searched.
 * - Only files are returned (no directories), as sorted, de-duplicated absolute paths.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ResolvedSanmaimeConfig } from '../config/types';

/** The parts of a resolved config that file resolution needs. */
export type FileResolutionConfig = Pick<ResolvedSanmaimeConfig, 'configDir' | 'outputDir'>;

/** Absolute paths of the `.sanmaime` files matched by `config.specs`. */
export function resolveSpecFiles(
  config: FileResolutionConfig & Pick<ResolvedSanmaimeConfig, 'specs'>,
): Promise<string[]> {
  return resolveFiles(config.specs, config);
}

/** Absolute paths of the definition files matched by `config.definitions`. */
export function resolveDefinitionFiles(
  config: FileResolutionConfig & Pick<ResolvedSanmaimeConfig, 'definitions'>,
): Promise<string[]> {
  return resolveFiles(config.definitions, config);
}

/**
 * Expands `patterns` (positive patterns and `!negations`) relative to `config.configDir`.
 *
 * @returns sorted, de-duplicated absolute file paths.
 */
export async function resolveFiles(
  patterns: readonly string[],
  config: FileResolutionConfig,
): Promise<string[]> {
  const glob = fs.promises.glob as typeof fs.promises.glob | undefined;
  if (typeof glob !== 'function') {
    throw new Error(
      `nimaime-han needs Node.js 22 or later to expand glob patterns (running ${process.version}).`,
    );
  }
  const cwd = path.resolve(config.configDir);
  const outputDir = path.resolve(config.outputDir);
  const include: string[] = [];
  const exclude: string[] = [];
  for (const raw of patterns) {
    const pattern = raw.trim();
    if (pattern.startsWith('!')) {
      const negated = normalizePattern(pattern.slice(1));
      if (negated !== '') exclude.push(negated);
    } else if (pattern !== '') {
      include.push(normalizePattern(pattern));
    }
  }
  if (include.length === 0) return [];

  const found = new Set<string>();
  for await (const entry of glob(include, {
    cwd,
    // Called with a bare name or a relative path depending on the traversal; the base name is enough
    // to prune node_modules. The output directory is filtered below, on absolute paths.
    exclude: (name: string) => path.basename(name) === 'node_modules',
  })) {
    const file = path.resolve(cwd, entry);
    if (isSameOrInside(file, outputDir) || hasNodeModulesSegment(file, cwd)) continue;
    if (exclude.some((negation) => matches(file, negation, cwd))) continue;
    if (!isFile(file)) continue;
    found.add(file);
  }
  return [...found].sort(compareStrings);
}

/** Strips a leading `./` and uses `/` separators, as glob patterns require. */
function normalizePattern(pattern: string): string {
  let result = pattern.trim().split(path.sep).join('/');
  while (result.startsWith('./')) result = result.slice(2);
  return result;
}

/** Whether `file` (absolute) matches `pattern` (relative to `cwd`, or absolute). */
function matches(file: string, pattern: string, cwd: string): boolean {
  const subject = path.isAbsolute(pattern) ? file : path.relative(cwd, file);
  return path.matchesGlob(subject.split(path.sep).join('/'), pattern);
}

function hasNodeModulesSegment(file: string, cwd: string): boolean {
  return path.relative(cwd, file).split(path.sep).includes('node_modules');
}

function isSameOrInside(file: string, dir: string): boolean {
  const rel = path.relative(dir, file);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function isFile(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/** Code-unit order, independent of the locale (stable across machines). */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
