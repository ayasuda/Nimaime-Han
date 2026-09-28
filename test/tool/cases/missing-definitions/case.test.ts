import { expect, it } from 'vitest';
import { runCase } from '../../harness';

it('reports missing definitions with snippets and generates nothing', async () => {
  const { gen } = await runCase(import.meta.dirname, {
    exitCode: 1,
    generated: [],
    stdout: [],
    stderr: [
      'Missing definitions: 3',
      'specs/user-details.sanmaime:8:5\n    Condition "Viewing your own profile" is not defined',
      'specs/user-details.sanmaime:9:5\n    Element "User Information" has no definition for "Full name"',
      'specs/user-details.sanmaime:14:3\n    Element "Edit Button" is not defined',
      'Snippets:',
      "  'Full name': ({ page }) => page.getByTestId('TODO'),",
      // Disable needs the element's own locator.
      "defineElement('Edit Button', ({ page }) => page.getByTestId('TODO'));",
      "defineCondition('Viewing your own profile', async ({ page }) => {",
      'nimaime-gen: nothing was generated into .sanmaime-gen (3 errors).',
    ],
  });
  expect(gen.stdout).toBe('');
  await expect(gen.stderr).toMatchFileSnapshot('__snapshots__/stderr.txt');
});

it('prints one line per problem with --format compact', async () => {
  await runCase(import.meta.dirname, {
    args: ['--format', 'compact'],
    exitCode: 1,
    generated: [],
    stderr: [
      /^specs\/user-details\.sanmaime:8:5: error: Condition "When: Viewing your own profile" .*\n/,
      /\nspecs\/user-details\.sanmaime:9:5: error: Element "User Information" has no definition for target "Full name"\.\n/,
      /\nspecs\/user-details\.sanmaime:14:3: error: Element "Edit Button" of Screen "User Details" has no definition/,
      /\nnimaime-gen: nothing was generated into \.sanmaime-gen \(3 errors\)\.\n$/,
    ],
  });
});
