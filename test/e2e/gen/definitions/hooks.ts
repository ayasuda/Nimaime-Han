import { expect } from '@playwright/test';
import { createNimaime } from 'nimaime-han';
import { test } from '../fixtures';

const { defineCondition, beforeScreen, afterScreen, beforeElement, afterElement } =
  createNimaime(test);

const SCREEN = 'Hooked Login';

/** What the hooks did, in order (per worker: definition files are loaded once per worker). */
const events: string[] = [];

beforeScreen(
  ({ browser }, info) => {
    // Screen hooks run in test.beforeAll: worker-scoped fixtures only.
    expect(browser.isConnected()).toBe(true);
    events.push(`beforeScreen ${info.screen}`);
  },
  { screen: SCREEN },
);

afterScreen(
  ({ browser }, info) => {
    expect(browser.isConnected()).toBe(true);
    events.push(`afterScreen ${info.screen}`);
  },
  { screen: SCREEN },
);

// Global: runs first, before the element of every screen (Login and ユーザー詳細 too).
// eslint-disable-next-line no-empty-pattern
beforeElement(({}, info) => {
  events.push(`global ${info.screen} > ${info.element}`);
});

// Screen-scoped: opens the page and fills in a valid email address.
beforeElement(
  async ({ page, loginHtml }, info) => {
    expect(events).toContain(`beforeScreen ${SCREEN}`);
    expect(events.at(-1)).toBe(`global ${SCREEN} > ${info.element}`);
    events.push(`screen ${info.element} ${info.condition ?? '(none)'}`);
    await page.setContent(loginHtml);
    await page.getByLabel('Email').fill('alice@example.com');
  },
  { screen: SCREEN },
);

// Element-scoped after hook: checks the order of the before hooks of this test.
afterElement(
  // eslint-disable-next-line no-empty-pattern
  ({}, info) => {
    const condition = info.condition ?? '(none)';
    expect(events.slice(-2)).toEqual([
      `global ${SCREEN} > Login Button`,
      `screen Login Button ${condition}`,
    ]);
    events.push(`afterElement ${condition}`);
  },
  { screen: SCREEN, element: 'Login Button' },
);

// The beforeElement hook above already did the work.
defineCondition('The hooks filled in the form', () => undefined, { screen: SCREEN });

defineCondition(
  'Email is cleared',
  async ({ page }) => {
    await page.getByLabel('Email').fill('');
  },
  { screen: SCREEN },
);
