import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { CaseProject, repoRoot, runCase } from '../../harness';

const EXPORT = `specs/auth/login.sanmaime
  Screen: Login > Element: Login Form > Always
  Screen: Login > Element: Login Button > When: Input is valid
  Screen: Login > Element: Login Button > When: Input is invalid
specs/home.sanmaime
  Screen: Home > Element: Header > Always
4 tests in 2 spec files.
`;

it('export lists the tests that would be generated and writes nothing', async () => {
  const { gen } = await runCase(import.meta.dirname, {
    args: ['export'],
    stdoutExact: EXPORT,
    generated: [],
  });
  expect(gen.stderr).toBe('');
});

it('check succeeds without writing anything', async () => {
  const { gen } = await runCase(import.meta.dirname, {
    args: ['check'],
    stdoutExact: 'OK: 2 spec files (4 tests) for .sanmaime-gen; nothing was written.\n',
    generated: [],
  });
  expect(gen.stderr).toBe('');
});

it('check --verbose also reports screens without defineScreen, as information', async () => {
  await runCase(import.meta.dirname, {
    args: ['check', '--verbose'],
    generated: [],
    stderr: [
      'Config .sanmaime-gen: 2 spec files, 1 definition file.',
      'Screen "Login" is not defined (optional: without defineScreen it is not opened)',
      "defineScreen('Home', {",
    ],
  });
});

it('check and export with a missing definition', async () => {
  const project = new CaseProject(import.meta.dirname);
  fs.writeFileSync(
    path.join(project.dir, 'specs/home.sanmaime'),
    'Screen: Home\n\n  Element: Header\n    Show: Logo\n    And: Search box\n',
  );
  await project.gen({
    args: ['check'],
    exitCode: 1,
    generated: [],
    stderr: [
      'specs/home.sanmaime:5:5\n    Element "Header" has no definition for "Search box"',
      'nimaime-gen: nothing was generated into .sanmaime-gen (1 error).',
    ],
  });
  // export --allow-missing lists only the tests that would be generated.
  await project.gen({
    args: ['export', '--allow-missing'],
    generated: [],
    stdout: [/^specs\/auth\/login\.sanmaime\n/, '3 tests in 1 spec file.\n'],
    stderr: ['Missing definitions (allowed by --allow-missing): 1'],
  });
  await project.gen({ args: ['check', '--allow-missing'], generated: [] });
});

it('exits with 2 on usage and configuration errors', async () => {
  const project = new CaseProject(import.meta.dirname);
  await project.gen({
    args: ['frobnicate'],
    exitCode: 2,
    generated: [],
    stderr: ["nimaime-gen: Unknown command 'frobnicate'. Commands: generate, export, check."],
  });
  await project.gen({
    args: ['--format', 'nope'],
    exitCode: 2,
    stderr: ["nimaime-gen: Unknown format 'nope'. Formats: pretty, compact."],
  });
  await project.gen({
    args: ['-c', 'missing.config.ts'],
    exitCode: 2,
    stderr: [
      /^nimaime-gen: Playwright config not found: .*missing\.config\.ts does not exist\.\n$/,
    ],
  });
  const { version } = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
    version: string;
  };
  await project.gen({ args: ['--version'], stdoutExact: `${version}\n` });
});
