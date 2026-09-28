import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES_DIR = fileURLToPath(new URL('../../examples/sanmaime/', import.meta.url));

export interface Fixture {
  /** Path relative to the repository root, e.g. `examples/sanmaime/valid/minimal.sanmaime`. */
  uri: string;
  name: string;
  /** Exact file contents decoded as UTF-8 (BOM and CRLF are preserved). */
  source: string;
}

export function listFixtures(kind: 'valid' | 'invalid'): Fixture[] {
  const dir = join(FIXTURES_DIR, kind);
  return readdirSync(dir)
    .filter((file) => file.endsWith('.sanmaime'))
    .sort()
    .map((file) => ({
      uri: `examples/sanmaime/${kind}/${file}`,
      name: file.replace(/\.sanmaime$/, ''),
      source: readFileSync(join(dir, file), 'utf8'),
    }));
}

export function readFixture(kind: 'valid' | 'invalid', name: string): Fixture {
  const fixture = listFixtures(kind).find((f) => f.name === name);
  if (!fixture) throw new Error(`No fixture ${kind}/${name}`);
  return fixture;
}

export interface Expectation {
  code: string;
  line: number;
  column: number;
}

/** Read the `# expect: SANMAIME_Ennn` / `# at: line:col` header of an invalid fixture. */
export function readExpectation(source: string): Expectation {
  const code = /^# expect: (SANMAIME_E\d{3})\s*$/m.exec(source)?.[1];
  const at = /^# at: (\d+):(\d+)\s*$/m.exec(source);
  if (code === undefined || !at?.[1] || !at[2]) {
    throw new Error('Invalid fixture header: expected "# expect:" and "# at:" lines');
  }
  return { code, line: Number(at[1]), column: Number(at[2]) };
}
