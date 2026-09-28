// Prepares a node_modules directory for the Playwright version matrix of the tool tests:
//
//   node test/tool/install-playwright.js <@playwright/test version> <directory>
//   NIMAIME_TOOL_NODE_MODULES=<directory>/node_modules npx vitest run -c vitest.tool.config.ts basic
//
// It packs this repository (run `npm run build` first) and installs the tarball together with the
// requested @playwright/test into <directory>, the way a user project gets them from the registry:
// nimaime-han is a copy, not a symlink, so it loads that directory's Playwright (Playwright refuses
// to run with two copies of itself). Browsers are not installed; run
// `<directory>/node_modules/.bin/playwright install chromium` for the revision of that version, or
// set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [version, target] = process.argv.slice(2);
if (!version || !target) {
  console.error(
    'Usage: node test/tool/install-playwright.js <@playwright/test version> <directory>',
  );
  process.exit(2);
}

const root = path.resolve(import.meta.dirname, '..', '..');
const dir = path.resolve(target);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

if (!fs.existsSync(path.join(root, 'dist', 'cli', 'nimaime-gen.js'))) {
  console.error('dist/ not found: run "npm run build" first.');
  process.exit(1);
}

fs.mkdirSync(dir, { recursive: true });
const packed = JSON.parse(
  execFileSync(npm, ['pack', '--json', '--pack-destination', dir], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    shell: process.platform === 'win32',
  }),
);
const tarball = packed[0].filename;

const manifest = {
  name: 'nimaime-tool-playwright-matrix',
  private: true,
  type: 'module',
  dependencies: {
    '@playwright/test': version,
    'nimaime-han': `file:./${tarball}`,
  },
};
fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
execFileSync(npm, ['install', '--no-audit', '--no-fund', '--no-package-lock'], {
  cwd: dir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

const installed = JSON.parse(
  fs.readFileSync(path.join(dir, 'node_modules', '@playwright', 'test', 'package.json'), 'utf8'),
);
console.log(`Installed @playwright/test ${installed.version} and ${tarball} into ${dir}`);
console.log(`NIMAIME_TOOL_NODE_MODULES=${path.join(dir, 'node_modules')}`);
