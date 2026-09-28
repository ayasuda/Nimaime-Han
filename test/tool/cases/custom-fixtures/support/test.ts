import { test as base } from '@playwright/test';

export interface TodoOptions {
  /** The items the app starts with: an option, set per project in playwright.config.ts. */
  initialTodos: string[];
}

export interface TodoFixtures {
  /** Adds items through the app's UI. */
  addTodos: (items: string[]) => Promise<void>;
}

/** The `importTestFrom` export (named `myTest`, see playwright.config.ts). */
export const myTest = base.extend<TodoOptions & TodoFixtures>({
  initialTodos: [[], { option: true }],
  addTodos: async ({ page }, use) => {
    await use(async (items) => {
      for (const item of items) {
        await page.getByLabel('New todo').fill(item);
        await page.getByRole('button', { name: 'Add' }).click();
      }
    });
  },
});
