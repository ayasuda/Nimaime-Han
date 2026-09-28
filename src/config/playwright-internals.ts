/**
 * Adapter around Playwright internals used to load `playwright.config.ts`.
 *
 * Playwright does not expose a public API to load a (TypeScript) config file the way `playwright test`
 * does. Like playwright-bdd, we call Playwright's internal `requireOrImport()`, which installs
 * Playwright's Babel-based TypeScript transform (CJS hooks + ESM loader hooks, honouring tsconfig
 * `paths`) and then `require()`s or `import()`s the file.
 *
 * Its location has moved between Playwright releases, so several candidates are tried. We require them
 * by absolute path (bypassing the package `exports` map) from the `playwright` package that the
 * user's `@playwright/test` depends on, so that the config sees the same Playwright instance.
 * If a future Playwright release moves it again, add the new location to `CANDIDATES`.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/** Loads a JS/TS module the same way Playwright loads `playwright.config.ts`. */
export type RequireOrImport = (file: string) => Promise<unknown>;

interface Candidate {
  /** File inside the `playwright` package. */
  file: string;
  /** Extracts `requireOrImport` from the module's exports. */
  pick: (mod: Record<string, unknown>) => unknown;
}

const CANDIDATES: readonly Candidate[] = [
  // Playwright >= 1.59 (bundled lib/common/index.js, which re-exports the transform module).
  {
    file: 'lib/common/index.js',
    pick: (mod) => (mod.transform as Record<string, unknown> | undefined)?.requireOrImport,
  },
  // Playwright 1.40 - 1.58.
  { file: 'lib/transform/transform.js', pick: (mod) => mod.requireOrImport },
];

/** Finds the root directory of the `playwright` package as seen from `fromDir`. */
export function resolvePlaywrightRoot(fromDir: string): string | undefined {
  const req = createRequire(path.join(fromDir, '__nimaime_han__.js'));
  for (const id of ['@playwright/test/package.json', 'playwright/package.json']) {
    try {
      const pkg = req.resolve(id);
      if (id.startsWith('playwright/')) return path.dirname(pkg);
      // `playwright` is a dependency of `@playwright/test`: resolve it from there.
      return path.dirname(createRequire(pkg).resolve('playwright/package.json'));
    } catch {
      // try the next id
    }
  }
  return undefined;
}

/**
 * Returns Playwright's `requireOrImport()` for the Playwright installation visible from one of
 * `searchDirs`, or `undefined` if Playwright is not installed there.
 *
 * @throws Error if Playwright is installed but none of the known internal locations works.
 */
export function getPlaywrightRequireOrImport(
  searchDirs: readonly string[],
): RequireOrImport | undefined {
  let root: string | undefined;
  for (const dir of searchDirs) {
    root = resolvePlaywrightRoot(dir);
    if (root !== undefined) break;
  }
  if (root === undefined) return undefined;

  const req = createRequire(path.join(root, 'package.json'));
  for (const candidate of CANDIDATES) {
    const file = path.join(root, candidate.file);
    if (!fs.existsSync(file)) continue;
    const fn = candidate.pick(req(file) as Record<string, unknown>);
    if (typeof fn === 'function') return fn as RequireOrImport;
  }
  throw new Error(
    `nimaime-han could not find Playwright's config loader (requireOrImport) in ${root}. ` +
      'This Playwright version may not be supported yet; please report it at https://github.com/ayasuda/Nimaime-Han/issues.',
  );
}
