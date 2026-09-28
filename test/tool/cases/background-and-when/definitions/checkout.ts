import { createNimaime } from 'nimaime-han';

const { defineScreen, defineElement, defineCondition } = createNimaime();

const CHECKOUT_PAGE = /* html */ `
  <p id="greeting" hidden>Hello, Alice</p>
  <p id="count" hidden>1 item</p>
  <button id="sign-in">Sign in</button>
  <button id="add-item">Add item</button>
  <label>Address <input id="address" /></label>
  <label>Card <input id="card" /></label>
  <label>Coupon <input id="coupon" /></label>
  <p id="discount" hidden>-10%</p>
  <button id="pay" disabled>Pay</button>
  <script>
    const $ = (id) => document.getElementById(id);
    $('sign-in').addEventListener('click', () => ($('greeting').hidden = false));
    // Only a signed-in user can add items: the background must run in order.
    $('add-item').addEventListener('click', () => {
      if (!$('greeting').hidden) $('count').hidden = false;
    });
    const update = () => {
      const card = $('card').value;
      $('pay').disabled =
        $('count').hidden || $('address').value === '' || card === '' || card.startsWith('00/');
    };
    for (const id of ['address', 'card']) $(id).addEventListener('input', update);
    // Bug on purpose: a coupon never shows the discount.
  </script>
`;

defineScreen('Checkout', { open: ({ page }) => page.setContent(CHECKOUT_PAGE) });

defineElement('Summary', {
  Greeting: ({ page }) => page.getByText('Hello, Alice'),
  'Item count': ({ page }) => page.getByText('1 item'),
});
defineElement('Pay Button', ({ page }) => page.getByRole('button', { name: 'Pay' }));
defineElement('Coupon', { Discount: ({ page }) => page.getByText('-10%') });

defineCondition('The user is signed in', async ({ page }) => {
  await page.getByRole('button', { name: 'Sign in' }).click();
});
defineCondition('The cart has an item', async ({ page }) => {
  await page.getByRole('button', { name: 'Add item' }).click();
});
defineCondition('An address is entered', async ({ page }) => {
  await page.getByLabel('Address').fill('1 Main Street');
});
defineCondition('A card is entered', async ({ page }) => {
  await page.getByLabel('Card').fill('12/30 4242');
});
defineCondition('An expired card is entered', async ({ page }) => {
  await page.getByLabel('Card').fill('00/20 4242');
});
defineCondition('A coupon is applied', async ({ page }) => {
  await page.getByLabel('Coupon').fill('SAVE10');
});
