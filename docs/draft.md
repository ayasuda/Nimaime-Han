# Drafts — `nimaime draft`

`nimaime draft` is the first step of the workflow of the README's
[Sanmaime as an Intermediate Representation](../README.md#sanmaime-as-an-intermediate-representation):
it opens an existing screen in a browser, observes what is on it, and **proposes** a Sanmaime
specification — plus a draft of the element definitions that bind the proposed names to locators.

```text
Existing Application
        │
        ▼
  nimaime draft            observe (Playwright) → propose (rules, optionally an LLM) → validate (parser)
        │
        ▼
   Sanmaime Draft          "This is what the application currently does."
        │
        ▼
   Human Review            edit: keep what must be true, delete noise, add When: blocks and Hide:
        │
        ▼
Approved Sanmaime          "This is what the application is supposed to do."   (git commit)
        │
        ▼
 nimaime-gen + Playwright  regression tests in CI
```

A draft is never the specification. It describes what the screen shows _now_; only a human
decides what it _must_ show. The draft is deliberately plain so that the review is quick, and its
first line, `# status: draft`, keeps it out of `nimaime-gen` until a reviewer approves it with
`nimaime approve` ([review-workflow.md](./review-workflow.md)). How the steps fit together in pull
requests and CI is described in [ai-workflow.md](./ai-workflow.md).

## Usage

```bash
npx nimaime draft http://localhost:3000/users/me --screen "User Details" > specs/user-details.sanmaime

# Also write the definitions draft, and keep the observation for offline re-runs:
npx nimaime draft http://localhost:3000/users/me --screen "User Details" \
  --out specs/user-details.sanmaime --definitions drafts/user-details.ts \
  --observation .drafts/user-details.json

# A screen that needs a signed-in user (a Playwright storage state, e.g. saved by a setup project):
npx nimaime draft http://localhost:3000/users/me --storage-state playwright/.auth/user.json

# Offline, from a saved observation (no browser is started):
npx nimaime draft .drafts/user-details.json --screen "ユーザー詳細" --language ja
```

The source is a URL (`http:`, `https:`, `file:`), a local HTML file (opened as a `file:` URL), or
an observation saved with `--observation` (a `.json` file).

Write the definitions draft **outside** the `definitions` glob of your config (here `drafts/`) and
move it into place during the review. Definition files are loaded whatever the status of the
specs, and element names are global, so a drafted `defineElement()` whose name already exists would
make `nimaime-gen` fail with a duplicate definition.

| Option                             | Description                                                                                                                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-s, --screen <name>`              | The screen name (`Screen:`). Default: the page title.                                                                                                                                        |
| `-l, --language <en\|ja>`          | Keyword language of the draft (default `en`). `ja` writes `# language: ja`, Japanese keywords and Japanese default names (`ナビゲーション`, `… ボタン`). Names taken from the page are kept. |
| `--status <draft\|approved>`       | The `# status:` line written as the first line of the draft (default `draft`; see [review-workflow.md](./review-workflow.md)). `approved` is for output you trust as it is.                  |
| `-o, --out <file>`                 | Write the Sanmaime draft to a file instead of stdout.                                                                                                                                        |
| `-d, --definitions <file\|->`      | Also write the definitions draft (TypeScript). `-` prints it to stdout after the Sanmaime draft and a `# ---- definitions (TypeScript) ----` line.                                           |
| `--observation <file>`             | Save the observation as JSON (see [Observation](#observation)).                                                                                                                              |
| `--group-by <region\|flat>`        | One element per landmark (default), or a single element with every target.                                                                                                                   |
| `--storage-state <file>`           | A Playwright [storage state](https://playwright.dev/docs/auth) (cookies, localStorage) for the browser context.                                                                              |
| `--wait <ms\|selector>`            | After the page has loaded, wait this many milliseconds, or until the selector is visible.                                                                                                    |
| `--timeout <ms>`                   | Timeout of the navigation and of `--wait` (default 30000).                                                                                                                                   |
| `--test-id-attribute <name>`       | The attribute read as the test id (default `data-testid`). Configure Playwright's `testIdAttribute` the same way.                                                                            |
| `--llm <module>`                   | Refine the draft with an LLM adapter (see [LLM adapters](#llm-adapters)).                                                                                                                    |
| `--browser <name>`                 | `chromium` (default), `firefox` or `webkit`. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` selects a Chromium binary.                                                                                |
| `--headed`                         | Show the browser window.                                                                                                                                                                     |
| `-h, --help` / `nimaime --version` | Help and version.                                                                                                                                                                            |

After loading, `nimaime draft` also waits (up to 5 seconds) for the network to be idle, so that
client-rendered screens have rendered. Use `--wait` for screens that need more.

The draft goes to stdout (or `--out`); messages go to stderr — the summary, the lines the parser
rejected, rejected LLM answers. Exit codes: `0` success; `1` the screen could not be drafted
(navigation failed, nothing to propose); `2` usage errors (options, missing or invalid input files,
an `--llm` module that cannot be loaded).

`nimaime` is the command for working with live screens: `draft`, and `diff` / `approve` of the
[review workflow](./review-workflow.md). Tests are generated by [`nimaime-gen`](./cli.md).

## Example

For the login page of [examples/basic](../examples/basic/app/login.html):

```bash
npx nimaime draft examples/basic/app/login.html --screen Login --definitions -
```

```text
# status: draft
# Draft proposed by nimaime draft from file:///…/examples/basic/app/login.html. Review it before committing.

Screen: Login

  Element: Log in
    Show: Log in heading

  Element: Login Form
    Show: Email address
    And: Password
    And: Log in button

  Element: Log in button
    Disable
```

```ts
// Draft definitions proposed by `nimaime draft` for Screen "Login".
// Review every locator before committing (see docs/draft.md).
import { createNimaime } from 'nimaime-han';

const { defineScreen, defineElement } = createNimaime();

defineScreen('Login', {
  open: async ({ page }) => {
    await page.goto('file:///…/examples/basic/app/login.html');
  },
});

defineElement('Log in', {
  'Log in heading': ({ page }) => page.getByRole('heading', { name: 'Log in' }),
});

defineElement('Login Form', {
  'Email address': ({ page }) => page.getByRole('textbox', { name: 'Email address' }),
  Password: ({ page }) => page.getByLabel('Password'),
  'Log in button': ({ page }) => page.getByRole('button', { name: 'Log in' }),
});

defineElement('Log in button', ({ page }) => page.getByRole('button', { name: 'Log in' }));
```

A reviewer would then, for example, delete the `Log in` element, rename `Log in button` to
`Login Button`, and turn its unconditional `Disable` into `When: Input is invalid` / `Disable` and
`When: Input is valid` / `Enable` — which is exactly
[examples/basic/specs/login.sanmaime](../examples/basic/specs/login.sanmaime).

## How it works

### Observation

`observeScreen(page)` collects, in one `page.evaluate()`:

- the page URL, title and `lang`;
- **regions**: `header`, `nav`, `main`, `form`, `aside`, `footer`, `search`, an open `dialog`,
  a `section` with a label or a heading, and the same landmarks by ARIA role (`banner`,
  `navigation`, `region`, `complementary`, `contentinfo`, `dialog`, …). Everything outside any
  landmark belongs to the `page` region. Each region records its kind, label (`aria-label` /
  `aria-labelledby`), `id` (or a form's `name`) and enclosing region;
- **elements**: every element with a test id, and every element with an ARIA role and an
  accessible name (buttons, links, text boxes, check boxes, headings, images, …; also form
  controls without a role, such as password inputs, when they have a label). Each records
  `testId`, `role`, `name` (and where the name came from), `text`, `tag`, `type`, heading `level`,
  `visible`, `enabled`, `disabled` (on controls) and its innermost `region`. Open shadow roots are
  included; iframes are not.

Roles, accessible names, visibility and the disabled state approximate Playwright's rules (visible
= a non-empty box and `visibility: visible`; disabled = native `disabled`, a disabled fieldset, or
`aria-disabled="true"`). The observation is plain JSON:

```json
{
  "format": "nimaime-observation",
  "version": 1,
  "url": "http://localhost:3000/login",
  "title": "Log in",
  "testIdAttribute": "data-testid",
  "regions": [{ "id": "r1", "kind": "form", "tag": "form", "htmlId": "login-form" }],
  "elements": [
    {
      "tag": "button",
      "role": "button",
      "name": "Log in",
      "nameSource": "content",
      "visible": true,
      "enabled": false,
      "disabled": true,
      "region": "r1"
    }
  ],
  "truncated": false
}
```

Observations contain the page's visible text (e.g. a user's name in a `text` field). Treat saved
observations like screenshots: do not commit them if the screen shows real data.

### What the rules do

The rule-based proposer (`proposeSanmaime`) is deterministic and needs no network:

1. **One `Element:` per region** that has visible, locatable elements, in document order. The
   element is named after the region's label, else its first visible heading (not for header,
   nav and footer), else its humanized `id` (`login-form` → `Login Form`), else — for a form — its
   only button (`Sign up form`), else the kind (`Navigation`, `Main content`, `Header`, …).
   Duplicate names get a number (`Navigation 2`). `--group-by flat` makes a single element named
   after the page's `h1`.
2. **One `Show:` / `And:` per visible element**, named after its accessible name with a role word
   for buttons, links, check boxes, radio buttons, switches, tabs, headings and images
   (`Log in button`, `Home link`), else its humanized test id (`real-name` → `Real name`), else
   its text. Names are deduplicated within an element. The heading an element is named after is
   left out unless it is the element's only target. Hidden elements are not proposed: **`Hide:` is
   never proposed** — whether something must be hidden is a decision for the reviewer.
3. **`Enable` / `Disable`** — when an element contains exactly one control (a button, an input, …),
   the element itself _is_ that control: its state is stated and the control is its `self`
   locator. When an element contains several controls, each **disabled** control also gets an
   element of its own (named after it) with `Disable`, because a disabled control is usually the
   state that matters. Enabled controls get no element of their own (enabled is the default).
   The draft states these unconditionally; the reviewer usually moves them into `When:` blocks.
4. **Validation.** The draft is parsed with the Sanmaime parser before it is output. Should the
   parser report an error, the offending line (a target, a state, a whole element) is dropped and
   reported on stderr, and the draft is parsed again: `nimaime draft` never outputs invalid
   Sanmaime. If nothing is left, it fails with exit code 1.

The **definitions draft** has one `defineScreen()` whose `open` goes to the observed URL (replace
it with a relative path when your config has a `baseURL`), and one `defineElement()` per element,
with a `self` locator when the element states `Enable` / `Disable`. Locators are chosen in this
order: `getByTestId()`, `getByRole(role, { name })`, `getByLabel()`, `getByPlaceholder()`,
`getByAltText()`, `getByTitle()`, `getByText()`. `exact: true` is added when another element's name
contains the name; `.first()` when several elements match (e.g. a link repeated in a menu). The
file is formatted like Prettier formats it.

## LLM adapters

The rules produce a correct but mechanical draft. An LLM can do better — regroup, rename, drop
noise, propose `Hide:` for hidden elements. Nimaime-Han ships **no LLM client and no SDK**: you plug
in a function.

```ts
import type { LlmAdapter } from 'nimaime-han';

const adapter: LlmAdapter = async ({ system, prompt, observation, candidate }) => {
  // system       the role, a summary of the Sanmaime v0 grammar and the rules of the answer
  // prompt       the screen name, a summary of the observation, the rule-based candidate draft,
  //              and — on a retry — why the previous answer was rejected
  // observation  the full observation (JSON), for adapters that build their own prompt
  // candidate    the rule-based draft
  // Resolve to the model's answer: a Sanmaime document (a Markdown code fence is fine).
  return callYourModel(system, prompt);
};
export default adapter;
```

`--llm <module>` imports the module (a path relative to the current directory, or a package name)
and uses its default export. Write it in JavaScript (`.mjs`), or in TypeScript if your Node.js
version strips types natively. For example, with any HTTP API that takes chat messages
(pseudo-code; adapt the URL, headers and response shape to your provider):

```js
// llm-adapter.mjs
export default async function adapter({ system, prompt }) {
  const response = await fetch(process.env.LLM_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!response.ok) throw new Error(`LLM request failed: ${response.status}`);
  const json = await response.json();
  return json.choices[0].message.content; // wherever your provider puts the text
}
```

```bash
LLM_URL=… LLM_API_KEY=… npx nimaime draft http://localhost:3000/login --screen Login --llm ./llm-adapter.mjs
```

What happens with the answer (`proposeWithLlm(observation, options, adapter)`):

1. It is parsed with the Sanmaime parser. It must parse without errors, contain exactly one
   `Screen:` with the requested name, and use the requested language (a missing `# language: ja`
   is added).
2. An invalid answer is sent back once (`maxAttempts`, default 2) with the diagnostics. An adapter
   that throws counts as an invalid answer.
3. If no answer is valid, the **rule-based draft is used** and a warning says so. The result
   reports `source: 'llm' | 'rule-based'` and every rejected answer.
4. The definitions draft of an accepted answer reuses the observed locators by target name
   (the prompt asks the model to keep the candidate's target names); a target or `self` that was
   not observed gets a `page.getByTestId('TODO')` placeholder and a note on stderr.

The adapter sees the observation, including the page's text. Only use a provider you may send
the screen's content to.

## Recommended review flow

1. **Draft** from a running build, ideally with realistic but non-personal data:
   `npx nimaime draft <url> --screen "<Screen>" --out specs/<screen>.sanmaime --definitions drafts/<screen>.ts`.
2. **Edit the Sanmaime draft.** Delete what is incidental (decoration, marketing text,
   duplicated headings); rename elements and targets to the words your team uses; move
   `Enable` / `Disable` and state-dependent `Show:` lines into `When:` blocks; add `Hide:` for what
   must not be shown. Draft other states of the screen (`--storage-state` for another user,
   `?query` parameters) to see what changes between them.
3. **Edit the definitions draft** and move it into `definitions/`. Rename keys to match the edited
   Sanmaime, check each locator,
   replace the `goto` URL with a path relative to `baseURL`, and add `defineCondition()` for each
   `When:` (run `npx nimaime-gen check --include-drafts` — it prints snippets for everything still
   missing).
4. **Approve and commit** the specification: `npx nimaime approve specs/<screen>.sanmaime` turns
   `# status: draft` into `# status: approved`. From now on it is the requirement, not a
   description (until then `nimaime-gen` skips it).
5. **Generate and run**: `npx nimaime-gen && npx playwright test`, in CI. Later,
   `npx nimaime diff specs/<screen>.sanmaime <url>` shows how the screen has drifted from its
   specification ([review-workflow.md](./review-workflow.md#5-detect-drift-nimaime-diff)).

## Limitations

- Roles and accessible names are approximations of the ARIA / accname rules (good for common
  HTML; exotic ARIA patterns may be named differently than Playwright names them). The reviewer
  checks every locator, and `nimaime-gen` + Playwright confirm them on the first run.
- Only the top-level document is observed (no iframes). Closed shadow roots are invisible.
- Tables, lists and repeated items are not modelled: repeated elements become one target with
  `.first()`.
- `Hide:`, `When:` blocks and conditions are never proposed by the rules: one observation is one
  state of the screen.
- Drafts use the v0 expectations only (`Show:`, `And:`, `Enable`, `Disable`; the LLM prompt
  summarizes the same subset). The value and state keywords of the vocabulary v1 (`Text:`,
  `Count:`, `Check`, …, [expectations.md](./expectations.md)) are added by the reviewer.
- At most 500 elements are observed; beyond that the observation is `truncated` and a warning is
  printed.
- The draft's header comment and the `defineScreen` URL contain the observed URL; `file:` URLs
  are machine-specific.

## API

The functions behind the CLI are in `src/draft/` (internal; not a package entry point yet):
`observeScreen(page, { testIdAttribute?, maxElements? })`, `parseObservation(json)`,
`proposeSanmaime(observation, { screen, language?, groupBy?, quotes?, header? })` →
`{ sanmaime, definitions, elements, dropped }`, `proposeWithLlm(observation, options, adapter)`,
`runDraft(args, io)`. The main entry `nimaime-han` exports the types `LlmAdapter`, `LlmRequest`,
`ScreenObservation`, `ObservedElement` and `ObservedRegion`.

---

See also: [ai-workflow.md](./ai-workflow.md) · [review-workflow.md](./review-workflow.md) ·
[cli.md](./cli.md#nimaime--draft-approve-diff) · [documentation index](./README.md)
