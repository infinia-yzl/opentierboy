import {defineConfig, globalIgnores} from 'eslint/config';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import prettier from 'eslint-config-prettier/flat';

// Import rules (amendments A12, A31 and A41). For one file, ESLint uses the options of the last
// matching block that sets a rule. So every block builds its list with restrictImports(), which
// always adds the rules that hold everywhere (SHARED_IMPORT_RULES): a later block can never drop
// them. A rule for every file goes into SHARED_IMPORT_RULES, and the files it does not apply to
// go into the "Everywhere" block's ignores.

/** IndexedDB libraries: only lib/images/deviceStore.ts and its tests may use them. */
const INDEXED_DB_LIBRARIES = {
  regex: '^(?:dexie|idb|idb-keyval|localforage|fake-indexeddb)(?:/.*)?$',
  message: 'Only lib/images/deviceStore.ts (and its tests) may use IndexedDB libraries. Use that module instead.',
};

/** Node built-in modules, which the edge runtime does not have. */
const NODE_BUILT_INS = {
  regex: '^(?:node:.*|os|crypto|fs|path|child_process)(?:/.*)?$',
  message: 'This code runs in the edge runtime (the OG preview route): no Node built-in modules.',
};

/** lib/state may import lz-string and its own files only (tests/unit/state/purity.test.ts checks the full rule). */
const STATE_FRAMEWORKS = {
  group: ['react', 'react-dom', 'react-dom/*', 'next', 'next/*', '@/*'],
  message: 'lib/state runs in the browser, on the server and in the edge OG route. It imports only lz-string and lib/state files: no React, Next or @/ app imports.',
};

/** A relative path with "x/.." in it, such as "./../utils": never needed inside lib/state. */
const STATE_ROUNDABOUT_PATH = {
  regex: '(?:^|/)(?!\\.\\.(?:/|$))[^/]+/\\.\\.(?:/|$)',
  message: 'Write relative imports in lib/state without "x/.." detours. lib/state imports only its own files.',
};

/** Blocks relative imports that climb out of lib/state from a file `depth` folders below it. */
function stateEscape(depth) {
  return {
    regex: `^(?:\\.\\./){${depth + 1},}`,
    message: 'lib/state imports only its own files and lz-string. Do not import code from outside lib/state.',
  };
}

/** Rules for every file (with the exceptions in the "Everywhere" block's ignores). */
const SHARED_IMPORT_RULES = [INDEXED_DB_LIBRARIES];

/** The no-restricted-imports setting for a block: its own patterns plus SHARED_IMPORT_RULES. */
const restrictImports = (...patterns) => ({
  'no-restricted-imports': ['error', {patterns: [...SHARED_IMPORT_RULES, ...patterns]}],
});

const stateImportRules = (depth) =>
  restrictImports(STATE_FRAMEWORKS, NODE_BUILT_INS, STATE_ROUNDABOUT_PATH, stateEscape(depth));

export default defineConfig([
  // Generated files: Playwright reports and traces, Vercel output, the image sets that the
  // build copies into public/images.
  globalIgnores(['playwright-report/', 'test-results/', 'blob-report/', '.vercel/', 'public/images/']),
  // Next.js rules (React, hooks, accessibility, imports, Core Web Vitals). They also ignore
  // .next/, out/, build/ and next-env.d.ts.
  ...nextCoreWebVitals,
  // Turns off style rules that Prettier owns.
  prettier,
  // Playwright fixtures receive a function named `use`. The hooks rule mistakes it for
  // React's use() hook. The tests contain no React components.
  {
    files: ['tests/**/*.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
  // Everywhere: no IndexedDB libraries outside the device image store.
  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'],
    ignores: ['lib/images/deviceStore.ts', 'tests/unit/images/deviceStore*.test.ts'],
    rules: restrictImports(),
  },
  // lib/state: pure code for the browser, the server and the edge runtime.
  {
    files: ['lib/state/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'sessionStorage', 'indexedDB', 'navigator', 'process'],
    },
  },
  {files: ['lib/state/*.{ts,tsx}'], rules: stateImportRules(0)},
  {files: ['lib/state/*/*.{ts,tsx}'], rules: stateImportRules(1)},
  {files: ['lib/state/*/*/*.{ts,tsx}'], rules: stateImportRules(2)},
  {files: ['lib/state/*/*/*/**/*.{ts,tsx}'], rules: stateImportRules(3)},
  // The edge OG route, and TierCortex, which it imports.
  {
    files: ['app/api/og/**/*.{ts,tsx}', 'lib/TierCortex.ts'],
    rules: restrictImports(NODE_BUILT_INS),
  },
  {
    files: ['app/api/og/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'sessionStorage', 'indexedDB'],
    },
  },
]);
