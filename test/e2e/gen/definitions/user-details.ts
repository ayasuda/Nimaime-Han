import { createNimaime } from 'nimaime-han';
import { test } from '../fixtures';

const { defineScreen, defineElement, defineCondition } = createNimaime(test);

type Show = (user: { name: string; email: string }, own: boolean) => void;

defineScreen('ユーザー詳細', {
  open: ({ page, profileHtml }) => page.setContent(profileHtml),
});

defineElement('ユーザー情報', {
  ユーザー名: ({ page }) => page.getByTestId('username'),
  氏名: ({ page }) => page.getByTestId('real-name'),
  メールアドレス: ({ page }) => page.getByTestId('email'),
});

defineElement('編集ボタン', ({ page }) => page.getByRole('button', { name: '編集' }));

defineCondition('自分のプロフィールを閲覧している', async ({ page, currentUser }) => {
  await page.evaluate((user) => {
    (globalThis as unknown as { showProfile: Show }).showProfile(user, true);
  }, currentUser);
});

defineCondition('他のユーザーのプロフィールを閲覧している', async ({ page, currentUser }) => {
  await page.evaluate((user) => {
    (globalThis as unknown as { showProfile: Show }).showProfile(user, false);
  }, currentUser);
});
