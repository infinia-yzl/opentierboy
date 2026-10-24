import {defineConfig} from 'eslint/config';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import prettier from 'eslint-config-prettier/flat';

export default defineConfig([
  // Next.js rules (React, hooks, accessibility, imports, Core Web Vitals). They also ignore
  // .next/, out/, build/ and next-env.d.ts.
  ...nextCoreWebVitals,
  // Turns off style rules that Prettier owns.
  prettier,
  // eslint-plugin-react-hooks 7 (from eslint-config-next 16) adds React Compiler rules. They
  // flag existing code in these components. Fixing that means changing how the components
  // work, which waits for the editor state rework. Until then these rules only warn in
  // these files; every other file gets them as errors.
  {
    files: [
      'components/EditableLabel.tsx',
      'components/ItemCreator.tsx',
      'components/ItemManager.tsx',
      'components/ThemeSelector.tsx',
      'components/TierListManager.tsx',
      'components/ZenToggle.tsx',
    ],
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/static-components': 'warn',
    },
  },
  // Playwright fixtures receive a function named `use`. The hooks rule mistakes it for
  // React's use() hook. The tests contain no React components.
  {
    files: ['tests/**/*.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
  {
    files: ['lib/state/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['react', 'react-dom', 'react-dom/*', 'next', 'next/*', 'fs', 'fs/*', 'path', 'child_process', 'node:*', 'idb', 'idb-keyval', '@/*'],
          message: 'lib/state runs in the browser, on the server and in the edge OG route. ESLint blocks React, Next, Node modules, IndexedDB libraries and @/ app imports here; tests/unit/state/purity.test.ts enforces the full rule (only lz-string and lib/state files).',
        }],
      }],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'sessionStorage', 'indexedDB', 'navigator', 'process'],
    },
  },
  {
    files: ['app/api/og/**/*.ts', 'app/api/og/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['fs', 'fs/*', 'path', 'child_process', 'node:*', 'idb', 'idb-keyval'],
          message: 'The OG route runs in the edge runtime: no Node modules and no IndexedDB.',
        }],
      }],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'sessionStorage', 'indexedDB'],
    },
  },
]);
