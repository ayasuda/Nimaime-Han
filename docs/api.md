# API reference

The public API of the `nimaime-han` package. It has four entry points, each available as an ES
module and as CommonJS, with type declarations:

| Entry point                                    | Used from                                                    | Counterpart in playwright-bdd      |
| ---------------------------------------------- | ------------------------------------------------------------ | ---------------------------------- |
| [`nimaime-han`](#nimaime-han)                  | `playwright.config.ts` and definition files                  | `defineBddConfig`, `createBdd`     |
| [`nimaime-han/runtime`](#nimaime-hanruntime)   | generated specs, hand-written specs and playwright-bdd steps | `$bddContext`, `$test`, … fixtures |
| [`nimaime-han/parser`](#nimaime-hanparser)     | tools that read `.sanmaime` files                            | `@cucumber/gherkin`                |
| [`nimaime-han/reporter`](#nimaime-hanreporter) | the `reporter` option of `playwright.config.ts`              | the Cucumber reporter              |

The command-line tools `nimaime-gen` and `nimaime` are described in [cli.md](./cli.md). Their
implementation (`src/gen/`, `src/draft/`) is internal and not exported.

Nimaime-Han is experimental and at 0.x: a breaking change to anything on this page bumps the minor
version ([releasing.md](./releasing.md#versioning-policy)).

---

## `nimaime-han`

```ts
import {
  defineSanmaimeConfig,
  createNimaime,
  SanmaimeConfigError,
  NimaimeDefinitionError,
  NimaimeRuntimeError,
  NimaimeExpectationError,
  NimaimeHookError,
  parseExpectationFailure,
  VERSION,
} from 'nimaime-han';
```

### `defineSanmaimeConfig(config)`

```ts
function defineSanmaimeConfig(config: SanmaimeConfig): string;
```

Registers a Sanmaime configuration in `playwright.config.ts` and returns the **absolute output
directory**, to use as Playwright's `testDir`. Call it once per Playwright project that needs its
own settings, each with its own `outputDir`. Throws a `SanmaimeConfigError` for an invalid option,
an unknown option, or a second call with different options for the same `outputDir`.

```ts
const testDir = defineSanmaimeConfig({
  specs: 'specs/**/*.sanmaime',
  definitions: 'definitions/**/*.ts',
});
export default defineConfig({ testDir });
```

`SanmaimeConfig`:

| Option           | Type                                           | Default           | Description                                                                                                    |
| ---------------- | ---------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `specs`          | `string \| readonly string[]`                  | — (required)      | Glob pattern(s) of `.sanmaime` files, relative to `configDir`; `!pattern` excludes.                            |
| `definitions`    | `string \| readonly string[]`                  | — (required)      | Glob pattern(s) of the definition files (`createNimaime()` calls), relative to `configDir`.                    |
| `outputDir`      | `string`                                       | `'.sanmaime-gen'` | Where `nimaime-gen` writes the generated specs; returned (absolute) by `defineSanmaimeConfig()`.               |
| `language`       | `string`                                       | `'en'`            | Keyword language of files without `# language:` (`'en'`, `'ja'`).                                              |
| `tags`           | `string`                                       | —                 | Tag expression selecting the tests to generate (`'@smoke and not @wip'`); `nimaime-gen --tags` overrides it.   |
| `includeDrafts`  | `boolean`                                      | `false`           | Also generate the specifications marked `# status: draft`.                                                     |
| `importTestFrom` | `string \| { file: string; varName?: string }` | —                 | File exporting a custom `test` (from `test.extend()`) for the generated specs; `varName` defaults to `'test'`. |
| `quotes`         | `'single' \| 'double'`                         | `'single'`        | Quote style of the generated code.                                                                             |
| `verbose`        | `boolean`                                      | `false`           | Print extra information while generating.                                                                      |
| `configDir`      | `string`                                       | see config.md     | Base directory of the relative paths above.                                                                    |

Details, validation messages and how the configuration reaches `nimaime-gen`: [config.md](./config.md).

Types: `SanmaimeConfig`, `ResolvedSanmaimeConfig` (every default applied, paths absolute),
`GlobPatterns` (`string | readonly string[]`), `ImportTestFrom`, `ResolvedImportTestFrom`,
`QuoteStyle`.

### `createNimaime(test?)`

```ts
function createNimaime<T extends TestType<any, any> = typeof test /* @playwright/test */>(
  test?: T,
): NimaimeDefinitions<FixturesOf<T>, WorkerFixturesOf<T>>;
```

Returns the functions that bind Sanmaime names to the application, typed with the fixtures of
`test` (the built-in Playwright fixtures when `test` is omitted). The counterpart of playwright-bdd's
`createBdd(test)`. Throws a `NimaimeDefinitionError` if `test` is not a Playwright `test`.

```ts
import { test } from './fixtures'; // or '@playwright/test'
import { createNimaime } from 'nimaime-han';

const {
  defineScreen,
  defineElement,
  defineCondition,
  beforeScreen,
  afterScreen,
  beforeElement,
  afterElement,
} = createNimaime(test);
```

| Function                                          | Binds / runs                                                                | Details                                                                                      |
| ------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `defineScreen(name, { open? })`                   | `Screen: name`; `open(fixtures)` reaches its base state                     | [definitions.md](./definitions.md#definescreenname--open-)                                   |
| `defineElement(name, targets)`                    | `Element: name`; `targets` maps target names to `(fixtures) => Locator`     | [definitions.md](./definitions.md#defineelementname-targets--defineelementname-self-targets) |
| `defineElement(name, self, targets?)`             | the same, plus `self`: the element itself (for bare `Enable`, `Check`, …)   | same                                                                                         |
| `defineCondition(name, fn, { screen? })`          | `When:` / `And when:` / `Background:` `name`; `fn(fixtures)` sets the state | [definitions.md](./definitions.md#defineconditionname-fn--screen-)                           |
| `beforeScreen(fn, { screen?, tags? })`            | before the tests of a screen, once per worker (`test.beforeAll`)            | [hooks.md](./hooks.md)                                                                       |
| `afterScreen(fn, { screen?, tags? })`             | after them (`test.afterAll`)                                                | [hooks.md](./hooks.md)                                                                       |
| `beforeElement(fn, { screen?, element?, tags? })` | before every test of an element (`test.beforeEach`)                         | [hooks.md](./hooks.md)                                                                       |
| `afterElement(fn, { screen?, element?, tags? })`  | after every test of an element (`test.afterEach`)                           | [hooks.md](./hooks.md)                                                                       |

Signatures (`F` = the fixtures of `test`, `W` = its worker fixtures):

```ts
defineScreen(name: string, options?: { open?: (fixtures: F) => unknown }): void;
defineElement(name: string, targets: Record<string, (fixtures: F) => Locator>): void;
defineElement(
  name: string,
  self: (fixtures: F) => Locator,
  targets?: Record<string, (fixtures: F) => Locator>,
): void;
defineCondition(name: string, fn: (fixtures: F) => unknown, options?: { screen?: string }): void;

beforeScreen(fn: (fixtures: W, info: { screen: string }) => unknown, options?: { screen?: string; tags?: string }): void;
afterScreen(fn: (fixtures: W, info: { screen: string }) => unknown, options?: { screen?: string; tags?: string }): void;
beforeElement(
  fn: (fixtures: F, info: { screen: string; element: string; condition?: string }) => unknown,
  options?: { screen?: string; element?: string; tags?: string },
): void;
afterElement(
  fn: (fixtures: F, info: { screen: string; element: string; condition?: string }) => unknown,
  options?: { screen?: string; element?: string; tags?: string },
): void;
```

- Callbacks may return a promise; it is awaited and its value ignored.
- Every callback receives the fixtures of the running test as its only (first) argument. Destructure
  what you use (`({ page, login }) => …`): `nimaime-gen` reads that pattern to make the generated
  test request exactly those fixtures ([runtime.md](./runtime.md#why-the-fixtures-are-passed-explicitly)).
- The `$tags` fixture (the tags of the running test) is part of `F`.
- Duplicate names in the same scope throw a `NimaimeDefinitionError` naming both call sites;
  re-registering the same call site is ignored.
- The `tags` option of hooks is stored but **not applied yet** ([hooks.md](./hooks.md#tags-not-supported-yet)).

Types: `NimaimeDefinitions<F, W>`, `DefineScreen`, `DefineElement`, `DefineCondition`,
`DefineScreenHook`, `DefineElementHook`, `LocatorFn<F>`, `ConditionFn<F>`, `OpenScreenFn<F>`,
`ScreenOptions<F>`, `ElementTargets<F>`, `ConditionOptions`, `ScreenHookFn<W>`, `ElementHookFn<F>`,
`ScreenHookOptions`, `ElementHookOptions`, `ScreenHookInfo`, `ElementHookInfo`, `HookInfo`,
`HookKind` (`'beforeScreen' | 'afterScreen' | 'beforeElement' | 'afterElement'`),
`FixturesOf<T>` (test and worker fixtures of a `test` type, plus `$tags`), `WorkerFixturesOf<T>`,
`DefaultFixtures`, `DefaultWorkerFixtures`.

### Errors

Every error class sets `name`, so match on `error.name` when an error may come from another copy of
the package (the ESM and CJS builds are separate classes, and `instanceof` fails across them).

| Class                     | Thrown when                                                                                                                                                     | Also exported from |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `SanmaimeConfigError`     | `defineSanmaimeConfig()` gets an invalid or unknown option.                                                                                                     | —                  |
| `NimaimeDefinitionError`  | A definition is invalid or a duplicate; `createNimaime()` gets something that is not a `test`; a screen spec is registered twice from different files.          | `/runtime`         |
| `NimaimeRuntimeError`     | At run time: a name does not resolve (element, target, `self`, condition, spec), a plan is malformed, or a definition reads a fixture the test did not provide. | `/runtime`         |
| `NimaimeExpectationError` | An expectation did not hold. The message starts with the Sanmaime header; `error.sanmaime` is the structured context, `error.original` Playwright's error.      | `/runtime`         |
| `NimaimeHookError`        | A hook threw (`BeforeElement hook for Element "X" failed: …`); `cause` is the original error.                                                                   | `/runtime`         |

`parseExpectationFailure(message)` and the `ExpectationFailureJSON` type are re-exported from
[`nimaime-han/runtime`](#failures) for reporters.

### Other exports

- `VERSION` — the package version (`string`), the same as `nimaime-gen --version`.
- Types for LLM adapters of `nimaime draft` ([draft.md](./draft.md#llm-adapters)): `LlmAdapter`
  (`(request: LlmRequest) => Promise<string>`), `LlmRequest` (`{ system, prompt, observation,
candidate }`), `ScreenObservation`, `ObservedElement`, `ObservedRegion`.

---

## `nimaime-han/runtime`

What generated specs import at test time: the `$nimaime` fixture that executes Sanmaime, the
definition and spec registries, and the vocabulary table. Also what hand-written specs and
playwright-bdd steps use ([with-gherkin.md](./with-gherkin.md)). The concepts are explained in
[runtime.md](./runtime.md).

### `test`, `expect`, `nimaimeFixtures`, `createNimaimeTest(base)`

```ts
const test: TestType<
  PlaywrightTestArgs & PlaywrightTestOptions & NimaimeTestArgs,
  PlaywrightWorkerArgs & PlaywrightWorkerOptions
>;
const expect: typeof import('@playwright/test').expect; // re-export
const nimaimeFixtures: Fixtures<NimaimeTestArgs, object, NimaimeTagsTestArgs>;
function createNimaimeTest<T extends TestType<any, any>>(base: T): NimaimeTestType<T>;

interface NimaimeTestArgs {
  $nimaime: Nimaime; // test-scoped, boxed
  $tags: string[]; // the tags of the running test
}
```

- `test` is `@playwright/test`'s `test` with `$nimaime` and `$tags`.
- `createNimaimeTest(base)` is `base.extend(nimaimeFixtures)`, typed so that `base`'s custom
  fixtures are kept; generated specs call it with the `importTestFrom` test.
- `nimaimeFixtures` adds the same fixtures to any `test`, e.g. playwright-bdd's:
  `export const test = base.extend(nimaimeFixtures)`.
- `tagsFixtures` (`$tags` alone) and `tagsOf(testInfo)` (deduplicated `testInfo.tags`, `[]` before
  Playwright 1.43) are exported too.

### `$nimaime`

```ts
interface Nimaime {
  run(fixtures: object, plan: NimaimePlan): Promise<void>;
  verify(fixtures: object, screen: string, options?: VerifyOptions): Promise<void>;
  screen(fixtures: object, screen: string, ctx?: ExpectationContext): Promise<void>;
  condition(fixtures: object, condition: string, ctx?: ExpectationContext): Promise<void>;
  background(fixtures: object, condition: string, ctx?: ExpectationContext): Promise<void>;
  expectShow(
    fixtures: object,
    element: string,
    target: string,
    ctx?: ExpectationContext,
  ): Promise<void>;
  expectHide(
    fixtures: object,
    element: string,
    target: string,
    ctx?: ExpectationContext,
  ): Promise<void>;
  expectEnable(fixtures: object, element: string, ctx?: ExpectationContext): Promise<void>;
  expectDisable(fixtures: object, element: string, ctx?: ExpectationContext): Promise<void>;
  check(
    fixtures: object,
    element: string,
    expectation: NimaimeExpectation,
    ctx?: ExpectationContext,
  ): Promise<void>;
}
```

`fixtures` is always the object of fixtures the test destructured (`{ page, login }`); the
definitions receive it.

| Method                                           | Does                                                                                                                                                     |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run(fixtures, plan)`                            | What generated tests call: validates the plan, opens the screen, runs the `background` and block `conditions`, checks every expectation in its own step. |
| `verify(fixtures, screen, { when?, elements? })` | Checks the **current page** against a screen's spec loaded with `loadSanmaimeSpecs()`, without opening it or running conditions (Gherkin `Then` steps).  |
| `screen(fixtures, screen, ctx?)`                 | Runs the screen's `open`, once per test (no definition or no `open`: nothing).                                                                           |
| `condition(fixtures, name, ctx?)`                | Runs a condition (scoped to `ctx.screen` first, then global), once per test; step `When: name`.                                                          |
| `background(fixtures, name, ctx?)`               | The same, with the step titled `Background: name`.                                                                                                       |
| `expectShow` / `expectHide`                      | `Show: target` / `Hide: target` of an element.                                                                                                           |
| `expectEnable` / `expectDisable`                 | `Enable` / `Disable` of the element itself (its `self` locator).                                                                                         |
| `check(fixtures, element, expectation, ctx?)`    | Any expectation kind of the vocabulary (`{ kind: 'text', target: 'Title', value: 'Welcome' }`).                                                          |

```ts
interface NimaimePlan {
  screen: string;
  element: string;
  background?: readonly string[]; // the screen's Background: names
  conditions?: readonly string[]; // When: name, then each And when: name; omitted for the unconditional block
  condition?: string; // older form of conditions: [condition]; ignored when conditions is set
  expectations: readonly NimaimeExpectation[];
  file?: string; // the .sanmaime file, relative to the running spec file
  locations?: {
    screen?: SanmaimePosition;
    element?: SanmaimePosition;
    background?: readonly SanmaimePosition[];
    conditions?: readonly SanmaimePosition[];
    condition?: SanmaimePosition;
  };
}
interface NimaimeExpectation {
  kind: ExpectationKind; // 'show' | 'hide' | 'enable' | … | 'count'
  target?: string; // absent for a state kind about the element itself
  value?: string | number; // text / contain: string, count: number
  location?: SanmaimePosition;
}
interface SanmaimePosition {
  line: number; // 1-based
  column: number; // 1-based
}
interface ExpectationContext {
  screen?: string;
  condition?: string; // shown in failures ('A and B' for a block with And when:)
  file?: string;
  location?: SanmaimePosition;
}
interface VerifyOptions {
  when?: string | readonly string[]; // the When: state(s) the page is in
  elements?: string | readonly string[]; // default: every element of the screen
}
```

Order of execution, step titles and errors: [runtime.md](./runtime.md#the-nimaime-api);
`verify()`: [with-gherkin.md](./with-gherkin.md#nimaimeverifyfixtures-screen-options).

Helpers around plans: `validatePlan(plan)` and `validateExpectations(plan)` (throw
`NimaimeRuntimeError`), `collectFixtureNames(plan)` → `{ names, unknown }` (the fixtures a plan's
definitions destructure), `fixtureNamesOf(fn)` → `string[] | undefined`, `planConditions(plan)`,
`planConditionTitle(plan)`, `planConditionLocation(plan, index)`, `planVerify(screen, options)` →
`VerifyPlan` (what a `verify` call checks; throws on unknown names), `EXPECTATION_KEYWORDS`
(kind → English keyword), `expectationTitle(kind, target?, value?)` (the step title).
`createNimaimeRuntime(driver)` and `playwrightDriver(testInfo)` build a `Nimaime` with another step
driver (unit tests).

### Specs at run time: `loadSanmaimeSpecs`, `registerScreenSpec`

```ts
function loadSanmaimeSpecs(
  files: string | readonly string[], // paths or globs; '!pattern' excludes; node_modules is skipped
  options?: { language?: string; cwd?: string },
): Promise<ScreenSpec[]>;

function registerScreenSpec(spec: ScreenSpec): void;
function findScreenSpec(name: string): ScreenSpec | undefined;
function listScreenSpecs(): ScreenSpec[];
function resetScreenSpecs(): void;
function screenSpecsFromDocument(document: SanmaimeDocument, file?: string): ScreenSpec[];
```

`loadSanmaimeSpecs()` reads, parses and registers every screen of the matched files for
`$nimaime.verify()`. It throws a `NimaimeRuntimeError` when no file matches or a file has errors
(nothing is registered then), and a `NimaimeDefinitionError` when a screen name is registered from
two files. `ScreenSpec` is `{ screen, file?, location?, background?, elements: ElementSpec[] }`,
`ElementSpec` is `{ element, location?, unconditional, conditions: ConditionSpec[] }` and
`ConditionSpec` is `{ name, conditions?, location?, expectations }` (expectations are
`NimaimeExpectation`s). See [with-gherkin.md](./with-gherkin.md#2-load-the-sanmaime-specs).

### Definition registry

The registry filled by `createNimaime()` definitions, shared by every copy of the package in a
process (it lives on `globalThis`):

| Function                                | Returns                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| `findScreen(name)`                      | `ScreenDefinition \| undefined` — `{ name, open, source, test, customTest }` |
| `findElement(name)`                     | `ElementDefinition \| undefined` — `{ …, self, targets: ReadonlyMap }`       |
| `findCondition(name, { screen? })`      | `ConditionDefinition \| undefined` — screen-scoped first, then global        |
| `listDefinitions()`                     | `{ screens, elements, conditions }`                                          |
| `findHooks(kind, { screen, element? })` | `HookDefinition[]` that apply, in execution order                            |
| `hooksFor(screen, element?)`            | `HookSet` — `{ before, after }`                                              |
| `getRegistry()`                         | `Registry` — the raw maps and the hook list                                  |
| `resetRegistry()`                       | removes every definition (tests)                                             |

Types: `ScreenDefinition`, `ElementDefinition`, `ConditionDefinition`, `HookDefinition`,
`DefinitionBase`, `DefinitionList`, `ConditionScopes`, `HookSet`, `Registry`, `SourceLocation`
(`{ file, line, column }`). See [definitions.md](./definitions.md#registry-for-the-generator-and-the-runtime).

### Hooks: `runHooks(kind, fixtures, info)`

```ts
const runHooks: (kind: HookKind, fixtures: object, info: HookInfo) => Promise<void>;
```

Runs the hooks of `kind` that apply to `info.screen` (and `info.element`), each in a step
(`BeforeElement: Login Form`, …). Generated specs call it from `test.beforeAll` / `afterAll` /
`beforeEach` / `afterEach`; hand-written specs may too. Also exported: `createHookRunner(driver)`,
`playwrightHookDriver`, `HOOK_TITLES`, and the types `RunHooks`, `HookDriver`. See
[hooks.md](./hooks.md#runtime-runhookskind-fixtures-info).

### The vocabulary: `EXPECTATIONS`

`EXPECTATIONS` is the one table of expectation keywords: parser, generator, runtime, reporter,
snippets and the editor grammar all read it. One entry per kind:

| Kind       | Keyword    | Arity             | Playwright            | `describeExpected` (`Expected:`)   |
| ---------- | ---------- | ----------------- | --------------------- | ---------------------------------- |
| `show`     | `Show`     | `target`          | `toBeVisible()`       | `T is shown`                       |
| `hide`     | `Hide`     | `target`          | `toBeHidden()`        | `T is hidden`                      |
| `enable`   | `Enable`   | `optional-target` | `toBeEnabled()`       | `enabled` / `T is enabled`         |
| `disable`  | `Disable`  | `optional-target` | `toBeDisabled()`      | `disabled` / `T is disabled`       |
| `check`    | `Check`    | `optional-target` | `toBeChecked()`       | `checked` / `T is checked`         |
| `uncheck`  | `Uncheck`  | `optional-target` | `not.toBeChecked()`   | `not checked` / `T is not checked` |
| `focus`    | `Focus`    | `optional-target` | `toBeFocused()`       | `focused` / `T is focused`         |
| `editable` | `Editable` | `optional-target` | `toBeEditable()`      | `editable` / `T is editable`       |
| `readonly` | `ReadOnly` | `optional-target` | `not.toBeEditable()`  | `read-only` / `T is read-only`     |
| `empty`    | `Empty`    | `optional-target` | `toBeEmpty()`         | `empty` / `T is empty`             |
| `text`     | `Text`     | `target-value`    | `toHaveText(text)`    | `T has text "x"`                   |
| `contain`  | `Contain`  | `target-value`    | `toContainText(text)` | `T contains text "x"`              |
| `count`    | `Count`    | `target-value`    | `toHaveCount(n)`      | `Count of T is n`                  |

Each entry is an `ExpectationSpec`: `{ kind, keyword, slot, arity, valueType?, family, playwright,
matcher, describeExpected, parseExpected, probeActual }` ([expectations.md](./expectations.md#where-the-vocabulary-lives)).

Helpers: `EXPECTATION_KINDS`, `isExpectationKind(x)`, `expectationSpec(kind)`,
`kindOfKeyword(keyword)` (`'ReadOnly'` → `'readonly'`), `describeExpectation(kind, target?, value?)`,
`parseExpectationTitle(title)` and `parseExpectedText(text)` (→ `ParsedExpectation`
`{ kind, target, value? }`), `splitTargetValue(argument)`, `parseTextLiteral(literal)`,
`parseIntLiteral(literal)`, `parseValue(type, literal)`, `formatTextLiteral(text)`,
`formatValue(value)`. Types: `ExpectationKind`, `ExpectationKeyword`, `ExpectationArity`,
`ExpectationSlot`, `ExpectationSpec`, `ExpectationValue`, `ExpectationValueType`, `StateKind`,
`ValueKind`, `PlaywrightExpect`.

### Failures

```ts
class NimaimeExpectationError extends Error {
  readonly sanmaime: ExpectationFailureContext; // { screen, element, condition, kind, target, value?,
  //                                               file, location, expected, actual, timeout?, locator? }
  readonly original: unknown; // Playwright's error
  toJSON(): ExpectationFailureJSON;
}
function parseExpectationFailure(message: string): ExpectationFailureJSON | undefined;
```

`parseExpectationFailure()` recovers the structured failure from an error message (what a reporter
receives from a worker); it accepts the `NimaimeExpectationError: ` prefix and ANSI codes, and
returns `undefined` for any other message. `ExpectationFailureJSON` is `{ name, screen, element,
condition, expectation: { kind, target, value? }, expected, actual, timeout, locator, file, line,
column, header, details, message }` (absent values are `null`).

The formatting functions are exported too: `formatExpectationFailure(ctx, error)`,
`formatFailureHeader(ctx)`, `formatFailureDetails(ctx, error)`, `formatActual(actual, timeout)`,
`describeExpected(…)`, `describeLocator(locator)`, `detectTimeout(error)`, `probeActual(…)`,
`createExpectationError(…)`; types `ExpectationFailureContext`, `SanmaimeFrame`. The message format
is described in [runtime.md](./runtime.md#failures).

### Errors

`NimaimeRuntimeError`, `NimaimeExpectationError`, `NimaimeDefinitionError` and `NimaimeHookError`,
the same classes as in [`nimaime-han`](#errors).

---

## `nimaime-han/parser`

The Sanmaime parser: pure functions from source text to an AST and diagnostics, with no Node.js
dependency (read the file yourself and pass the text). The language is specified in
[sanmaime.md](./sanmaime.md).

```ts
import { parse, formatDiagnostic } from 'nimaime-han/parser';

const { document, diagnostics } = parse(source, { uri: 'specs/login.sanmaime' });
for (const d of diagnostics) console.error(formatDiagnostic(d, document.uri));
// specs/login.sanmaime:7:5: error SANMAIME_E007: 'And:' must follow 'Show:', 'Hide:' or 'And:' in the same block.
```

### `parse(source, options?)`

```ts
function parse(source: string, options?: { uri?: string; language?: string }): ParseResult;

interface ParseResult {
  document: SanmaimeDocument; // best effort; no defined meaning when diagnostics has an error
  diagnostics: Diagnostic[]; // sorted by line and column; empty for a valid file
}
```

- Never throws for problems in the source: they are diagnostics.
- `uri` is copied to `document.uri` (for messages only).
- `language` is the keyword language of a file without a valid `# language:` directive (default
  `'en'`). An unsupported code **throws a `TypeError`** (a configuration error).

### `formatDiagnostic(diagnostic, uri?)`

```ts
function formatDiagnostic(diagnostic: Diagnostic, uri?: string): string;
// '<uri>:<line>:<column>: error SANMAIME_E007: <message>' ('<line>:<column>: …' without uri)

interface Diagnostic {
  code: DiagnosticCode; // 'SANMAIME_E001' …
  severity: 'error' | 'warning'; // every current diagnostic is an error
  message: string;
  location: Location; // { line, column }, 1-based, columns in code points
}
```

### `DiagnosticCode`

A constant map from names to the stable codes (codes are never reused; messages may change).
Conditions and locations are normative in [sanmaime.md §7.2](./sanmaime.md#72-error-codes).

| Name                        | Code            | Name                         | Code            |
| --------------------------- | --------------- | ---------------------------- | --------------- |
| `UnrecognisedLine`          | `SANMAIME_E001` | `ConflictsWithUnconditional` | `SANMAIME_E016` |
| `MissingName`               | `SANMAIME_E002` | `InvalidLanguage`            | `SANMAIME_E017` |
| `BareKeywordWithArgument`   | `SANMAIME_E003` | `MisplacedTags`              | `SANMAIME_E018` |
| `ElementOutsideScreen`      | `SANMAIME_E004` | `ReservedKeyword` (retired)  | `SANMAIME_E019` |
| `WhenOutsideElement`        | `SANMAIME_E005` | `InvalidTag`                 | `SANMAIME_E020` |
| `ExpectationOutsideElement` | `SANMAIME_E006` | `BackgroundWithExpectations` | `SANMAIME_E021` |
| `DanglingAnd`               | `SANMAIME_E007` | `DuplicateConditionInChain`  | `SANMAIME_E022` |
| `EmptyConditionBlock`       | `SANMAIME_E008` | `MisplacedAndWhen`           | `SANMAIME_E023` |
| `EmptyElement`              | `SANMAIME_E009` | `InvalidStatus`              | `SANMAIME_E024` |
| `EmptyScreen`               | `SANMAIME_E010` | `MisplacedBackground`        | `SANMAIME_E025` |
| `DuplicateScreen`           | `SANMAIME_E011` | `MissingValue`               | `SANMAIME_E026` |
| `DuplicateElement`          | `SANMAIME_E012` | `InvalidValue`               | `SANMAIME_E027` |
| `DuplicateCondition`        | `SANMAIME_E013` |                              |                 |
| `DuplicateTarget`           | `SANMAIME_E014` |                              |                 |
| `DuplicateState`            | `SANMAIME_E015` |                              |                 |

### Languages

```ts
const LANGUAGES: Readonly<Record<string, LanguageDefinition>>; // { en, ja }, frozen
const SUPPORTED_LANGUAGES: readonly string[]; // ['en', 'ja']
const DEFAULT_LANGUAGE: 'en';
function getLanguage(code: string): LanguageDefinition | undefined;

interface LanguageDefinition {
  code: string; // 'ja'
  name: string; // 'Japanese'
  nativeName: string; // '日本語'
  colons: readonly string[]; // [':', '：']
  keywords: LanguageKeywords; // one array of spellings per keyword slot (screen, element, when, …)
}
```

The dictionaries and how to add a language: [i18n.md](./i18n.md).

### AST

```ts
interface SanmaimeDocument {
  uri: string | undefined;
  language: string; // effective keyword language
  languageDirective: LanguageDirective | undefined; // { value, location }
  status: 'draft' | 'approved'; // from # status:, else 'approved'
  statusDirective?: StatusDirective; // { value, location }
  screens: Screen[];
}
interface Screen {
  name: string;
  tags: Tag[]; // { name: '@smoke', location }
  location: Location; // { line, column }, 1-based
  background: BackgroundEntry[]; // { name, location } per Background: line
  elements: Element[];
}
interface Element {
  name: string;
  tags: Tag[];
  location: Location;
  unconditional: Expectation[]; // before the first When:
  conditions: ConditionBlock[];
}
interface ConditionBlock {
  name: string; // the When: name
  conditions: ConditionRef[]; // When: then each And when: ({ name, keyword: 'When' | 'AndWhen', location })
  title: string; // names joined with ' and '
  tags: Tag[];
  location: Location;
  expectations: Expectation[];
}
type Expectation = VisibilityExpectation | StateExpectation | ValueExpectation;
```

- `VisibilityExpectation` — `{ kind: 'show' | 'hide', target, keyword: 'Show' | 'Hide' | 'And',
viaAnd, location }` (`And:` is already resolved to the kind it continues).
- `StateExpectation` — `{ kind: 'enable' | 'disable' | 'check' | 'uncheck' | 'focus' | 'editable' |
'readonly' | 'empty', keyword, target?, location }` (no `target` = the element itself).
- `ValueExpectation` — `{ kind: 'text' | 'contain', keyword, target, value: string, location }` or
  `{ kind: 'count', keyword: 'Count', target, value: number, location }`.
- `Tag` is `{ name, location }` with the `@`; `BackgroundEntry` is `{ name, location }`.
- Keywords in the AST are always the canonical English ones, whatever the file's language.

Also exported: `SPEC_STATUSES` (`['draft', 'approved']`), `CONDITION_SEPARATOR` (`' and '`),
`joinConditions(names)` (the block title), and the types `ParseOptions`, `ParseResult`,
`Diagnostic`, `DiagnosticSeverity`, `LanguageDefinition`, `LanguageKeywords`, `Location`,
`SpecStatus`, `StatusDirective`, `LanguageDirective`, `ConditionRef`, `BackgroundEntry`, `Tag`.

---

## `nimaime-han/reporter`

A Playwright reporter (the default export) that prints the results of generated Sanmaime tests as a
✓/✗ tree. See [reporter.md](./reporter.md) for the output.

```ts
// playwright.config.ts
export default defineConfig({
  reporter: [['list'], ['nimaime-han/reporter', { quiet: false }]],
});
```

`NimaimeReporterOptions`:

| Option         | Type                                                 | Default          | Description                                                                            |
| -------------- | ---------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------- |
| `colors`       | `boolean`                                            | auto             | ANSI colours. Auto: on for a TTY without `NO_COLOR`; `FORCE_COLOR` forces it on / off. |
| `quiet`        | `boolean`                                            | `false`          | Print only what failed, and the summary.                                               |
| `printSteps`   | `boolean`                                            | `true`           | One line per expectation; `false` prints screens, elements and failures only.          |
| `printDetails` | `boolean`                                            | `false`          | Also print Playwright's error message under each failure.                              |
| `cwd`          | `string`                                             | `process.cwd()`  | Directory that file paths are shown relative to.                                       |
| `output`       | `{ write(chunk: string): unknown; isTTY?: boolean }` | `process.stdout` | Where to write (tests).                                                                |

Programmatic use: `buildReport(tests, cwd)` → `RunReport`, `countReport(report)` → `ReportCounts`,
`renderReport(report, options)`, `renderSummary(report, options)`, `formatDuration(ms)`,
`parseSanmaimeHeader(message)`, `defaultColors(output, env?)`, and the types of the report model
(`RunReport`, `ScreenReport`, `ElementReport`, `BlockReport`, `ExpectationReport`,
`OtherTestReport`, `FailureDetails`, `Status`, …) and of its structural inputs (`ReportSuite`,
`ReportTest`, `ReportResult`, `ReportStep`, …).

---

See also: [getting-started.md](./getting-started.md) · [config.md](./config.md) ·
[definitions.md](./definitions.md) · [hooks.md](./hooks.md) · [runtime.md](./runtime.md) ·
[reporter.md](./reporter.md) · [cli.md](./cli.md) · [documentation index](./README.md)
