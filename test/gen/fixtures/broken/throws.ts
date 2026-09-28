import { createNimaime } from '../../../../src/index';

const { defineScreen } = createNimaime();

defineScreen('Before the error');

throw new Error('boom from a definition file');
