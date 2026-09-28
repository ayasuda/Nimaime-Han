import { createNimaime } from '../../../../src/index';

createNimaime().defineElement('Duplicated', { B: ({ page }) => page.getByTestId('b') });
