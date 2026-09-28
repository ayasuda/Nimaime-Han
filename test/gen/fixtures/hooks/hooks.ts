import { createNimaime } from '../../../../src/index';

const { beforeScreen, afterElement } = createNimaime();

beforeScreen(({ browser }) => browser.version(), { screen: 'Login' });
afterElement(({ page }) => page.close());
