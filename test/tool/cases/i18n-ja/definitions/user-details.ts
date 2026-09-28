import { createNimaime } from 'nimaime-han';

const { defineScreen, defineElement, defineCondition } = createNimaime();

const PROFILE_PAGE = /* html */ `
  <h1 data-testid="username">alice</h1>
  <p data-testid="real-name" hidden>Alice Liddell</p>
  <p data-testid="email" hidden>alice@example.com</p>
  <button id="edit" disabled>編集</button>
  <script>
    window.showProfile = (own) => {
      document.querySelector('[data-testid="real-name"]').hidden = !own;
      document.querySelector('[data-testid="email"]').hidden = !own;
      document.getElementById('edit').disabled = !own;
    };
  </script>
`;

type ShowProfile = (own: boolean) => void;

defineScreen('ユーザー詳細', {
  open: ({ page }) => page.setContent(PROFILE_PAGE),
});

defineElement('ユーザー情報', {
  ユーザー名: ({ page }) => page.getByTestId('username'),
  氏名: ({ page }) => page.getByTestId('real-name'),
  メールアドレス: ({ page }) => page.getByTestId('email'),
});

defineElement('編集ボタン', ({ page }) => page.getByRole('button', { name: '編集' }));

defineCondition('自分のプロフィールを閲覧している', async ({ page }) => {
  await page.evaluate(() => {
    (globalThis as unknown as { showProfile: ShowProfile }).showProfile(true);
  });
});

defineCondition('他のユーザーのプロフィールを閲覧している', async ({ page }) => {
  await page.evaluate(() => {
    (globalThis as unknown as { showProfile: ShowProfile }).showProfile(false);
  });
});
