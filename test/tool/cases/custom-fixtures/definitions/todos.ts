import { createNimaime } from 'nimaime-han';
import { myTest } from '../support/test';

const { defineScreen, defineElement, defineCondition } = createNimaime(myTest);

const TODO_PAGE = /* html */ `
  <label>New todo <input id="new" /></label>
  <button id="add" type="button">Add</button>
  <p id="empty">Nothing to do</p>
  <ul id="list"></ul>
  <button id="clear" type="button" disabled>Clear all</button>
  <script>
    const render = () => {
      const count = document.querySelectorAll('#list li').length;
      document.getElementById('empty').hidden = count > 0;
      document.getElementById('clear').disabled = count < 3;
    };
    window.addTodo = (text) => {
      const li = document.createElement('li');
      li.textContent = text;
      document.getElementById('list').append(li);
      render();
    };
    document.getElementById('add').addEventListener('click', () => {
      window.addTodo(document.getElementById('new').value);
    });
    render();
  </script>
`;

// The screen is opened with the project's `initialTodos` option.
defineScreen('Todos', {
  open: async ({ page, initialTodos }) => {
    await page.setContent(TODO_PAGE);
    for (const todo of initialTodos) {
      await page.evaluate((text) => {
        (globalThis as unknown as { addTodo: (text: string) => void }).addTodo(text);
      }, todo);
    }
  },
});

defineElement('Todo List', {
  'Empty message': ({ page }) => page.getByText('Nothing to do'),
  'First item': ({ page }) => page.getByRole('listitem').first(),
});

defineElement('Clear Button', ({ page }) => page.getByRole('button', { name: 'Clear all' }));

// Conditions use the custom `addTodos` fixture.
defineCondition('Three items were added', async ({ addTodos }) => {
  await addTodos(['Walk the dog', 'Write tests']);
});

defineCondition('Nothing was added', async () => {
  // The base state: only the initial items.
});
