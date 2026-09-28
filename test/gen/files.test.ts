import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveDefinitionFiles, resolveFiles, resolveSpecFiles } from '../../src/gen';

let root: string;

function touch(relative: string): void {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '');
}

function rel(files: string[]): string[] {
  return files.map((file) => path.relative(root, file).split(path.sep).join('/'));
}

beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nimaime-files-')));
  for (const file of [
    'specs/b.sanmaime',
    'specs/a.sanmaime',
    'specs/nested/c.sanmaime',
    'specs/drafts/d.sanmaime',
    'specs/readme.md',
    'specs/node_modules/pkg/e.sanmaime',
    'node_modules/pkg/f.sanmaime',
    '.sanmaime-gen/g.sanmaime',
    'definitions/users.ts',
    'definitions/login.ts',
    'definitions/login.test.ts',
    'definitions/helpers.js',
    'shared/extra.sanmaime',
  ]) {
    touch(file);
  }
  fs.mkdirSync(path.join(root, 'specs', 'dir.sanmaime'));
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const base = () => ({ configDir: root, outputDir: path.join(root, '.sanmaime-gen') });

describe('resolveSpecFiles / resolveDefinitionFiles', () => {
  it('globs relative to configDir and returns sorted absolute file paths', async () => {
    const files = await resolveSpecFiles({ ...base(), specs: ['specs/**/*.sanmaime'] });
    expect(files.every((file) => path.isAbsolute(file))).toBe(true);
    expect(rel(files)).toEqual([
      'specs/a.sanmaime',
      'specs/b.sanmaime',
      'specs/drafts/d.sanmaime',
      'specs/nested/c.sanmaime',
    ]);
  });

  it('applies negated patterns regardless of their position', async () => {
    const files = await resolveSpecFiles({
      ...base(),
      specs: ['!specs/drafts/**', 'specs/**/*.sanmaime', '!**/b.sanmaime'],
    });
    expect(rel(files)).toEqual(['specs/a.sanmaime', 'specs/nested/c.sanmaime']);
  });

  it('unions several patterns without duplicates and accepts ./ and brace patterns', async () => {
    const files = await resolveDefinitionFiles({
      ...base(),
      definitions: ['./definitions/*.ts', 'definitions/{login,users}.ts', '!**/*.test.ts'],
    });
    expect(rel(files)).toEqual(['definitions/login.ts', 'definitions/users.ts']);
  });

  it('never returns files in node_modules or the output directory', async () => {
    const files = await resolveFiles(['**/*.sanmaime'], base());
    expect(rel(files)).toEqual([
      'shared/extra.sanmaime',
      'specs/a.sanmaime',
      'specs/b.sanmaime',
      'specs/drafts/d.sanmaime',
      'specs/nested/c.sanmaime',
    ]);
  });

  it('supports patterns outside configDir and absolute patterns', async () => {
    const configDir = path.join(root, 'specs');
    const outputDir = path.join(configDir, '.sanmaime-gen');
    expect(rel(await resolveFiles(['../shared/*.sanmaime'], { configDir, outputDir }))).toEqual([
      'shared/extra.sanmaime',
    ]);
    const absolute = path.join(root, 'definitions', '*.js').split(path.sep).join('/');
    expect(rel(await resolveFiles([absolute], { configDir, outputDir }))).toEqual([
      'definitions/helpers.js',
    ]);
  });

  it('returns an empty list when nothing matches or there are only negations', async () => {
    expect(await resolveFiles(['nothing/**/*.ts'], base())).toEqual([]);
    expect(await resolveFiles(['!specs/**'], base())).toEqual([]);
  });
});
