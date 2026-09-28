import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveSanmaimeConfig, SanmaimeConfigError } from '../../src/config';
import { describeValue } from '../../src/config/errors';

const base = path.resolve('/project');
const minimal = { specs: 'specs/**/*.sanmaime', definitions: 'definitions/**/*.ts' };

function errorOf(input: unknown): string {
  try {
    resolveSanmaimeConfig(input, base);
  } catch (error) {
    expect(error).toBeInstanceOf(SanmaimeConfigError);
    return (error as Error).message;
  }
  throw new Error('expected resolveSanmaimeConfig() to throw');
}

describe('resolveSanmaimeConfig', () => {
  it('applies defaults', () => {
    expect(resolveSanmaimeConfig(minimal, base)).toEqual({
      configDir: base,
      specs: ['specs/**/*.sanmaime'],
      definitions: ['definitions/**/*.ts'],
      outputDir: path.join(base, '.sanmaime-gen'),
      language: 'en',
      includeDrafts: false,
      quotes: 'single',
      verbose: false,
    });
  });

  it('resolves every option', () => {
    expect(
      resolveSanmaimeConfig(
        {
          specs: ['a/*.sanmaime', ' b/*.sanmaime '],
          definitions: ['defs/*.ts', '!defs/*.test.ts'],
          outputDir: 'out/gen',
          language: 'ja',
          tags: '@smoke and not @slow',
          includeDrafts: true,
          importTestFrom: { file: './fixtures.ts', varName: 'myTest' },
          quotes: 'double',
          verbose: true,
          configDir: 'e2e',
        },
        base,
      ),
    ).toEqual({
      configDir: path.join(base, 'e2e'),
      specs: ['a/*.sanmaime', 'b/*.sanmaime'],
      definitions: ['defs/*.ts', '!defs/*.test.ts'],
      outputDir: path.join(base, 'e2e', 'out', 'gen'),
      language: 'ja',
      tags: '@smoke and not @slow',
      includeDrafts: true,
      importTestFrom: { file: path.join(base, 'e2e', 'fixtures.ts'), varName: 'myTest' },
      quotes: 'double',
      verbose: true,
    });
  });

  it('accepts absolute paths', () => {
    const out = path.resolve('/elsewhere/gen');
    const conf = resolveSanmaimeConfig({ ...minimal, outputDir: out, configDir: '/other' }, base);
    expect(conf.outputDir).toBe(out);
    expect(conf.configDir).toBe(path.resolve('/other'));
  });

  it('expands the importTestFrom string shorthand', () => {
    expect(
      resolveSanmaimeConfig({ ...minimal, importTestFrom: 'fixtures.ts' }, base).importTestFrom,
    ).toEqual({
      file: path.join(base, 'fixtures.ts'),
      varName: 'test',
    });
  });

  it.each([
    [null, /expects an object like \{ specs, definitions \}\. Received: null\./],
    ['specs/*.sanmaime', /expects an object.*Received: "specs\/\*\.sanmaime" \(string\)/],
    [
      { definitions: 'd.ts' },
      /option "specs" is required and must be a non-empty glob pattern string/,
    ],
    [
      { specs: 's', definitions: 'd', output: 'x' },
      /unknown option "output"\. Known options: "specs", "definitions", "outputDir"/,
    ],
    [{ specs: 42, definitions: 'd' }, /option "specs" must be .*Received: 42 \(number\)\./],
    [{ specs: [], definitions: 'd' }, /option "specs" must be .*Received: \[\] \(array\)\./],
    [{ specs: '  ', definitions: 'd' }, /option "specs" must be .*Received: " {2}" \(string\)\./],
    [
      { specs: ['a', 1], definitions: 'd' },
      /option "specs\[1\]" must be a non-empty glob pattern string\. Received: 1 \(number\)\./,
    ],
    [{ specs: 's' }, /option "definitions" is required/],
    [
      { ...minimal, outputDir: '' },
      /option "outputDir" must be a non-empty string\. Received: "" \(string\)\./,
    ],
    [
      { ...minimal, outputDir: '.' },
      /option "outputDir" must be a dedicated directory .*Received: "\." \(string\)/,
    ],
    [{ ...minimal, outputDir: '..' }, /option "outputDir" must be a dedicated directory/],
    [
      { ...minimal, language: 'e n' },
      /option "language" must be a language code such as "en"\. Received: "e n" \(string\)\./,
    ],
    [
      { ...minimal, language: 'fr' },
      /option "language" must be one of the supported languages \("en", "ja"\)\. Received: "fr" \(string\)\./,
    ],
    [
      { ...minimal, language: 1 },
      /option "language" must be a non-empty string\. Received: 1 \(number\)\./,
    ],
    [
      { ...minimal, tags: false },
      /option "tags" must be a non-empty string\. Received: false \(boolean\)\./,
    ],
    [
      { ...minimal, tags: '@smoke and' },
      /option "tags" must be a tag expression such as "@smoke and not @wip"\. Invalid tag expression '@smoke and' \(column 11\): expected a tag, 'not' or '\(' after 'and', found the end of the expression\./,
    ],
    [
      { ...minimal, quotes: 'backtick' },
      /option "quotes" must be "single" or "double"\. Received: "backtick" \(string\)\./,
    ],
    [
      { ...minimal, includeDrafts: 'yes' },
      /option "includeDrafts" must be a boolean\. Received: "yes" \(string\)\./,
    ],
    [
      { ...minimal, verbose: 'yes' },
      /option "verbose" must be a boolean\. Received: "yes" \(string\)\./,
    ],
    [
      { ...minimal, configDir: 3 },
      /option "configDir" must be a non-empty string\. Received: 3 \(number\)\./,
    ],
    [
      { ...minimal, importTestFrom: 1 },
      /option "importTestFrom" must be a non-empty file path string or an object/,
    ],
    [
      { ...minimal, importTestFrom: {} },
      /option "importTestFrom\.file" must be a non-empty file path string\. Received: undefined\./,
    ],
    [
      { ...minimal, importTestFrom: { file: 'f.ts', name: 'x' } },
      /unknown key "name" in option "importTestFrom"/,
    ],
    [
      { ...minimal, importTestFrom: { file: 'f.ts', varName: 'my-test' } },
      /option "importTestFrom\.varName" must be a valid JavaScript identifier\. Received: "my-test" \(string\)\./,
    ],
  ])('rejects %j', (input, message) => {
    expect(errorOf(input)).toMatch(message);
  });
});

describe('describeValue', () => {
  it('describes values compactly', () => {
    expect(describeValue(undefined)).toBe('undefined');
    expect(describeValue(() => 1)).toBe('a function');
    expect(describeValue({ a: 1 })).toBe('{"a":1} (object)');
    expect(describeValue(Symbol('s'))).toBe('Symbol(s) (symbol)');
    expect(describeValue(10n)).toBe('10 (bigint)');
    expect(describeValue('x'.repeat(200))).toMatch(/^"x+\.\.\. \(string\)$/);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(describeValue(circular)).toBe('{...} (object)');
  });
});
