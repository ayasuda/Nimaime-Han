import { createNimaime } from '../../../../src/index';

createNimaime().defineElement('Duplicated', { A: ({ page }) => page.getByTestId('a') });
