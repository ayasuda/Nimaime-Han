/**
 * Reading and parsing `.sanmaime` files for the generator.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ResolvedSanmaimeConfig } from '../config/types';
import { parse, type Diagnostic, type SanmaimeDocument } from '../parser';

/** One parsed `.sanmaime` file. */
export interface ParsedSpec {
  /** Absolute path. */
  file: string;
  /** The file contents, as read (UTF-8, not normalized). */
  source: string;
  /** The parsed document; `document.uri` is `file` relative to `configDir`, with `/` separators. */
  document: SanmaimeDocument;
  /** Parser diagnostics. A spec with an error diagnostic must not be generated. */
  diagnostics: Diagnostic[];
}

/** The parts of a resolved config that spec loading needs. */
export type SpecLoadingConfig = Pick<ResolvedSanmaimeConfig, 'configDir'> &
  Partial<Pick<ResolvedSanmaimeConfig, 'language'>>;

/**
 * Reads and parses `files` (absolute paths, e.g. from `resolveSpecFiles()`), in the given order.
 *
 * @throws the underlying `fs` error if a file cannot be read.
 */
export async function loadSpecs(
  files: readonly string[],
  config: SpecLoadingConfig,
): Promise<ParsedSpec[]> {
  return Promise.all(
    files.map(async (file): Promise<ParsedSpec> => {
      const source = await fs.readFile(file, 'utf8');
      const uri = specUri(file, config.configDir);
      // TODO(#5): pass `language: config.language` (the default keyword language) once the parser
      // accepts it in ParseOptions; until then the parser uses its own default ('en').
      const { document, diagnostics } = parse(source, { uri });
      return { file, source, document, diagnostics };
    }),
  );
}

/** `file` relative to `configDir`, with `/` separators (used as the document URI in messages). */
export function specUri(file: string, configDir: string): string {
  return path.relative(configDir, file).split(path.sep).join('/');
}

/** Whether a parsed spec has an error diagnostic (and so must not be generated). */
export function hasErrors(spec: Pick<ParsedSpec, 'diagnostics'>): boolean {
  return spec.diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}
