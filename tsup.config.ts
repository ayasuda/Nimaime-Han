import { defineConfig } from 'tsup';

// The two builds run in parallel, so neither cleans `dist/`; the `build` script removes it first.
export default defineConfig([
  // Library entry points: dual ESM + CJS output with type declarations.
  {
    entry: {
      index: 'src/index.ts',
      'parser/index': 'src/parser/index.ts',
      'runtime/index': 'src/runtime/index.ts',
      'reporter/index': 'src/reporter/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: {
      // tsup's dts worker injects `baseUrl`, which TypeScript 6 reports as deprecated.
      compilerOptions: { ignoreDeprecations: '6.0' },
    },
    sourcemap: true,
    clean: false,
    target: 'node20',
    platform: 'node',
    splitting: false,
    external: ['@playwright/test'],
  },
  // CLI (bin): ESM only, no declarations. The shebang in the source is preserved.
  {
    entry: { 'cli/nimaime-gen': 'src/cli/nimaime-gen.ts' },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    clean: false,
    target: 'node20',
    platform: 'node',
    splitting: false,
    external: ['@playwright/test'],
  },
]);
