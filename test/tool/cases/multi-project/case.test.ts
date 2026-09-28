import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { CaseProject, runCase } from '../../harness';

it('generates each configuration into its own outputDir and runs both projects', async () => {
  const { gen, playwright } = await runCase(import.meta.dirname, {
    args: ['--verbose'],
    stdout: [
      /Generated 1 spec file \(1 test\) into \.sanmaime-gen[/\\]admin/,
      /Generated 1 spec file \(2 tests\) into \.sanmaime-gen[/\\]public/,
    ],
    generated: [
      '.sanmaime-gen/admin/admin/specs/dashboard.spec.ts',
      '.sanmaime-gen/public/public/specs/home.spec.ts',
    ],
    playwright: {
      passed: 3,
      stdout: [
        '✓ Screen: Dashboard [admin]',
        '✓ Screen: Home [public]',
        '    ✓ Settings is hidden',
      ],
    },
  });
  expect(gen.stderr).toBe(
    'Config .sanmaime-gen/admin: 1 spec file, 1 definition file.\n' +
      'Config .sanmaime-gen/public: 1 spec file, 1 definition file.\n',
  );
  expect(playwright?.tests.map((test) => `${test.project}: ${test.title}`).sort()).toEqual([
    'admin: Screen: Dashboard > Element: Admin Menu > Always',
    'public: Screen: Home > Element: Main Menu > Always',
    'public: Screen: Home > Element: Welcome Banner > Always',
  ]);
});

it('runs one project with --project', async () => {
  await runCase(import.meta.dirname, {
    snapshot: false,
    playwright: { args: ['--project', 'public'], passed: 2 },
  });
});

it('still generates the other configuration when one has errors', async () => {
  const project = new CaseProject(import.meta.dirname);
  fs.writeFileSync(
    path.join(project.dir, 'admin/specs/broken.sanmaime'),
    'Screen: Dashboard\n\n  Element: Audit Log\n    Show: Entries\n',
  );
  await project.gen({
    exitCode: 1,
    snapshot: false,
    generated: ['.sanmaime-gen/public/public/specs/home.spec.ts'],
    stdout: [/Generated 1 spec file \(2 tests\) into \.sanmaime-gen[/\\]public/],
    stderr: [
      'admin/specs/broken.sanmaime:3:3\n    Element "Audit Log" is not defined',
      /nothing was generated into \.sanmaime-gen[/\\]admin \(1 error\)/,
    ],
  });
});
