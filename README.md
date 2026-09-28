# Nimaime-Han

> Every screen under test is a Nimaime!

**Nimaime-Han** is a screen specification testing tool for Playwright.

It lets you describe **what a screen should contain and how its elements should behave** using the human-readable **Sanmaime DSL**, and verifies those specifications against a real browser with Playwright.

```text
Screen: User Details

  Element: User Information
    When: Viewing your own profile
    Show: Username
    And: Full name
```

## Why Nimaime-Han?

Playwright is great at testing browsers.

Gherkin is great at describing scenarios.

```gherkin
Scenario: User views their own profile
  Given the user is logged in
  When the user opens the user details screen
  Then the user information is displayed
```

But what exactly does **"the user information is displayed"** mean?

You can write every detail into the scenario:

```gherkin
Then the username is displayed
And the full name is displayed
And the email address is displayed
And the edit button is displayed
And ...
```

But those are not really scenario steps.

They are **screen specifications**.

Nimaime-Han separates them.

### Gherkin describes behavior

```text
Given A
When B
Then C
```

It describes changes over time.

### Sanmaime describes screens

```text
Screen: User Details

  Element: User Information
    When: Viewing your own profile
    Show: Username
    And: Full name
```

It describes what must be true **at a particular screen state**.

Nimaime-Han is not intended to replace Gherkin.

The proposed approach is to use the two together:

```text
Gherkin
   │
   │ scenario / behavior
   ▼
Playwright ───────► Browser
   ▲
   │ screen specification
   │
Sanmaime
```

Gherkin describes **how the application reaches a state**.

Sanmaime describes **what the screen must look like once it gets there**.

## Sanmaime as an Intermediate Representation

Sanmaime is designed to be readable and editable by humans, but human authorship is not its only intended use.

A core idea behind Sanmaime is this workflow:

```text
Existing Application
        │
        ▼
       AI
        │
        │ observes and analyzes the implementation
        ▼
   Sanmaime Draft
        │
        ▼
   Human Review
        │
        │ approve / edit
        ▼
Approved Sanmaime Specification
        │
        ▼
   Regression Tests
        │
        ▼
      CI/CD
```

In other words:

> **AI generates the specification from the implementation.  
> Humans approve the specification.  
> The approved specification becomes the regression test.**

This makes Sanmaime an **intermediate representation between implementation, human intent, and automated verification**.

The AI may inspect an existing screen and propose:

```text
Screen: User Details

  Element: User Information
    Show: Username
    And: Full name
    And: Email address

  Element: Edit Action
    Show: Edit button
```

A human then reviews that proposal.

At that moment, an important transition happens:

```text
Before approval:

    "This is what the application currently does."

After approval:

    "This is what the application is supposed to do."
```

From then on, Nimaime-Han can continuously verify that the implementation still conforms to the approved specification.

Sanmaime is therefore intended to be both:

- a human-readable screen specification language
- a machine-generatable representation of screen requirements

It should be structured enough for tools and AI to generate reliably, while remaining natural enough for humans to review without reading test code.

## Sanmaime DSL

A specification consists of screens, elements, conditions, and expectations.

```text
Screen: User Details

  Element: User Information

    When: Viewing your own profile
    Show: Username
    And: Full name
    And: Email address

    When: Viewing another user's profile
    Show: Username
    Hide: Full name
    And: Email address
```

Sanmaime describes **what should be true**, not how the application implements it.

No CSS selectors.

No XPath.

No DOM structure.

No Playwright code.

## Element Definitions

Nimaime-Han connects names in a Sanmaime specification to your application through TypeScript definitions.

```ts
defineElement("User Information", {
  "Username": ({ page }) =>
    page.getByTestId("username"),

  "Full name": ({ page }) =>
    page.getByTestId("real-name"),

  "Email address": ({ page }) =>
    page.getByTestId("email"),
});
```

Your specification remains readable even if the implementation changes.

```text
Sanmaime
    │
    ▼
Nimaime-Han
    │
    ├── Element Definitions
    │
    ▼
@playwright/test
    │
    ▼
Browser
```

## Why not just Playwright?

You absolutely can write:

```ts
await expect(page.getByTestId("username")).toBeVisible();
await expect(page.getByTestId("real-name")).toBeVisible();
await expect(page.getByTestId("email")).toBeVisible();
```

Nimaime-Han is useful when those assertions are also your **screen specification**.

Instead of maintaining:

```text
Screen specification document
        +
Playwright tests
```

you maintain:

```text
Executable screen specification
```

The specification is the test.

More importantly, the specification can be generated from an existing implementation, reviewed by a human, committed to source control, and then used to detect regressions.

## Relationship with Gherkin

Nimaime-Han does not propose Sanmaime as an alternative to Gherkin.

The intended use is **complementary**.

Consider a scenario:

```gherkin
Scenario: User views their own profile
  Given the user is logged in
  When the user opens their profile
  Then the user details screen is displayed
```

Gherkin is well suited to expressing this flow.

The screen itself, however, may contain dozens of requirements:

```text
Screen: User Details

  Element: User Information
    When: Viewing your own profile
    Show: Username
    And: Full name
    And: Email address

  Element: Edit Action
    When: The user can edit the profile
    Show: Edit button
```

Putting every screen-level assertion into the Gherkin scenario makes the scenario longer and mixes two different concerns.

The proposed division of responsibility is:

| | Gherkin | Sanmaime |
|---|---|---|
| Describes | Behavior | Screen |
| Main unit | Scenario | Element |
| Focus | Change over time | State at a moment |
| Typical question | What happens when...? | What should be here? |
| Best suited for | User flows and business scenarios | Screen structure and state |
| Execution | Playwright | Playwright |

A useful mental model is:

```text
              Scenario
                 │
                 │ Gherkin
                 ▼
State A ───► State B ───► State C
              │             │
              │ Sanmaime    │ Sanmaime
              ▼             ▼
         Screen Spec    Screen Spec
```

**Gherkin tests the journey. Sanmaime verifies the stops along the way.**

The goal is not to replace scenario-based testing, but to prevent scenario tests from becoming overloaded with detailed screen assertions.

## Architecture

Nimaime-Han does not replace Playwright Test.

It sits on top of it.

```text
              Sanmaime DSL
                   │
                   ▼
              Nimaime-Han
                   │
                   ▼
            @playwright/test
                   │
                   ▼
               Browser
```

Nimaime-Han is responsible for:

- parsing screen specifications
- binding specification names to application elements
- generating Playwright assertions
- reporting specification violations
- supporting generation and review workflows for Sanmaime specifications

Playwright remains responsible for:

- browser automation
- fixtures
- assertions
- parallel execution
- retries
- traces
- screenshots
- reporting

## Example

Specification:

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

Run:

```bash
npx playwright test
```

Result:

```text
✓ Screen: Login

  ✓ Element: Login Form
    ✓ Email address is shown
    ✓ Password is shown
    ✓ Login button is shown

  ✗ Element: Login Button
    When: Input is invalid
    Expected: disabled
    Actual: enabled
```

## Philosophy

A screen specification should be readable as a specification.

It should not require knowledge of:

- HTML
- CSS selectors
- XPath
- React
- Playwright

Implementation details belong in definitions.

Screen requirements belong in Sanmaime.

And wherever possible:

> **Let AI describe what exists.  
> Let humans decide what should exist.  
> Let Playwright make sure it stays that way.**

## Name

**Nimaime-Han (二枚目半)** uses **Sanmaime (三枚目)**.

Why?

Because every screen under test is a **Nimaime**.

That's it.

We needed names.

## Status

🚧 Experimental.

Sanmaime syntax and Nimaime-Han APIs are not stable yet.

Expect breaking changes.

Releases stay at 0.x while the project is experimental: a breaking change bumps the minor version (0.3.x → 0.4.0), and features and fixes bump the patch version. See [docs/releasing.md](docs/releasing.md) and [CHANGELOG.md](CHANGELOG.md).

## License

MIT
