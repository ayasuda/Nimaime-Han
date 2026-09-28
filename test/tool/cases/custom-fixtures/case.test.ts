import { expect, it } from 'vitest';
import { runCase } from '../../harness';

it('passes the custom fixtures of importTestFrom to the definitions', async () => {
  const { gen, project } = await runCase(import.meta.dirname, {
    stdout: ['Generated 1 spec file (3 tests) into .sanmaime-gen'],
    generated: ['.sanmaime-gen/specs/todos.spec.ts'],
    playwright: { passed: 3 },
  });
  expect(gen.stderr).toBe('');
  const code = project.read('.sanmaime-gen/specs/todos.spec.ts');
  // importTestFrom with a varName, double quotes.
  expect(code).toContain('import { myTest as base } from "../../support/test";');
  // Each test names exactly the fixtures its definitions use.
  expect(code).toContain('async ({ $nimaime, addTodos, initialTodos, page }) =>');
  expect(code).toContain('async ({ $nimaime, initialTodos, page }) =>');
});
