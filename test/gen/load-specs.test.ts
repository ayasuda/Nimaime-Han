import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasErrors, loadSpecs, specUri } from '../../src/gen';

const configDir = path.join(import.meta.dirname, 'fixtures', 'project');
const examples = path.join(import.meta.dirname, '..', '..', 'examples', 'sanmaime');

describe('loadSpecs', () => {
  it('reads and parses each file, with a URI relative to configDir', async () => {
    const file = path.join(configDir, 'specs', 'user-details.sanmaime');
    const [spec] = await loadSpecs([file], { configDir, language: 'en' });
    expect(spec?.file).toBe(file);
    expect(spec?.document.uri).toBe('specs/user-details.sanmaime');
    expect(spec?.diagnostics).toEqual([]);
    expect(spec?.source).toContain('Screen: User Details');
    expect(spec?.document.screens.map((screen) => screen.name)).toEqual(['User Details']);
  });

  it('keeps the source as read (no normalization) and preserves order', async () => {
    const files = [
      path.join(examples, 'valid', 'utf8-bom.sanmaime'),
      path.join(examples, 'valid', 'crlf-line-endings.sanmaime'),
    ];
    const specs = await loadSpecs(files, { configDir: examples });
    expect(specs.map((spec) => spec.document.uri)).toEqual([
      'valid/utf8-bom.sanmaime',
      'valid/crlf-line-endings.sanmaime',
    ]);
    expect(specs[0]?.source.charCodeAt(0)).toBe(0xfeff);
    expect(specs[1]?.source).toContain('\r\n');
    expect(specs.every((spec) => !hasErrors(spec))).toBe(true);
  });

  it('reports parser diagnostics', async () => {
    const file = path.join(examples, 'invalid', 'e007-and-after-when.sanmaime');
    const [spec] = await loadSpecs([file], { configDir: examples });
    expect(spec !== undefined && hasErrors(spec)).toBe(true);
  });

  it('rejects when a file cannot be read', async () => {
    await expect(
      loadSpecs([path.join(configDir, 'missing.sanmaime')], { configDir }),
    ).rejects.toThrow(/ENOENT/);
  });
});

describe('specUri', () => {
  it('uses forward slashes', () => {
    expect(specUri(path.join('/a', 'b', 'c', 'd.sanmaime'), '/a')).toBe('b/c/d.sanmaime');
  });
});
