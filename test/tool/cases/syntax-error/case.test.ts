import { expect, it } from 'vitest';
import { runCase } from '../../harness';

it('reports syntax errors and generates nothing', async () => {
  const { gen } = await runCase(import.meta.dirname, {
    exitCode: 1,
    generated: [],
    stderr: [
      /^Syntax errors: 3\n/,
      "  specs/login.sanmaime:7:5\n    SANMAIME_E007: 'And:' must follow 'Show:', 'Hide:' or 'And:' in the same block.",
      "  specs/profile.sanmaime:7:1\n    SANMAIME_E002: 'Screen:' requires a name.",
      'SANMAIME_E010',
      /\nnimaime-gen: nothing was generated into \.sanmaime-gen \(3 errors\)\.\n$/,
    ],
  });
  // Specs with syntax errors are not matched against the definitions ("Password" is not defined).
  expect(gen.stderr).not.toContain('Missing definitions');
  expect(gen.stdout).toBe('');
});

it('prints compact diagnostics', async () => {
  const { gen } = await runCase(import.meta.dirname, {
    args: ['--format', 'compact'],
    exitCode: 1,
    generated: [],
  });
  expect(gen.stderr.split('\n')).toEqual([
    "specs/login.sanmaime:7:5: error SANMAIME_E007: 'And:' must follow 'Show:', 'Hide:' or 'And:' in the same block.",
    "specs/profile.sanmaime:7:1: error SANMAIME_E002: 'Screen:' requires a name.",
    "specs/profile.sanmaime:7:1: error SANMAIME_E010: Screen '' has no elements.",
    'nimaime-gen: nothing was generated into .sanmaime-gen (3 errors).',
    '',
  ]);
});

it('check reports the same errors', async () => {
  await runCase(import.meta.dirname, {
    args: ['check'],
    exitCode: 1,
    generated: [],
    stderr: ['Syntax errors: 3', 'SANMAIME_E007'],
  });
});
