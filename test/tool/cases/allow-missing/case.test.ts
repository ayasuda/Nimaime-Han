import { expect, it } from 'vitest';
import { runCase } from '../../harness';

it('generates and runs only the tests whose definitions exist', async () => {
  const { gen, playwright } = await runCase(import.meta.dirname, {
    args: ['--allow-missing'],
    stdout: ['Generated 1 spec file (2 tests) into .sanmaime-gen'],
    stderr: [
      'Missing definitions (allowed by --allow-missing): 4',
      'Snippets:',
      'nimaime-gen: --allow-missing: 3 tests that use missing definitions are not generated:\n' +
        '  specs/settings.sanmaime: Screen: Settings > Element: Theme Switch > Always\n' +
        '  specs/user-details.sanmaime: Screen: User Details > Element: User Information > When: Viewing your own profile\n' +
        "  specs/user-details.sanmaime: Screen: User Details > Element: Edit Button > When: Viewing another user's profile\n",
    ],
    // settings.sanmaime is left without tests, so it gets no file.
    generated: ['.sanmaime-gen/specs/user-details.spec.ts'],
    playwright: { passed: 2 },
  });
  expect(gen.stderr).not.toContain('nothing was generated');
  expect(gen.generated).toHaveLength(1);
  expect(playwright?.tests.map((test) => test.title).sort()).toEqual([
    'Screen: User Details > Element: User Information > Always',
    "Screen: User Details > Element: User Information > When: Viewing another user's profile",
  ]);
});

it('without --allow-missing, fails and writes nothing', async () => {
  await runCase(import.meta.dirname, {
    exitCode: 1,
    generated: [],
    stderr: ['Missing definitions: 4', 'nothing was generated into .sanmaime-gen (4 errors)'],
  });
});
