import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vitest/config';

/**
 * Unit tests live in tests/unit and end in .test.ts. Playwright specs (tests/e2e, *.spec.ts)
 * are not unit tests: Vitest never collects them.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
