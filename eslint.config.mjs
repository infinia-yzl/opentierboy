import {defineConfig, globalIgnores} from 'eslint/config';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import prettier from 'eslint-config-prettier/flat';

// Import rules (amendments A12, A31, A39 and A41). For one file, ESLint uses the options of the
// last matching block that sets a rule. So every block builds its list with restrictImports(),
// which always adds the rules that hold everywhere (IndexedDB libraries, zod): a later block can
// never drop them. Each of those rules has a few files it does not apply to; the "Everywhere"
// blocks below list them. Globals work the same way with restrictGlobals(), and selectors with
// restrictSyntax().

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

/** zod tries eval when it builds a schema, which the Content Security Policy blocks (A39). */
const ZOD_IMPORT = {
  name: 'zod',
  message: 'Import z from @/lib/zod: it turns off the eval check that the Content Security Policy reports.',
};

/** Files that may use IndexedDB: the device image store and its tests. */
const INDEXED_DB_FILES = ['lib/images/deviceStore.ts', 'tests/unit/images/deviceStore*.test.ts'];
/** Files that may import zod itself: lib/zod.ts and the test that shows why it exists. */
const ZOD_FILES = ['lib/zod.ts', 'tests/unit/zod-eval-probe.test.ts'];

/**
 * The no-restricted-imports setting for a block: its own patterns, plus the rules for every
 * file. `allow` names the shared rules the block's files are exempt from ('indexedDB', 'zod').
 */
const restrictImports = (patterns = [], {allow = []} = {}) => ({
  'no-restricted-imports': ['error', {
    patterns: [
      ...(allow.includes('indexedDB') ? [] : [INDEXED_DB_LIBRARIES]),
      ...(allow.includes('zod') ? [] : [{regex: '^zod/', message: ZOD_IMPORT.message}]),
      ...patterns,
    ],
    paths: allow.includes('zod') ? [] : [ZOD_IMPORT],
  }],
});

/** zod loaded in ways no-restricted-imports does not see: import('zod') and require('zod'). */
const ZOD_SYNTAX = [
  {selector: 'ImportExpression[source.value=/^zod(\\u002F|$)/]', message: ZOD_IMPORT.message},
  {selector: "CallExpression[callee.name='require'][arguments.0.value=/^zod(\\u002F|$)/]", message: ZOD_IMPORT.message},
];

/**
 * Ways around the guard against external requests in tests/support/test.ts. Only
 * tests/support may use them.
 */
const GUARD_BYPASSES = [
  {
    selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='continue']",
    message: 'route.continue() sends the request to the network, past the guard against external requests (tests/support/test.ts). Answer it with route.fulfill(), or pass it on with route.fallback().',
  },
  {
    selector: "CallExpression[callee.type='MemberExpression'][callee.object.name='route'][callee.property.name='fetch']",
    message: 'route.fetch() reaches the network past the guard against external requests (tests/support/test.ts). Answer the request with route.fulfill().',
  },
  {
    selector: "CallExpression[callee.type='MemberExpression'][callee.property.name=/^(newContext|launchPersistentContext)$/]",
    message: 'A new browser or request context has no guard against external requests. Use openAsVisitor or openInChromiumProfile from tests/support/test.ts.',
  },
];

/**
 * The no-restricted-syntax setting for a block: its own selectors, plus the zod selectors unless
 * `allow` has 'zod'. Like restrictImports, so that a later block cannot drop them.
 */
const restrictSyntax = (selectors = [], {allow = []} = {}) => ({
  'no-restricted-syntax': ['error', ...(allow.includes('zod') ? [] : ZOD_SYNTAX), ...selectors],
});

const INDEXED_DB_GLOBAL = {
  name: 'indexedDB',
  message: 'Only lib/images/deviceStore.ts (and its tests) may use IndexedDB. Use that module instead.',
};

/**
 * The no-restricted-globals setting for a block: its own globals, plus indexedDB unless allowed.
 * no-restricted-properties catches the same global read through window, self or globalThis.
 */
const restrictGlobals = (globals = [], {allow = []} = {}) => {
  const indexedDb = !allow.includes('indexedDB');
  return {
    'no-restricted-globals': ['error', ...(indexedDb ? [INDEXED_DB_GLOBAL] : []), ...globals],
    'no-restricted-properties': ['error', ...(indexedDb
      ? ['window', 'self', 'globalThis'].map((object) => ({object, property: 'indexedDB', message: INDEXED_DB_GLOBAL.message}))
      : [])],
  };
};

/** Code that the edge OG route runs: lib/TierCortex.ts and the image helpers it uses. */
const EDGE_FILES = [
  'app/api/og/**/*.{ts,tsx}',
  'lib/TierCortex.ts',
  'lib/images/linkImage.ts',
  'lib/images/trustedSites.ts',
  'lib/images/imageType.ts',
  'lib/images/listImages.ts',
];

const stateImportRules = (depth) =>
  restrictImports([STATE_FRAMEWORKS, NODE_BUILT_INS, STATE_ROUNDABOUT_PATH, stateEscape(depth)]);

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
  // Everywhere: IndexedDB only in the device image store, zod only through lib/zod.ts.
  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'],
    ignores: [...INDEXED_DB_FILES, ...ZOD_FILES],
    rules: {...restrictImports(), ...restrictGlobals(), ...restrictSyntax()},
  },
  {
    files: INDEXED_DB_FILES,
    rules: {...restrictImports([], {allow: ['indexedDB']}), ...restrictGlobals([], {allow: ['indexedDB']}), ...restrictSyntax()},
  },
  {files: ZOD_FILES, rules: {...restrictImports([], {allow: ['zod']}), ...restrictGlobals(), ...restrictSyntax([], {allow: ['zod']})}},
  // Tests: no way around the guard against external requests, except in tests/support.
  {
    files: ['tests/**/*.ts'],
    ignores: ['tests/support/**', ...ZOD_FILES],
    rules: restrictSyntax(GUARD_BYPASSES),
  },
  // lib/state: pure code for the browser, the server and the edge runtime.
  {
    files: ['lib/state/**/*.{ts,tsx}'],
    rules: restrictGlobals(['window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'process']),
  },
  {files: ['lib/state/*.{ts,tsx}'], rules: stateImportRules(0)},
  {files: ['lib/state/*/*.{ts,tsx}'], rules: stateImportRules(1)},
  {files: ['lib/state/*/*/*.{ts,tsx}'], rules: stateImportRules(2)},
  {files: ['lib/state/*/*/*/**/*.{ts,tsx}'], rules: stateImportRules(3)},
  // The edge OG route, and TierCortex, which it imports.
  {
    files: EDGE_FILES,
    rules: restrictImports([NODE_BUILT_INS]),
  },
  {
    files: ['app/api/og/**/*.{ts,tsx}'],
    rules: {
      ...restrictGlobals(['window', 'document', 'localStorage', 'sessionStorage']),
    },
  },
]);
