import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { DefinitionLoadError, loadDefinitions, resolveDefinitionFiles } from '../../src/gen';
import { getRegistry, resetRegistry } from '../../src/runtime/index';

const fixtures = path.join(import.meta.dirname, 'fixtures');
const projectDir = path.join(fixtures, 'project');
const definitions = (...names: string[]) =>
  names.map((name) => path.join(projectDir, 'definitions', name));
const broken = (name: string) => path.join(fixtures, 'broken', name);

beforeEach(() => {
  resetRegistry();
});

describe('loadDefinitions', () => {
  it('loads TypeScript definition files through Playwright and returns their registry', async () => {
    const files = await resolveDefinitionFiles({
      configDir: projectDir,
      outputDir: path.join(projectDir, '.sanmaime-gen'),
      definitions: ['definitions/**/*.ts'],
    });
    const registry = await loadDefinitions(files);

    expect([...registry.screens.keys()].sort()).toEqual(['Settings', 'User Details']);
    expect([...registry.elements.keys()].sort()).toEqual([
      ' Login Form ',
      'Footer',
      'Login Button',
      'User Information',
    ]);
    expect([...(registry.elements.get('User Information')?.targets.keys() ?? [])]).toEqual([
      'Username',
      'Full name',
      'Email address',
    ]);
    const inputIsValid = registry.conditions.get('Input is valid');
    expect(inputIsValid?.global).toBeDefined();
    expect([...(inputIsValid?.screens.keys() ?? [])]).toEqual(['Login']);
    // Source locations point at the .ts files (source maps of Playwright's transform).
    expect(registry.screens.get('User Details')?.source?.file).toBe(
      definitions('user-details.ts')[0],
    );
    // The process-wide registry holds the same definitions.
    expect(getRegistry().screens.get('User Details')).toBe(registry.screens.get('User Details'));
  });

  it('returns the same definitions on repeated calls (files are evaluated once per process)', async () => {
    const files = definitions('user-details.ts', 'login.ts');
    const first = await loadDefinitions(files);
    resetRegistry();
    const second = await loadDefinitions(files);
    expect([...second.elements.keys()]).toEqual([...first.elements.keys()]);
    expect(second.screens.get('User Details')).toBe(first.screens.get('User Details'));
  });

  it('returns only the definitions of the given files, as an independent snapshot', async () => {
    const all = await loadDefinitions(definitions('user-details.ts', 'login.ts'));
    const some = await loadDefinitions(definitions('login.ts'));
    expect(some.screens.size).toBe(0);
    expect([...some.elements.keys()]).toEqual([' Login Form ', 'Login Button']);
    // The earlier snapshot is unaffected.
    expect(all.screens.has('User Details')).toBe(true);
  });

  it('allows the same name in files of separate calls (e.g. two Playwright projects)', async () => {
    await loadDefinitions(definitions('user-details.ts'));
    const other = await loadDefinitions([broken('other-project.ts')]);
    expect([...(other.elements.get('User Information')?.targets.keys() ?? [])]).toEqual(['Avatar']);
    await expect(
      loadDefinitions([...definitions('user-details.ts'), broken('other-project.ts')]),
    ).rejects.toThrow(
      /other-project\.ts: NimaimeDefinitionError: Duplicate element definition "User Information"/,
    );
  });

  it('wraps an error thrown by a definition file with the file path', async () => {
    const file = broken('throws.ts');
    const error: unknown = await loadDefinitions([file]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DefinitionLoadError);
    expect((error as DefinitionLoadError).file).toBe(file);
    expect((error as Error).message).toBe(
      `Failed to load definition file ${file}: boom from a definition file`,
    );
    expect(((error as Error).cause as Error).message).toBe('boom from a definition file');
  });

  it('wraps duplicate definitions across files with the path of the second file', async () => {
    const error: unknown = await loadDefinitions([
      broken('duplicate-a.ts'),
      broken('duplicate-b.ts'),
    ]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DefinitionLoadError);
    expect((error as DefinitionLoadError).file).toBe(broken('duplicate-b.ts'));
    expect((error as Error).message).toMatch(
      /duplicate-b\.ts: NimaimeDefinitionError: Duplicate element definition "Duplicated"/,
    );
  });

  it('wraps a missing file', async () => {
    const file = broken('does-not-exist.ts');
    await expect(loadDefinitions([file])).rejects.toThrow(
      `Failed to load definition file ${file}:`,
    );
  });

  it('returns an empty registry for no files', async () => {
    const registry = await loadDefinitions([]);
    expect(registry.screens.size + registry.elements.size + registry.conditions.size).toBe(0);
  });
});
