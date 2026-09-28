// Runs after `changeset version` (see the `version` script in package.json). Changesets bumps
// package.json only; this copies the new version to the other places that repeat it:
//   - src/version.ts (the VERSION export and `nimaime-gen --version`; checked by test/version.test.ts)
//   - package-lock.json (the root package entries), so `npm ci` stays in sync without a network install
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const readJson = (file) => JSON.parse(readFileSync(new URL(file, root), 'utf8'));
const writeJson = (file, value) =>
  writeFileSync(new URL(file, root), `${JSON.stringify(value, null, 2)}\n`);

const { version } = readJson('package.json');

const versionFile = new URL('src/version.ts', root);
const source = readFileSync(versionFile, 'utf8');
const pattern = /export const VERSION = '[^']*';/;
if (!pattern.test(source)) {
  throw new Error("src/version.ts: could not find `export const VERSION = '...';`");
}
writeFileSync(versionFile, source.replace(pattern, `export const VERSION = '${version}';`));

const lock = readJson('package-lock.json');
lock.version = version;
lock.packages[''].version = version;
writeJson('package-lock.json', lock);

console.log(`Synced version ${version} to src/version.ts and package-lock.json`);
