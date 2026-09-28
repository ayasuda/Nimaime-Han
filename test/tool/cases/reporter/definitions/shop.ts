import { test } from '@playwright/test';
import { createNimaime } from 'nimaime-han';

const { defineScreen, defineElement, defineCondition } = createNimaime();

const CART_PAGE = /* html */ `
  <h1>Cart</h1>
  <p id="empty">Your cart is empty</p>
  <button id="checkout" disabled>Checkout</button>
  <button id="add">Add item</button>
  <script>
    document.getElementById('add').addEventListener('click', () => {
      // Bug on purpose: the empty message is not hidden.
      document.getElementById('checkout').disabled = false;
    });
  </script>
`;

const SEARCH_PAGE = /* html */ `
  <input aria-label="Search" />
  <button>Search</button>
`;

defineScreen('Cart', { open: ({ page }) => page.setContent(CART_PAGE) });
defineScreen('Search', { open: ({ page }) => page.setContent(SEARCH_PAGE) });

defineElement('Cart Summary', {
  Title: ({ page }) => page.getByRole('heading', { name: 'Cart' }),
  'Empty message': ({ page }) => page.getByText('Your cart is empty'),
});

defineElement('Checkout Button', ({ page }) => page.getByRole('button', { name: 'Checkout' }));

defineElement('Search Box', {
  Input: ({ page }) => page.getByLabel('Search'),
  Button: ({ page }) => page.getByRole('button', { name: 'Search' }),
});

defineCondition('The cart is empty', () => {
  // The base state.
});

defineCondition('An item was added', async ({ page }) => {
  await page.getByRole('button', { name: 'Add item' }).click();
});

defineCondition('The user is signed out', async ({ page }) => {
  // Fails outside an expectation: there is no sign-out link.
  await page.getByRole('link', { name: 'Sign out' }).click({ timeout: 200 });
});

defineCondition('Coupons are enabled', () => {
  test.skip(true, 'coupons are not implemented');
});
