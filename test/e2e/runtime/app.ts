/** A tiny static app for the runtime e2e tests (loaded with page.setContent()). */
export const LOGIN_PAGE = /* html */ `
<!doctype html>
<html>
  <body>
    <form id="login">
      <label>Email <input id="email" data-testid="email" /></label>
      <label>Password <input id="password" data-testid="password" type="password" /></label>
      <button id="submit" data-testid="login-button" disabled>Log in</button>
      <p data-testid="error" hidden>Please enter a valid email address.</p>
    </form>
    <section data-testid="profile">
      <h1 data-testid="username">alice</h1>
      <p data-testid="real-name" style="display: none">Alice Liddell</p>
      <p data-testid="greeting" hidden></p>
    </section>
    <script>
      const email = document.getElementById('email');
      const submit = document.getElementById('submit');
      const error = document.querySelector('[data-testid="error"]');
      email.addEventListener('input', () => {
        const valid = email.value.includes('@');
        submit.disabled = !valid;
        error.hidden = valid || email.value === '';
      });
      window.showOwnProfile = (name) => {
        document.querySelector('[data-testid="real-name"]').style.display = '';
        const greeting = document.querySelector('[data-testid="greeting"]');
        greeting.textContent = 'Welcome back, ' + name;
        greeting.hidden = false;
      };
    </script>
  </body>
</html>
`;
