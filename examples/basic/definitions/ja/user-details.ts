// Definitions for specs/ja/user-details.sanmaime: the same screen as ../user-details.ts, with the
// Japanese names used in that specification.
import { createNimaime } from 'nimaime-han';
import { test } from '../../fixtures';

const { defineScreen, defineElement, defineCondition } = createNimaime(test);

defineScreen('ユーザー詳細', {
  open: ({ page, appUrl }) => page.goto(appUrl('user-details.html')),
});

defineElement('ユーザー情報', {
  ユーザー名: ({ page }) => page.getByTestId('username'),
  氏名: ({ page }) => page.getByTestId('real-name'),
  メールアドレス: ({ page }) => page.getByTestId('email'),
});

defineElement('編集操作', {
  編集ボタン: ({ page }) => page.getByTestId('edit-button'),
});

defineCondition('自分のプロフィールを閲覧している', async ({ page, appUrl }) => {
  await page.goto(appUrl('user-details.html', { user: 'alice' }));
});

defineCondition('他のユーザーのプロフィールを閲覧している', async ({ page, appUrl }) => {
  await page.goto(appUrl('user-details.html', { user: 'bob' }));
});

defineCondition('プロフィールを編集できる', async ({ page, appUrl }) => {
  await page.goto(appUrl('user-details.html', { user: 'alice' }));
});
