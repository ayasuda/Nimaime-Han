import { expect, it } from 'vitest';
import { runCase } from '../../harness';

it('checks every keyword of the expectation vocabulary v1 and phrases a failing Text:', async () => {
  const { playwright } = await runCase(import.meta.dirname, {
    stdout: ['Generated 1 spec file (8 tests) into .sanmaime-gen'],
    playwright: {
      passed: 7,
      failed: 1,
      stdout: [
        'Expected: Greeting has text "Hello, Bob"',
        'Actual: text "Hello, Alice"',
        'Location: specs/settings.sanmaime:35',
      ],
    },
  });
  await expect(playwright?.stdout).toMatchFileSnapshot('__snapshots__/reporter.txt');
});
