# Example: basic

A small, runnable Nimaime-Han project — the counterpart of playwright-bdd's `examples/`. It tests
a static two-page app (a login page and a user details page) with the **Login** and **User
Details** specifications of the [main README](../../README.md), and shows what the Sanmaime
reporter prints when a specification is not met.

```text
specs/*.sanmaime ──► nimaime-gen ──► .sanmaime-gen/*.spec.ts ──► playwright test ──► ✓/✗ tree
                        ▲
definitions/*.ts ───────┘  (names in the specs → locators and conditions)
```

## Run it

Requirements: Node.js 22+.

1. **Build Nimaime-Han** (from the repository root). The example depends on the package in this
   repository (`"nimaime-han": "file:../.."`), which is installed from its built `dist/`:

   ```bash
   npm ci
   npm run build
   ```

2. **Install the example** (from `examples/basic/`), and a browser for Playwright:

   ```bash
   cd examples/basic
   npm ci
   npx playwright install chromium
   ```

   `.npmrc` sets `install-links=true`, so `nimaime-han` is installed as a copy of the package, the
   way it is installed from a registry, rather than as a symlink to the repository (through a
   symlink it would load the repository's own copy of `@playwright/test`, and Playwright refuses
   to run with two copies of itself). Run `npm ci` again after rebuilding Nimaime-Han.

3. **Generate** the Playwright specs from the `.sanmaime` files:

   ```bash
   npx nimaime-gen        # or: npm run gen
   ```

   ```text
   Generated 3 spec files (9 tests) into .sanmaime-gen
   ```

4. **Test**:

   ```bash
   npx playwright test    # or both steps at once: npm test
   ```

From the repository root, `npm run test:example:basic` does all of the above (except installing
the browser) and also type-checks the example; CI runs it.

To use an already installed Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable
(both configs pass it to `launchOptions.executablePath`).

## Files

| Path                                  | What it is                                                                                                                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/login.html`                      | The login page: email address and password inputs and a **Log in** button that is enabled only while the inputs are valid (a few lines of inline JS).                                         |
| `app/user-details.html`               | The user details page of `?user=<name>` (default: the signed-in user, `alice`). On another user's profile the full name, the email address and the edit button are hidden.                    |
| `app-broken/login.html`               | The login page with a regression: the button is enabled as soon as the email field is not empty. Used by the failing run only.                                                                |
| `specs/login.sanmaime`                | The README's **Login** example.                                                                                                                                                               |
| `specs/user-details.sanmaime`         | The README's **User Details** example (User Information, and Edit Action from "Relationship with Gherkin").                                                                                   |
| `specs/ja/user-details.sanmaime`      | The same User Details specification in Japanese (`# language: ja`: `画面:` `要素:` `条件:` `表示:` `非表示:` `かつ:`).                                                                        |
| `specs-failing/login-broken.sanmaime` | The README's Login example again, run against `app-broken/` by the failing run.                                                                                                               |
| `definitions/login.ts`                | `defineScreen('Login')` (opens the page), `defineElement('Login Form', { targets })`, `defineElement('Login Button', self)` for `Enable`/`Disable`, and the two input conditions.             |
| `definitions/user-details.ts`         | The User Details screen, its elements, and the conditions (`?user=alice` / `?user=bob`).                                                                                                      |
| `definitions/ja/user-details.ts`      | The same bindings for the Japanese names.                                                                                                                                                     |
| `fixtures.ts`                         | The project's `test` (the `importTestFrom` file): Playwright's `test` plus an `appUrl(page, query?)` fixture that returns the `file://` URL of a page (no web server) and an `appDir` option. |
| `playwright.config.ts`                | `defineSanmaimeConfig({ specs, definitions, importTestFrom })`, the `list` and `nimaime-han/reporter` reporters, Chromium.                                                                    |
| `playwright.failing.config.ts`        | The failing run: `specs-failing/`, `definitions/login.ts`, output in `.sanmaime-gen-failing/`, and `use: { appDir: 'app-broken' }`.                                                           |
| `tsconfig.json`                       | For editors and `npm run typecheck`; also keeps Playwright's loader from using the repository's `tsconfig.json`.                                                                              |

`nimaime-gen` writes into `.sanmaime-gen/` (and `.sanmaime-gen-failing/`); these directories are
generated, so they are git-ignored. Because `importTestFrom` is set, the definitions and the
generated tests share the custom `appUrl` fixture, with its types.

## Expected output: passing run

`npm test` (after the `list` reporter's progress lines):

```text
✓ Screen: ユーザー詳細

  ✓ Element: ユーザー情報
    When: 自分のプロフィールを閲覧している
      ✓ ユーザー名 is shown
      ✓ 氏名 is shown
      ✓ メールアドレス is shown

    When: 他のユーザーのプロフィールを閲覧している
      ✓ ユーザー名 is shown
      ✓ 氏名 is hidden
      ✓ メールアドレス is hidden

  ✓ Element: 編集操作
    When: プロフィールを編集できる
      ✓ 編集ボタン is shown

✓ Screen: Login

  ✓ Element: Login Form
    ✓ Email address is shown
    ✓ Password is shown
    ✓ Login button is shown

  ✓ Element: Login Button
    When: Input is valid
      ✓ enabled

    When: Input is invalid
      ✓ disabled

✓ Screen: User Details

  ✓ Element: User Information
    When: Viewing your own profile
      ✓ Username is shown
      ✓ Full name is shown
      ✓ Email address is shown

    When: Viewing another user's profile
      ✓ Username is shown
      ✓ Full name is hidden
      ✓ Email address is hidden

  ✓ Element: Edit Action
    When: The user can edit the profile
      ✓ Edit button is shown

3 screens, 6 elements, 19 expectations: 19 passed, 0 failed, 0 skipped (3.2s)
```

## Expected output: failing run

`npm run test:fail` runs the README's Login specification against `app-broken/`, whose button is
not disabled when the email address is invalid. It exits with 1. The `list` reporter prints
Playwright's full error (the Sanmaime header, then Playwright's assertion and a code frame of the
`.sanmaime` line):

```text
  1) [chromium] › .sanmaime-gen-failing/specs-failing/login-broken.spec.ts:48:5 › Screen: Login › Element: Login Button › When: Input is invalid › Disable

    NimaimeExpectationError: Screen: Login
    Element: Login Button
    When: Input is invalid
    Expected: disabled
    Actual: enabled (after 1000ms)
    Location: specs-failing/login-broken.sanmaime:13

    Details:
      expect(locator).toBeDisabled() failed

      Locator:  getByRole('button', { name: 'Log in' })
      Expected: disabled
      Received: enabled
      Timeout:  1000ms
      ...

       at ../specs-failing/login-broken.sanmaime:13

      11 |
      12 |     When: Input is invalid
    > 13 |     Disable
         |     ^
      14 |
```

and the Sanmaime reporter prints the tree of the README's "Example" section:

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
        Location: specs-failing/login-broken.sanmaime:13

1 screen, 2 elements, 5 expectations: 4 passed, 1 failed, 0 skipped (3.2s)
```

Durations vary. See [docs/reporter.md](../../docs/reporter.md) for the reporter's layout and
options, and [docs/cli.md](../../docs/cli.md) for `nimaime-gen`.
