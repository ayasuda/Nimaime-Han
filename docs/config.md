# Configuration — `defineSanmaimeConfig()`

Nimaime-Han is configured from `playwright.config.ts`, the same way playwright-bdd is configured with
`defineBddConfig()`. `defineSanmaimeConfig()` validates the options, registers them for the
`nimaime-gen` CLI, and returns the absolute output directory, which you use as Playwright's `testDir`:

```ts
import { defineConfig } from '@playwright/test';
import { defineSanmaimeConfig } from 'nimaime-han';

const testDir = defineSanmaimeConfig({
  specs: 'specs/**/*.sanmaime',
  definitions: 'definitions/**/*.ts',
});

export default defineConfig({ testDir });
```

Workflow: `npx nimaime-gen && npx playwright test`. `nimaime-gen` loads the Playwright config, reads
every config registered by `defineSanmaimeConfig()` and generates `.spec.ts` files into each
`outputDir`; Playwright then runs them from `testDir`. See [cli.md](./cli.md) for the CLI.

## Options

| Option           | Type                                           | Default           | Description                                                                                                                                                                                                                                                                         |
| ---------------- | ---------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `specs`          | `string \| string[]`                           | — (required)      | Glob pattern(s) of `.sanmaime` files. Relative patterns are relative to `configDir`. Negated patterns (`!…`) are passed through to the glob engine.                                                                                                                                 |
| `definitions`    | `string \| string[]`                           | — (required)      | Glob pattern(s) of the TypeScript/JavaScript files with element and condition definitions (`createNimaime(test)`). Relative to `configDir`.                                                                                                                                         |
| `outputDir`      | `string`                                       | `'.sanmaime-gen'` | Directory for generated spec files; returned (absolute) by `defineSanmaimeConfig()`. Must be a dedicated directory: not `configDir` itself nor one of its parents, because generated files in it may be deleted and regenerated.                                                    |
| `language`       | `string`                                       | `'en'`            | Keyword language of `.sanmaime` files that have no `# language:` directive (see [sanmaime.md §3.4](./sanmaime.md) and [i18n.md](./i18n.md)). Must be a supported language code (`'en'`, `'ja'`); others are rejected.                                                               |
| `tags`           | `string`                                       | —                 | Tag expression selecting the tests to generate, e.g. `'@smoke and not @wip'` (Cucumber syntax: `and`, `or`, `not`, parentheses); tests whose tags do not match are not generated. `nimaime-gen --tags` overrides it. A syntax error is rejected. See [cli.md, Tags](./cli.md#tags). |
| `includeDrafts`  | `boolean`                                      | `false`           | Also generate the specifications whose header says `# status: draft`; by default drafts are skipped. `nimaime-gen --include-drafts` does the same for one run. See [review-workflow.md](./review-workflow.md).                                                                      |
| `importTestFrom` | `string \| { file: string; varName?: string }` | —                 | File that exports a custom Playwright `test` (e.g. made with `test.extend()` for custom fixtures). Generated specs import `test` from it instead of `@playwright/test`. A string is shorthand for `{ file, varName: 'test' }`.                                                      |
| `quotes`         | `'single' \| 'double'`                         | `'single'`        | Quote style of string literals in generated code.                                                                                                                                                                                                                                   |
| `verbose`        | `boolean`                                      | `false`           | Print extra information while generating.                                                                                                                                                                                                                                           |
| `configDir`      | `string`                                       | see below         | Base directory for all relative paths above.                                                                                                                                                                                                                                        |

Unknown options are rejected, so typos are reported instead of silently ignored.

### Base directory (`configDir`)

Relative paths are resolved against, in order of precedence:

1. the `configDir` option (itself resolved against `process.cwd()` when relative);
2. `process.env.NIMAIME_CONFIG_DIR`, which `nimaime-gen` sets to the directory of the Playwright config
   file while evaluating it;
3. `process.cwd()`.

Playwright does not change the working directory when it loads the config. `nimaime-gen` always
resolves against the config's directory, but `playwright test` resolves against the directory it was
started from. If you may run `playwright test -c path/to/config` from another directory, pin the
base directory so both tools agree:

```ts
const testDir = defineSanmaimeConfig({
  configDir: import.meta.dirname, // or __dirname in a CommonJS config
  specs: 'specs/**/*.sanmaime',
  definitions: 'definitions/**/*.ts',
});
```

## Several configurations (Playwright projects)

`defineSanmaimeConfig()` may be called several times, typically once per Playwright project. Each call
needs its own `outputDir`:

```ts
export default defineConfig({
  projects: [
    {
      name: 'admin',
      testDir: defineSanmaimeConfig({
        specs: 'specs/admin/**/*.sanmaime',
        definitions: 'definitions/**/*.ts',
        outputDir: '.sanmaime-gen/admin',
      }),
    },
    {
      name: 'public',
      testDir: defineSanmaimeConfig({
        specs: 'specs/public/**/*.sanmaime',
        definitions: 'definitions/**/*.ts',
        outputDir: '.sanmaime-gen/public',
      }),
    },
  ],
});
```

Calling it again with identical options and the same `outputDir` is allowed (Playwright evaluates the
config file several times: in the runner and again in every worker). Calling it with _different_
options for the same `outputDir` throws.

## Validation errors

Invalid options throw a `SanmaimeConfigError` (exported from `nimaime-han`) naming the option, what is
expected and what was received, for example:

```text
Invalid Sanmaime config: option "quotes" must be "single" or "double". Received: "backtick" (string).
Invalid Sanmaime config: option "language" must be one of the supported languages ("en", "ja"). Received: "fr" (string).
Invalid Sanmaime config: option "specs" is required and must be a non-empty glob pattern string or a non-empty array of glob pattern strings.
Invalid Sanmaime config: unknown option "output". Known options: "specs", "definitions", "outputDir", ...
```

## How the configuration reaches `nimaime-gen`

The design mirrors playwright-bdd's `defineBddConfig()` / `bddgen`:

1. `nimaime-gen` finds the Playwright config: the file or directory given with `-c` / `--config`
   (relative to the current directory), otherwise the current directory. In a directory it looks for
   `playwright.config.ts`, `.js`, `.mts`, `.mjs`, `.cts`, `.cjs`, in that order (Playwright's order).
2. It sets `NIMAIME_CONFIG_DIR` to the config file's directory and evaluates the file with Playwright's
   own loader (the internal `requireOrImport()`, which installs Playwright's TypeScript transform and
   honours `tsconfig` `paths`), so TypeScript configs behave exactly as under `playwright test`.
   This internal dependency is isolated in `src/config/playwright-internals.ts`.
3. Each `defineSanmaimeConfig()` call stores its resolved configuration in `process.env.NIMAIME_CONFIGS`.
4. `nimaime-gen` reads them back with `getSanmaimeConfigs()`.

An environment variable is used instead of module state because the config may run a different
instance of nimaime-han than the CLI (ESM vs CJS build, or sources transformed by Playwright), and
because Playwright workers inherit the runner's environment.

### Environment variables

| Variable             | Set by                   | Format                                                                                        |
| -------------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| `NIMAIME_CONFIGS`    | `defineSanmaimeConfig()` | JSON object `{ "<absolute outputDir>": ResolvedSanmaimeConfig, ... }`, in registration order. |
| `NIMAIME_CONFIG_DIR` | `nimaime-gen`            | Absolute directory of the Playwright config file being evaluated (unset afterwards).          |

Both are internal: do not set them manually. A `ResolvedSanmaimeConfig` has every default applied:

```ts
interface ResolvedSanmaimeConfig {
  configDir: string; // absolute
  specs: string[]; // glob patterns as written; relative ones are relative to configDir
  definitions: string[]; // same
  outputDir: string; // absolute
  language: string;
  tags?: string;
  includeDrafts: boolean;
  importTestFrom?: { file: string /* absolute */; varName: string };
  quotes: 'single' | 'double';
  verbose: boolean;
}
```

Glob patterns are kept as written (not joined with `configDir`) so that characters with a special
meaning in globs (`[`, `(`, `*`, …) in the project path cannot change their meaning; tools should glob
them with `cwd: configDir`.

---

See also: [getting-started.md](./getting-started.md) · [cli.md](./cli.md) ·
[definitions.md](./definitions.md) · [api.md](./api.md#definesanmaimeconfigconfig) ·
[documentation index](./README.md)
