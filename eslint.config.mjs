import {defineConfig, globalIgnores} from 'eslint/config';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import prettier from 'eslint-config-prettier/flat';

// Import rules (amendments A12, A31, A39 and A41), and no classes in our own code (A47). For one
// file, ESLint uses the options of the last matching block that sets a rule. So every block
// builds its list with restrictImports(), which always adds the rules that hold everywhere
// (IndexedDB libraries, zod, dnd-kit): a later block can never drop them. Each of those rules
// has a few files it does not apply to; the "Everywhere" blocks below list them. Globals work
// the same way with restrictGlobals(), and selectors with restrictSyntax().

/** IndexedDB libraries: only lib/images/deviceStore.ts and its tests may use them. */
const INDEXED_DB_LIBRARIES = {
  regex: '^(?:dexie|idb|idb-keyval|localforage|fake-indexeddb)(?:/.*)?$',
  message: 'Only lib/images/deviceStore.ts (and its tests) may use IndexedDB libraries. Use that module instead.',
};

/** Only lib/dnd may import dnd-kit (the fork in packages/dnd-kit, see docs/dnd-fork.md). */
const DND_KIT_ONLY_IN_LIB_DND = {
  group: ['@dnd-kit/*'],
  message: 'Only lib/dnd may import dnd-kit. Use the drag and drop adapter in lib/dnd (docs/dnd-fork.md).',
};

/** Node built-in modules, which the edge runtime does not have. */
const NODE_BUILT_INS = {
  regex: '^(?:node:.*|os|crypto|fs|path|child_process)(?:/.*)?$',
  message: 'This code runs in the edge runtime (the OG preview route): no Node built-in modules.',
};

/** lib/state may import lz-string and its own files only (tests/unit/rules/state-imports.test.ts checks the full rule). */
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
const INDEXED_DB_FILES = ['lib/images/deviceStore.ts', 'tests/unit/lib/images/deviceStore*.test.ts'];
/** Files that may import zod itself: lib/zod.ts and the test that shows why it exists. */
const ZOD_FILES = ['lib/zod.ts', 'tests/unit/rules/zod-eval-probe.test.ts'];
/** Files that may import dnd-kit: the drag and drop adapter and its unit tests. */
const DND_KIT_FILES = ['lib/dnd/**', 'tests/unit/lib/dnd/**'];

/**
 * The no-restricted-imports setting for a block: its own patterns, plus the rules for every
 * file. `allow` names the shared rules the block's files are exempt from ('indexedDB', 'zod',
 * 'dndKit').
 */
const restrictImports = (patterns = [], {allow = []} = {}) => ({
  'no-restricted-imports': ['error', {
    patterns: [
      ...(allow.includes('indexedDB') ? [] : [INDEXED_DB_LIBRARIES]),
      ...(allow.includes('dndKit') ? [] : [DND_KIT_ONLY_IN_LIB_DND]),
      ...(allow.includes('zod') ? [] : [{regex: '^zod/', message: ZOD_IMPORT.message}]),
      ...patterns,
    ],
    paths: allow.includes('zod') ? [] : [ZOD_IMPORT],
  }],
});

/** A module name that is zod or a path inside it, as an esquery regular expression. */
const ZOD_NAME = '/^zod(\\u002F|$)/';
/** Selectors for a string, or a template without expressions, naming zod at `path`. */
const zodNameAt = (path) => [
  `[${path}.value=${ZOD_NAME}]`,
  `[${path}.type='TemplateLiteral'][${path}.quasis.length=1][${path}.quasis.0.value.cooked=${ZOD_NAME}]`,
];
/**
 * zod loaded in ways no-restricted-imports does not see: import('zod'), require('zod'),
 * module.require('zod'), createRequire(...)('zod') and vi.importActual('zod'), with a string
 * or a template without expressions. Out of scope: a loader under another name
 * (`const load = require; load('zod')`), require.call(...) and computed names ('zo' + 'd').
 */
const ZOD_SYNTAX = [
  ['ImportExpression', 'source'],
  ["CallExpression[callee.name='require']", 'arguments.0'],
  ["CallExpression[callee.object.name='module'][callee.property.name='require']", 'arguments.0'],
  ["CallExpression[callee.type='CallExpression'][callee.callee.name='createRequire']", 'arguments.0'],
  ["CallExpression[callee.object.name='vi'][callee.property.name='importActual']", 'arguments.0'],
].flatMap(([call, path]) => zodNameAt(path).map((name) => ({selector: `${call}${name}`, message: ZOD_IMPORT.message})));

/** A call of a method with one of these names, written `x.name(...)` or `x['name'](...)`. */
const methodCall = (names) => [
  `CallExpression[callee.type='MemberExpression'][callee.computed=false][callee.property.name=${names}]`,
  `CallExpression[callee.type='MemberExpression'][callee.computed=true][callee.property.value=${names}]`,
];

/**
 * Ways around the guard against external requests in tests/support/test.ts. Only
 * tests/support may use them. page.request and context.request need no rule: the fixtures
 * guard them at run time.
 */
const GUARD_BYPASSES = [
  ...methodCall('/^continue$/').map((selector) => ({
    selector,
    message: 'route.continue() sends the request to the network, past the guard against external requests (tests/support/test.ts). Answer it with route.fulfill(), or pass it on with route.fallback().',
  })),
  // `.fetch(` on anything but what the guard covers (the `request` fixture, page.request and
  // context.request, and window.fetch or self.fetch inside page.evaluate): route.fetch(),
  // whatever the route handler's argument is called, reaches the network past the guard.
  ...methodCall('/^fetch$/').map((selector) => ({
    selector: `${selector}:not([callee.object.type='Identifier'][callee.object.name=/^(request|window|self)$/], [callee.object.type='MemberExpression'][callee.object.property.name='request'])`,
    message: 'route.fetch() reaches the network past the guard against external requests (tests/support/test.ts). Answer the request with route.fulfill(); for API calls use the `request` fixture.',
  })),
  ...methodCall('/^(newContext|launchPersistentContext|launch|launchServer|connect|connectOverCDP)$/').map((selector) => ({
    selector,
    message: 'A new browser or request context has no guard against external requests. Use openAsVisitor or openInChromiumProfile from tests/support/test.ts.',
  })),
  ...methodCall('/^newPage$/').map((selector) => ({
    selector: `${selector}:matches([callee.object.name='browser'], [callee.object.property.name='browser'], [callee.object.callee.property.name='browser'], [callee.object.expression.callee.property.name='browser'])`,
    message: 'browser.newPage() opens a new context without the guard against external requests. Use the `page` fixture, or openAsVisitor from tests/support/test.ts.',
  })),
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

/** Code that the edge OG route runs: lib/TierCortex.ts, the modules it binds, and the image helpers it uses. */
const EDGE_FILES = [
  'app/api/og/**/*.{ts,tsx}',
  'lib/TierCortex.ts',
  'lib/packageItems.ts',
  'lib/listLink.ts',
  'lib/linkPreview.ts',
  'lib/images/linkImage.ts',
  'lib/images/trustedSites.ts',
  'lib/images/imageType.ts',
  'lib/images/listImages.ts',
];

/** Every JavaScript and TypeScript file. */
const CODE_FILES = '**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}';

/**
 * Our own code is functional, with no classes (A47, CLAUDE.md "Code conventions"). The rule
 * covers every code file, so a new folder or a new file at the root is covered too. Classes stay
 * allowed in tests, in the vendored dnd-kit fork (packages/, Phase 5e) and in these config
 * files at the root, which tools load.
 *
 * @type {string[]}
 */
export const ROOT_CONFIG_FILES = ['eslint.config.mjs', 'next.config.ts', 'playwright.config.ts', 'postcss.config.mjs', 'vitest.config.mts', 'next-env.d.ts'];
const CLASSES_ALLOWED_IN = ['tests/**', 'packages/**', ...ROOT_CONFIG_FILES];

/**
 * Files of our own code that may declare a class because a third-party API requires one. Each
 * such file declares only that class and says in a comment which API needs it. Add the file
 * here; never turn the rule off with a comment.
 *
 * - lib/dnd/dndKit.ts: HoldThenMoveConstraint, because dnd-kit's ActivationConstraint API
 *   requires a subclass (tests/unit/rules/no-classes.test.ts checks it is the only class).
 *
 * @type {string[]}
 */
export const ALLOWED_CLASS_FILES = ['lib/dnd/dndKit.ts'];

const NO_CLASS_MESSAGE = 'Our code is functional, with no classes (A47, "Code conventions" in CLAUDE.md). '
  + 'Write plain functions, and a factory function with closures for state. A class that a third-party '
  + 'API requires goes in a file of its own, listed in ALLOWED_CLASS_FILES in eslint.config.mjs.';
const NO_CLASSES = ['ClassDeclaration', 'ClassExpression'].map((selector) => ({selector, message: NO_CLASS_MESSAGE}));

const stateImportRules = (depth) =>
  restrictImports([STATE_FRAMEWORKS, NODE_BUILT_INS, STATE_ROUNDABOUT_PATH, stateEscape(depth)]);

export default defineConfig([
  // Generated files: Playwright reports and traces, Vercel output, the image sets that the
  // build copies into public/images. packages/ holds vendored libraries (docs/dnd-fork.md):
  // they keep their upstream code style and are checked by their own build.
  globalIgnores(['playwright-report/', 'test-results/', 'blob-report/', '.vercel/', 'public/images/', 'packages/']),
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
  // Playwright code: a call or assertion without `await` runs on after the test moves on, so the
  // test checks nothing or fails at random (Playwright best practices: "Lint your tests"), and an
  // async callback that nothing awaits, such as forEach(async …), does the same. The
  // rule needs type information, so these files are linted with the TypeScript project, and
  // only files that exist are linted this way (the lint tests use real paths here).
  {
    files: ['tests/e2e/**/*.ts', 'tests/pages/**/*.ts', 'tests/support/**/*.ts'],
    languageOptions: {
      parserOptions: {projectService: true, tsconfigRootDir: import.meta.dirname},
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  // Everywhere: IndexedDB only in the device image store, zod only through lib/zod.ts, dnd-kit
  // only in lib/dnd.
  {
    files: [CODE_FILES],
    ignores: [...INDEXED_DB_FILES, ...ZOD_FILES, ...DND_KIT_FILES],
    rules: {...restrictImports(), ...restrictGlobals(), ...restrictSyntax()},
  },
  {
    files: INDEXED_DB_FILES,
    rules: {...restrictImports([], {allow: ['indexedDB']}), ...restrictGlobals([], {allow: ['indexedDB']}), ...restrictSyntax()},
  },
  {files: ZOD_FILES, rules: {...restrictImports([], {allow: ['zod']}), ...restrictGlobals(), ...restrictSyntax([], {allow: ['zod']})}},
  {files: DND_KIT_FILES, rules: {...restrictImports([], {allow: ['dndKit']}), ...restrictGlobals(), ...restrictSyntax()}},
  // Tests: no way around the guard against external requests, except in tests/support.
  {
    files: ['tests/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'],
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
  // The edge OG route, and TierCortex and its modules, which it imports.
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
  // Our own code: no classes (A47). These come after every other block that sets
  // no-restricted-syntax for these files, and restrictSyntax() keeps the zod selectors.
  // lib/zod.ts keeps its zod exemption.
  {files: [CODE_FILES], ignores: [...CLASSES_ALLOWED_IN, ...ALLOWED_CLASS_FILES, ...ZOD_FILES], rules: restrictSyntax(NO_CLASSES)},
  {files: ZOD_FILES, ignores: [...CLASSES_ALLOWED_IN, ...ALLOWED_CLASS_FILES], rules: restrictSyntax(NO_CLASSES, {allow: ['zod']})},
]);
