/** End to end over the fixture project: config -> files -> specs + definitions -> match. */
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { clearSanmaimeConfigs, loadPlaywrightConfig } from '../../src/config';
import {
  loadDefinitions,
  loadSpecs,
  matchSpecs,
  resolveDefinitionFiles,
  resolveSpecFiles,
} from '../../src/gen';

const projectDir = path.join(import.meta.dirname, 'fixtures', 'project');

afterAll(() => {
  clearSanmaimeConfigs();
});

describe('fixture project', () => {
  it('matches the specs of playwright.config.ts against its definitions', async () => {
    clearSanmaimeConfigs();
    const { configs } = await loadPlaywrightConfig({ cwd: projectDir });
    expect(configs).toHaveLength(1);
    const config = configs[0];
    if (!config) throw new Error('no config');

    const specFiles = await resolveSpecFiles(config);
    expect(specFiles.map((file) => path.relative(projectDir, file))).toEqual([
      path.join('specs', 'login.sanmaime'),
      path.join('specs', 'user-details.sanmaime'),
    ]);
    const definitionFiles = await resolveDefinitionFiles(config);
    expect(definitionFiles.map((file) => path.relative(projectDir, file))).toEqual([
      path.join('definitions', 'login.ts'),
      path.join('definitions', 'support', 'unused.ts'),
      path.join('definitions', 'user-details.ts'),
    ]);

    const specs = await loadSpecs(specFiles, config);
    const registry = await loadDefinitions(definitionFiles, { searchDirs: [config.configDir] });
    const result = matchSpecs(specs, registry);

    expect(result.skipped).toEqual([]);
    expect(result.documents.map((d) => d.uri)).toEqual([
      'specs/login.sanmaime',
      'specs/user-details.sanmaime',
    ]);
    expect(result.missing.map((m) => [m.kind, m.severity, m.name])).toEqual([
      ['screen', 'info', 'Login'],
    ]);
    expect(result.unused.map((u) => [u.kind, u.name, u.screen])).toEqual([
      ['screen', 'Settings', undefined],
      ['element', 'Footer', undefined],
      ['condition', 'Input is valid', undefined],
      ['condition', 'Logged out', undefined],
    ]);

    const login = result.documents[0]?.screens[0];
    expect(
      login?.elements[0]?.unconditional.map((e) => 'targetDefined' in e && e.targetDefined),
    ).toEqual([true, true, true]);
    const loginButton = login?.elements[1];
    expect(loginButton?.conditions.map((c) => c.definition?.screen)).toEqual(['Login', 'Login']);
    expect(loginButton?.conditions[0]?.expectations[0]).toMatchObject({
      kind: 'enable',
      selfDefined: true,
    });
  });
});
