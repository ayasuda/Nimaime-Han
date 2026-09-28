import { expect } from '@playwright/test';
import { createNimaime } from 'nimaime-han';
import { test } from '../fixtures';

const { defineScreen, defineCondition } = createNimaime(test);

const SCREEN = 'Composed Login';

/** What ran in the current test, in order (reset when the screen is opened). */
const log: string[] = [];

defineScreen(SCREEN, {
  open: async ({ page, loginHtml }) => {
    log.length = 0;
    log.push('open');
    await page.setContent(loginHtml);
  },
});

defineCondition(
  'The order log is started',
  () => {
    expect(log).toEqual(['open']);
    log.push('background 1');
  },
  { screen: SCREEN },
);

defineCondition(
  'A valid email is typed',
  async ({ page }) => {
    expect(log).toEqual(['open', 'background 1']);
    log.push('background 2');
    await page.getByLabel('Email').fill('alice@example.com');
  },
  { screen: SCREEN },
);

defineCondition(
  'The email is cleared',
  async ({ page }) => {
    expect(log).toEqual(['open', 'background 1', 'background 2']);
    log.push('when');
    await page.getByLabel('Email').fill('');
  },
  { screen: SCREEN },
);

// Used alone (`When:`) and after `The email is cleared` (`And when:`).
defineCondition(
  'The order is checked',
  () => {
    const background = ['open', 'background 1', 'background 2'];
    expect([background, [...background, 'when']]).toContainEqual(log);
    log.push('checked');
  },
  { screen: SCREEN },
);
