import { createNimaime } from '../../../../src/index';

// Also defines "User Information", like project/definitions/user-details.ts. Loaded in a separate
// loadDefinitions() call, it must not conflict with it.
createNimaime().defineElement('User Information', { Avatar: ({ page }) => page.getByRole('img') });
