# Getting started

This walkthrough takes a Playwright user from an empty directory to a screen specification that
runs as Playwright tests, in about ten minutes. You will:

1. install Nimaime-Han next to `@playwright/test`;
2. register a Sanmaime configuration in `playwright.config.ts`;
3. write a first `.sanmaime` specification — the README's **Login** example;
4. bind its names to the page with TypeScript **definitions**;
5. generate the tests with `nimaime-gen` and run them with `playwright test`;
6. read a failure, and add the Sanmaime reporter.

If you know playwright-bdd, the shape is the same: `.sanmaime` files instead of `.feature` files,
`defineSanmaimeConfig()` instead of `defineBddConfig()`, `nimaime-gen` instead of `bddgen`, and
element / condition definitions instead of step definitions.

A finished version of this project, with a second screen and Japanese keywords, is
[examples/basic](../examples/basic).

## 1. Install

Nimaime-Han needs **Node.js 22** or later and `@playwright/test` 1.40 or later (1.61 or later in an
ES module project, i.e. `"type": "module"`). In an existing Playwright project, add the package; in
an empty directory, create the project first:

```bash
npm init -y                              # only in an empty directory
npm i -D nimaime-han @playwright/test
npx playwright install chromium          # the browser, if Playwright has not installed it yet
```

This installs two commands: `nimaime-gen`, which turns `.sanmaime` files into Playwright tests, and
`nimaime`, which drafts and compares specifications of live screens (see
[What next](#what-next)).

## 2. The screen under test

The specification below describes a login page: an email address, a password and a **Log in**
button that is enabled only while the input is valid. If you do not have such a page at hand, save
this stand-in as `app/login.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Log in</title>
  </head>
  <body>
    <h1>Log in</h1>
    <form id="login-form">
      <p>
        <label>Email address <input name="email" type="email" required /></label>
      </p>
      <p>
        <label>Password <input name="password" type="password" required /></label>
      </p>
      <button type="submit" disabled>Log in</button>
    </form>
    <script>
      // The button is enabled only while every input is valid.
      const form = document.getElementById('login-form');
      const button = form.querySelector('button');
      form.addEventListener('input', () => {
        button.disabled = !form.checkValidity();
      });
      form.addEventListener('submit', (event) => event.preventDefault());
    </script>
  </body>
</html>
```

## 3. Configure Playwright

`defineSanmaimeConfig()` tells `nimaime-gen` where the specifications and the definitions are, and
returns the directory it generates the tests into (`.sanmaime-gen/`), which you pass to Playwright
as `testDir`:

```ts
// playwright.config.ts
import { pathToFileURL } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { defineSanmaimeConfig } from 'nimaime-han';

const testDir = defineSanmaimeConfig({
  specs: 'specs/**/*.sanmaime',
  definitions: 'definitions/**/*.ts',
});

export default defineConfig({
  testDir,
  use: {
    // The stand-in page of this guide. With your own app: 'http://localhost:3000'.
    baseURL: pathToFileURL('app/').href,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

Every other Playwright option (`webServer`, `retries`, `reporter`, projects, …) works as usual.
The options of `defineSanmaimeConfig()` — keyword language, tags, custom fixtures, … — are listed
in [config.md](./config.md).

## 4. Write the specification

Create `specs/login.sanmaime`:

```text
Screen: Login

  Element: Login Form
    Show: Email address
    And: Password
    And: Login button

  Element: Login Button
    When: Input is valid
    Enable

    When: Input is invalid
    Disable
```

Read it as: on the **Login** screen, the **Login Form** always shows an email address, a password
and a login button; the **Login Button** is enabled when the input is valid and disabled when it is
invalid. There are no selectors: `Email address` and `Input is valid` are names, and the
definitions of the next step say what they mean on the page. The language is specified in
[sanmaime.md](./sanmaime.md); every expectation keyword is listed in
[expectations.md](./expectations.md).

## 5. Generate: see what is missing

Run the generator before writing any TypeScript:

```bash
npx nimaime-gen
```

It parses the specification, finds no definitions for its names, writes nothing, and prints
snippets to start from (exit code 1):

```text
Missing definitions: 4

  specs/login.sanmaime:3:3
    Element "Login Form" is not defined

  specs/login.sanmaime:8:3
    Element "Login Button" is not defined

  specs/login.sanmaime:9:5
    Condition "Input is valid" is not defined

  specs/login.sanmaime:12:5
    Condition "Input is invalid" is not defined

Snippets:

// import { createNimaime } from 'nimaime-han';
// const { defineElement, defineCondition } = createNimaime(test);

defineElement('Login Form', {
  'Email address': ({ page }) => page.getByTestId('TODO'),
  Password: ({ page }) => page.getByTestId('TODO'),
  'Login button': ({ page }) => page.getByTestId('TODO'),
});

defineElement('Login Button', ({ page }) => page.getByTestId('TODO'));

// Used on Screen "Login" (add { screen: 'Login' } to define it for that screen only).
defineCondition('Input is valid', async ({ page }) => {
  // TODO: bring the screen into this state
});

// Used on Screen "Login" (add { screen: 'Login' } to define it for that screen only).
defineCondition('Input is invalid', async ({ page }) => {
  // TODO: bring the screen into this state
});

nimaime-gen: nothing was generated into .sanmaime-gen (4 errors).
```

## 6. Define the names

Create `definitions/login.ts` from the snippets, with real locators:

```ts
// definitions/login.ts
import { test } from '@playwright/test';
import { createNimaime } from 'nimaime-han';

const { defineScreen, defineElement, defineCondition } = createNimaime(test);

// Screen: Login — how to open the screen (its base state).
defineScreen('Login', {
  open: ({ page }) => page.goto('login.html'),
});

// Element: Login Form — one locator per target of Show: / Hide: / And:.
defineElement('Login Form', {
  'Email address': ({ page }) => page.getByLabel('Email address'),
  Password: ({ page }) => page.getByLabel('Password'),
  'Login button': ({ page }) => page.getByRole('button', { name: 'Log in' }),
});

// Element: Login Button — bare Enable / Disable are about the element itself: its `self` locator.
defineElement('Login Button', ({ page }) => page.getByRole('button', { name: 'Log in' }));

// When: … — put the opened screen into the named state.
defineCondition('Input is valid', async ({ page }) => {
  await page.getByLabel('Email address').fill('alice@example.com');
  await page.getByLabel('Password').fill('correct horse battery staple');
});

defineCondition('Input is invalid', async ({ page }) => {
  await page.getByLabel('Email address').fill('not-an-email-address');
  await page.getByLabel('Password').fill('correct horse battery staple');
});
```

- **`createNimaime(test)`** returns the definition functions, typed with the fixtures of `test`.
  Pass your own `test.extend()` to use custom fixtures in definitions (and set the config's
  `importTestFrom` to the same file, [config.md](./config.md)).
- **`defineScreen(name, { open })`** says how to reach the screen. With your own app,
  `page.goto('/login')` resolves against `baseURL`.
- **`defineElement(name, targets)`** maps each target name of `Show:` / `Hide:` / `And:` to a
  locator. **`defineElement(name, self, targets?)`** also locates the element itself, which bare
  state keywords such as `Enable`, `Disable` or `Check` need.
- **`defineCondition(name, fn, { screen? })`** establishes the state of a `When:` block, starting
  from the opened screen. Without `{ screen }` it applies to that `When:` name on every screen.

Names must match the specification exactly (case-sensitive, surrounding spaces ignored). The whole
definition API, including hooks, is described in [definitions.md](./definitions.md) and
[hooks.md](./hooks.md).

## 7. Generate and run

```bash
npx nimaime-gen && npx playwright test
```

```text
Generated 1 spec file (3 tests) into .sanmaime-gen

Running 3 tests using 1 worker

  ✓  1 [chromium] › .sanmaime-gen/specs/login.spec.ts:11:5 › Screen: Login › Element: Login Form › Always (223ms)
  ✓  2 [chromium] › .sanmaime-gen/specs/login.spec.ts:30:5 › Screen: Login › Element: Login Button › When: Input is valid (177ms)
  ✓  3 [chromium] › .sanmaime-gen/specs/login.spec.ts:48:5 › Screen: Login › Element: Login Button › When: Input is invalid (213ms)

  3 passed (1.7s)
```

Each **block** of an element is one Playwright test: the expectations before any `When:` form the
`Always` test, and each `When:` block is a test of its own. Every test opens the screen, applies its
condition, and checks the expectations in order, each as a `test.step` (`Show: Email address`,
`Disable`, …), so traces and the HTML report read like the specification.
`npx nimaime-gen export` lists the tests without writing anything; [cli.md](./cli.md) describes
the generated files.

Run `nimaime-gen` again whenever a `.sanmaime` file or a definition changes. A `package.json`
script keeps the two steps together:

```json
{
  "scripts": {
    "test": "nimaime-gen && playwright test"
  }
}
```

## 8. Read a failure

Break the page to see what a violated specification looks like: in `app/login.html`, replace
`button.disabled = !form.checkValidity();` with `button.disabled = form.elements.email.value === '';`
(the button is now enabled as soon as an email address is typed, valid or not) and run the tests
again. Playwright's `list` reporter prints the failure with a Sanmaime header and a code frame of
the `.sanmaime` line (abridged):

```text
  1) [chromium] › .sanmaime-gen/specs/login.spec.ts:48:5 › Screen: Login › Element: Login Button › When: Input is invalid › Disable

    NimaimeExpectationError: Screen: Login
    Element: Login Button
    When: Input is invalid
    Expected: disabled
    Actual: enabled (after 5000ms)
    Location: specs/login.sanmaime:13

    Details:
      expect(locator).toBeDisabled() failed

      Locator:  getByRole('button', { name: 'Log in' })
      Expected: disabled
      Received: enabled
      Timeout:  5000ms
      …

       at ../specs/login.sanmaime:13

      11 |
      12 |     When: Input is invalid
    > 13 |     Disable
         |     ^
      14 |
```

The header names the screen, element, condition and expectation in the specification's words;
`Details:` is Playwright's own message. The format is described in
[runtime.md](./runtime.md#failures).

## 9. Add the Sanmaime reporter

The Sanmaime reporter prints the results as a tree of the specification. Add it after Playwright's
`list` reporter, which keeps the progress lines and the full errors:

```ts
export default defineConfig({
  testDir,
  reporter: [['list'], ['nimaime-han/reporter']],
  // …
});
```

With the broken page, the run now ends with:

```text
✗ Screen: Login

  ✓ Element: Login Form
    ✓ Email address is shown
    ✓ Password is shown
    ✓ Login button is shown

  ✗ Element: Login Button
    When: Input is valid
      ✓ enabled

    When: Input is invalid
      ✗ disabled
        Expected: disabled
        Actual: enabled
        Location: specs/login.sanmaime:13

1 screen, 2 elements, 5 expectations: 4 passed, 1 failed, 0 skipped (6.6s)
```

Restore the page and every line is `✓`. Options (`quiet`, `printDetails`, …) are in
[reporter.md](./reporter.md).

## 10. Keep generated files out of Git

`.sanmaime-gen/` is rebuilt by every `nimaime-gen` run. Do not commit it:

```gitignore
# nimaime-gen output
.sanmaime-gen/
```

Commit the `.sanmaime` files and the definitions: the specification is the test.

## What next

- **Japanese keywords** — `# language: ja` and `画面:` / `要素:` / `条件:` / `表示:`, or a default
  language for the whole project: [i18n.md](./i18n.md).
- **More expectations** — `Text:`, `Contain:`, `Count:`, `Check`, `Focus`, `Editable`, `Empty`, …
  (the vocabulary v1): [expectations.md](./expectations.md).
- **Shared and combined conditions** — `Background:` for a condition every element of a screen
  needs, `And when:` to combine conditions: [sanmaime.md §5.9–§5.10](./sanmaime.md#59-background-v02).
- **Tags** — `@smoke` lines, `nimaime-gen --tags "@smoke and not @wip"`, `npx playwright test --grep`:
  [cli.md, Tags](./cli.md#tags).
- **Hooks** — `beforeScreen` / `afterScreen` / `beforeElement` / `afterElement`:
  [hooks.md](./hooks.md).
- **Custom fixtures** — `createNimaime(test)` with your `test.extend()` and `importTestFrom`:
  [definitions.md](./definitions.md), [config.md](./config.md).
- **Drafts from existing screens** — `nimaime draft` proposes a specification, a human reviews it,
  `nimaime approve` makes it the requirement, `nimaime diff` detects drift:
  [ai-workflow.md](./ai-workflow.md).
- **Gherkin** — verify a screen from a playwright-bdd `Then` step with `$nimaime.verify()`:
  [with-gherkin.md](./with-gherkin.md).
- **Editor** — syntax highlighting for `.sanmaime` files in VS Code: [editors.md](./editors.md).
- **Everything else** — the [documentation index](./README.md) and the [API reference](./api.md).
