import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  findScreenSpec,
  listScreenSpecs,
  loadSanmaimeSpecs,
  NimaimeRuntimeError,
  resetScreenSpecs,
} from '../../src/runtime/index';

let dir: string;

const write = (file: string, content: string): void => {
  const abs = path.join(dir, file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
};

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimaime-specs-'));
  write('specs/login.sanmaime', 'Screen: Login\n  Element: Login Button\n    Disable\n');
  write(
    'specs/users/user-details.sanmaime',
    'Screen: User Details\n  Element: User Information\n    When: Own profile\n    Show: Username\n',
  );
  write('specs/ja.sanmaime', '画面: ユーザー詳細\n  要素: ユーザー情報\n    表示: ユーザー名\n');
  write('specs/node_modules/dep.sanmaime', 'Screen: Dependency\n  Element: A\n    Show: B\n');
  write(
    'invalid/broken.sanmaime',
    'Screen: Broken\n  Element: A\n    Show: B\n    Oops\n  Element: C\n',
  );
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  resetScreenSpecs();
});

describe('loadSanmaimeSpecs', () => {
  it('expands globs relative to cwd, skips node_modules, and registers every screen', async () => {
    const specs = await loadSanmaimeSpecs(['specs/**/*.sanmaime', '!specs/ja.sanmaime'], {
      cwd: dir,
    });
    expect(specs.map((s) => s.screen)).toEqual(['Login', 'User Details']);
    expect(listScreenSpecs().map((s) => s.screen)).toEqual(['Login', 'User Details']);
    const details = findScreenSpec('User Details');
    expect(details?.file).toBe(path.join(dir, 'specs/users/user-details.sanmaime'));
    expect(details?.elements[0]?.conditions[0]).toEqual({
      name: 'Own profile',
      location: { line: 3, column: 5 },
      expectations: [{ kind: 'show', target: 'Username', location: { line: 4, column: 5 } }],
    });
  });

  it('accepts a single path and the default language', async () => {
    await loadSanmaimeSpecs('./specs/ja.sanmaime', { cwd: dir, language: 'ja' });
    expect(findScreenSpec('ユーザー詳細')?.elements[0]?.unconditional).toEqual([
      { kind: 'show', target: 'ユーザー名', location: { line: 3, column: 5 } },
    ]);
  });

  it('accepts absolute paths and is idempotent', async () => {
    const file = path.join(dir, 'specs/login.sanmaime');
    await loadSanmaimeSpecs(file);
    await loadSanmaimeSpecs(file);
    expect(listScreenSpecs()).toHaveLength(1);
  });

  it('throws when nothing matches', async () => {
    const error = await loadSanmaimeSpecs('nope/**/*.sanmaime', { cwd: dir }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(NimaimeRuntimeError);
    expect((error as Error).message).toBe(
      `No .sanmaime file matches "nope/**/*.sanmaime" (in ${dir}).`,
    );
  });

  it('throws with every diagnostic and registers nothing when a file is invalid', async () => {
    const error = await loadSanmaimeSpecs(['specs/login.sanmaime', 'invalid/*.sanmaime'], {
      cwd: dir,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NimaimeRuntimeError);
    const message = (error as Error).message;
    expect(message).toMatch(/^Invalid Sanmaime specs:\n/);
    expect(message).toMatch(/broken\.sanmaime:4:5: error SANMAIME_E001: /);
    expect(message).toMatch(/broken\.sanmaime:5:3: error SANMAIME_E\d+: /);
    expect(listScreenSpecs()).toEqual([]);
  });
});
