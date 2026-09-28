import { expect, it } from 'vitest';
import { runCase } from '../../harness';

it('runs Background: conditions before every block and composes And when: conditions', async () => {
  const { playwright } = await runCase(import.meta.dirname, {
    stdout: ['Generated 1 spec file (5 tests) into .sanmaime-gen'],
    playwright: {
      passed: 4,
      failed: 1,
      stdout: [
        'When: An address is entered and A coupon is applied',
        'Expected: Discount is shown',
      ],
    },
  });
  await expect(playwright?.stdout).toMatchFileSnapshot('__snapshots__/reporter.txt');
});
