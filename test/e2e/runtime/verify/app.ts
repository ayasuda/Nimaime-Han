/** The profile page of the verify e2e tests (loaded with page.setContent()). */
export function profilePage(options: { own: boolean; buggy?: boolean }): string {
  const { own, buggy = false } = options;
  // The buggy page shows the email address of other users.
  const showEmail = own || buggy;
  return /* html */ `
    <section>
      <h1 data-testid="username">alice</h1>
      <p data-testid="full-name"${own ? '' : ' hidden'}>Alice Liddell</p>
      <p data-testid="email"${showEmail ? '' : ' hidden'}>alice@example.com</p>
      ${own ? '<button data-testid="edit">Edit</button>' : ''}
    </section>
  `;
}
