import {fileURLToPath} from 'node:url';
import {configDefaults, defineConfig} from 'vitest/config';

/**
 * Unit tests live in tests/unit and end in .test.ts. Playwright specs (tests/e2e, *.spec.ts)
 * are not unit tests: Vitest never collects them. Neither are the upstream tests of the
 * vendored libraries in packages/ (they need Bun; see docs/dnd-fork.md).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'packages/**'],
    environment: 'node',
    // The link-state tests run thousands of random lists. Alone the slowest takes about 3 s,
    // but on a busy machine or a slow CI runner the 5 s default is too tight.
    testTimeout: 30_000,
  },
});
