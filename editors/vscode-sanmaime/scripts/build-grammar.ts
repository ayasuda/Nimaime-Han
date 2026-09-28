/**
 * Writes `syntaxes/sanmaime.tmLanguage.json` from the parser's keyword dictionaries.
 *
 *   npm run build:grammar
 *   (= node --experimental-strip-types editors/vscode-sanmaime/scripts/build-grammar.ts)
 *
 * With `--check`, writes nothing and exits with 1 when the committed file is out of date.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import type { LanguageDefinition } from '../../../src/parser/languages';
import type { buildGrammar as BuildGrammar } from './grammar';

const output = fileURLToPath(new URL('../syntaxes/sanmaime.tmLanguage.json', import.meta.url));

// Imported by URL because Node (type stripping) needs the `.ts` extension, which the type checker
// does not allow in a static import.
async function importTs<T>(path: string): Promise<T> {
  return (await import(new URL(path, import.meta.url).href)) as T;
}
const { LANGUAGES } = await importTs<{ LANGUAGES: Readonly<Record<string, LanguageDefinition>> }>(
  '../../../src/parser/languages.ts',
);
const { buildGrammar } = await importTs<{ buildGrammar: typeof BuildGrammar }>('./grammar.ts');

const json = await format(JSON.stringify(buildGrammar(LANGUAGES)), {
  ...(await resolveConfig(output)),
  filepath: output,
});

if (process.argv.includes('--check')) {
  const current = await readFile(output, 'utf8').catch(() => '');
  if (current !== json) {
    console.error(`${output} is out of date. Run \`npm run build:grammar\`.`);
    process.exitCode = 1;
  }
} else {
  await writeFile(output, json);
  console.log(`Wrote ${output}`);
}
