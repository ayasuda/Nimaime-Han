/** Static pages of the app under test (loaded with page.setContent()). */
export const LOGIN_PAGE = /* html */ `
<!doctype html>
<html>
  <body>
    <form>
      <label>Email <input id="email" /></label>
      <label>Password <input id="password" type="password" /></label>
      <button id="submit" type="button" disabled>Log in</button>
    </form>
    <script>
      const email = document.getElementById('email');
      email.addEventListener('input', () => {
        document.getElementById('submit').disabled = !email.value.includes('@');
      });
    </script>
  </body>
</html>
`;

export const PROFILE_PAGE = /* html */ `
<!doctype html>
<html lang="ja">
  <body>
    <h1 data-testid="username">alice</h1>
    <p data-testid="real-name" hidden></p>
    <p data-testid="email" hidden></p>
    <button id="edit" disabled>編集</button>
    <script>
      window.showProfile = (user, own) => {
        const name = document.querySelector('[data-testid="real-name"]');
        const email = document.querySelector('[data-testid="email"]');
        name.textContent = user.name;
        email.textContent = user.email;
        name.hidden = !own;
        email.hidden = !own;
        document.getElementById('edit').disabled = !own;
      };
    </script>
  </body>
</html>
`;
