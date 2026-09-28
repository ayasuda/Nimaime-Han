import { expect, it } from 'vitest';
import { runCase } from '../../harness';

it('prints the Sanmaime tree of a mixed run', async () => {
  const { playwright } = await runCase(import.meta.dirname, {
    stdout: ['Generated 2 spec files (7 tests) into .sanmaime-gen'],
    playwright: {
      passed: 4,
      failed: 2,
      skipped: 1,
    },
  });
  await expect(playwright?.stdout).toMatchFileSnapshot('__snapshots__/reporter.txt');
});

it("uses the reporter options of the config's reporter list", async () => {
  const { playwright } = await runCase(import.meta.dirname, {
    snapshot: false,
    playwright: { reporters: 'config', passed: 4, failed: 2, skipped: 1 },
  });
  await expect(playwright?.stdout).toMatchFileSnapshot('__snapshots__/reporter-quiet.txt');
});
