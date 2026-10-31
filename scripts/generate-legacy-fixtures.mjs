#!/usr/bin/env node
/**
 * Generates tests/fixtures/state/generated.json: golden links written by the real historical
 * encoders of the three legacy link formats.
 *
 *   format  commit   file                    shipped
 *   v0      c7a5995  lib/tierStateUtils.ts   2024-07-11
 *   v1      6daca2d  lib/TierCortex.ts       2024-07-25
 *   v2      a273ba8  lib/TierCortex.ts       2024-07-28 (still the format the app writes)
 *
 * How the encoders run: the script reads each encoder file from git history
 * (`git show <commit>:<file>`), strips the TypeScript types with the TypeScript compiler
 * (ts.transpileModule, no type checking), and executes the result with the modules it imported
 * at that commit: lz-string (checked against that commit's package-lock.json: 1.5.0 then and
 * now), that commit's imageset.config.json and that commit's models/Tier.ts. The v0 module
 * builds its item lookup at load time; it runs as it did then. `window` is undefined, `process`
 * has an empty env and `localStorage` is an empty stub, as on a server.
 *
 * Executed, not reimplemented: the encoders themselves, and the historical decoders, which the
 * script runs on every generated link as a cross-check.
 * Reimplemented (a few lines of React components that cannot run outside the app): how
 * TierListManager at each commit turned the on-screen list into encoder input.
 *   - v0, v1: the on-screen items as they are. A package item's label is the label in that
 *     commit's imageset.config.json, or in bf2ff6e's config for packages added later.
 *   - v2: items become {i: id, c: isCustomItem(id) ? label : undefined}. "Custom" means not a
 *     package item at bf2ff6e (the newest config before lib/state; it holds every id that
 *     a273ba8 knew, and the v2 encoder has not changed since).
 * The script also checks that the encoder at bf2ff6e writes the same bytes as a273ba8.
 *
 * Usage:
 *   node scripts/generate-legacy-fixtures.mjs          append entries that are not in the file
 *   node scripts/generate-legacy-fixtures.mjs --check  regenerate and compare, write nothing
 *                                                      (npm run check runs this, so CI does too)
 *
 * Needs the full git history (a shallow clone lacks the historical commits).
 * The fixtures are append-only: an entry that is already in the file is never rewritten. If a
 * regenerated entry differs from the stored one, the script fails and changes nothing.
 * To add samples, add them at the end of SAMPLES and run the script.
 */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import LZString from 'lz-string';
import ts from 'typescript';
import {readFileIfExists} from './lib/files.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(root, 'tests/fixtures/state/generated.json');

/** Parsed JSON files from git history, by `commit:file`. */
const jsonCache = new Map();

/** The last commit before lib/state: its config supplies labels for packages added after an encoder. */
const LABEL_COMMIT = 'bf2ff6e';

const ENCODERS = [
  {format: 'v0', commit: 'c7a5995', file: 'lib/tierStateUtils.ts'},
  {format: 'v1', commit: '6daca2d', file: 'lib/TierCortex.ts'},
  {format: 'v2', commit: 'a273ba8', file: 'lib/TierCortex.ts'},
];

// ---------------------------------------------------------------------------------------------
// Sample lists. Append new samples at the end; never change or remove one (entries are
// append-only, and a changed sample would no longer match its stored entries).
// ---------------------------------------------------------------------------------------------

const pkg = (packageName, filename) => ({id: `${packageName}-${filename}`});
const custom = (id, content) => ({id, content, custom: true});
const row = (id, name, items = []) => ({id, name, items});

const ow = (filename) => pkg('image-overwatch', filename);
const finals = (filename) => pkg('image-reachthefinals', `${filename}_Rank_1.webp`);

function allItemsAt(commit) {
  const config = readJsonAt(commit, 'imageset.config.json');
  return Object.entries(config.packages)
    .flatMap(([packageName, data]) => data.images.map((image) => pkg(packageName, image.filename)));
}

function spreadOver(tiers, items) {
  const result = tiers.map(([id, name]) => row(id, name));
  items.forEach((item, index) => result[index % result.length].items.push(item));
  return result;
}

function itemsOfPackageAt(commit, packageName) {
  const config = readJsonAt(commit, 'imageset.config.json');
  return config.packages[packageName].images.map((image) => pkg(packageName, image.filename));
}

const SEVEN_ROWS = [['tier-ss', 'SS'], ['tier-s', 'S'], ['tier-a', 'A'], ['tier-b', 'B'], ['tier-c', 'C'],
  ['tier-d', 'D'], ['tier-f', 'F'], ['uncategorized', '']];

const SAMPLES = [
  {
    id: 'template-as-opened',
    description: 'The 5-row template as a template page opens it: every image-set item unranked (two in a subfolder, one labelled with its filename), no title.',
    title: undefined,
    tiers: [
      row('tier-s', 'S'), row('tier-a', 'A'), row('tier-b', 'B'), row('tier-c', 'C'), row('tier-f', 'F'),
      row('uncategorized', '', [
        pkg('image-set', 'hero1.webp'), pkg('image-set', 'hero2.webp'), pkg('image-set', 'hero3.webp'),
        pkg('image-set', 'mecha/mecha1.webp'), pkg('image-set', 'mecha/mecha2.webp'),
      ]),
    ],
  },
  {
    id: 'ranked-unicode-title',
    description: '7-row Overwatch ranking with an empty D tier and a title with curly quotes, an apostrophe, emoji, CJK, Hangul and a backslash.',
    title: 'Overwatch 2 “S11” — Torbjörn\'s 🔨 picks (日本語/한국어) \\o/',
    tiers: [
      row('tier-ss', 'SS', [ow('mau.webp'), ow('win.webp'), ow('dva.webp')]),
      row('tier-s', 'S', [ow('tob.webp'), ow('ill.webp')]),
      row('tier-a', 'A', [ow('s76.webp'), ow('ana.webp'), ow('kir.webp')]),
      row('tier-b', 'B', [ow('gen.webp')]),
      row('tier-c', 'C', [ow('han.webp'), ow('hzd.webp')]),
      row('tier-d', 'D'),
      row('tier-f', 'F', [ow('bal.webp')]),
      row('uncategorized', '', [ow('zen.webp'), ow('luc.webp'), ow('mer.webp')]),
    ],
  },
  {
    id: 'renamed-reordered-rows',
    description: 'Rows dragged into a new order (tier ids no longer match their positions) and renamed: emoji, double quotes, an empty label, Arabic, HTML-like text. THE FINALS items whose label changed case since 2024.',
    title: 'THE FINALS — \'Light\' & "Heavy" builds',
    tiers: [
      row('tier-c', 'GOAT 🐐', [finals('APS_Turret'), finals('50_Akimbo')]),
      row('tier-s', 'Mid "ok"', [finals('93R'), finals('Charge_N_Slam')]),
      row('tier-f', ''),
      row('tier-a', 'مقبول', [finals('AKM')]),
      row('tier-b', 'Ñandú <b>bold</b> & co', [finals('C4'), finals('Dagger'), finals('FCAR')]),
      row('uncategorized', '', [finals('Flamethrower')]),
    ],
  },
  {
    id: 'empty-list',
    description: 'A 3-row list with no items and an empty title (the encoders leave an empty title out).',
    title: '',
    tiers: [row('tier-s', 'S'), row('tier-a', 'A'), row('tier-b', 'B'), row('uncategorized', '')],
  },
  {
    id: 'custom-items',
    description: 'Uploaded (custom) items next to package items: labels with parentheses, accents, ZWJ emoji, quotes, a backslash, a flag, and an empty label (a file named ".png").',
    title: 'Custom & package <items>',
    tiers: [
      row('tier-s', 'S', [custom('k3j9x0a1b', 'my cat (2)'), pkg('image-wutheringwaves', 'c/aa.webp')]),
      row('tier-a', 'A', [custom('q8w7e6r5t', 'Ünïcödé 🐱‍👤'), custom('z1x2c3v4b', '"quoted" \\ backslash')]),
      row('tier-b', 'B', [ow('ana.webp')]),
      row('tier-c', 'C'),
      row('tier-f', 'F', [custom('m0n9b8v7c', '')]),
      row('uncategorized', '', [custom('p5o4i3u2y', '👨‍👩‍👧‍👦 family 🇲🇾'), pkg('image-set', 'hero2.webp')]),
    ],
  },
  {
    id: 'all-items-every-package',
    description: `Every item of all seven packages at ${LABEL_COMMIT} (430 items) spread over the 7-row template.`,
    title: 'Everything 🌍 (430 items)',
    tiers: spreadOver(SEVEN_ROWS, allItemsAt(LABEL_COMMIT)),
  },
  {
    id: 'legacy-sets-after-template-switch',
    description: 'A list switched to the 3-row template, with items from SUPERVIVE, Web Development, HELLDIVERS 2 and WUTHERING WAVES (nested filenames, labels with quotes and a leading dot), and a title that looks like HTML.',
    title: '<script>alert("x")</script>',
    tiers: [
      row('tier-s', 'S', [pkg('image-supervive', 'c/e_astrike.webp'), pkg('image-helldivers2', 'ad334guarddog.webp')]),
      row('tier-a', 'A', [pkg('image-webdev', 'be/actionhero.webp'), pkg('image-webdev', 'be/dotnet.webp')]),
      row('tier-b', 'B', [pkg('image-supervive', 'eq/eq_glide.webp'), pkg('image-wutheringwaves', 'c/rm-h.webp')]),
      row('uncategorized', '', [pkg('image-supervive', 'bee.webp'), pkg('image-helldivers2', 'axtx13guarddogdogbreath.webp')]),
    ],
  },
  {
    id: 'long-unranked-row-whitespace',
    description: 'Three rows with labels that keep spaces, a line break and a tab, all 130 HELLDIVERS 2 items left in the unranked row, and a title made of spaces (kept, because it is not empty).',
    title: '   ',
    tiers: [
      row('tier-s', '  spaced  '),
      row('tier-a', 'line\nbreak\ttab', [custom('a0b1c2d3e', 'tab\there')]),
      row('uncategorized', '', itemsOfPackageAt(LABEL_COMMIT, 'image-helldivers2')),
    ],
  },
];

// ---------------------------------------------------------------------------------------------
// Running historical code
// ---------------------------------------------------------------------------------------------

function git(...args) {
  return execFileSync('git', args, {cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
}

function readAt(commit, file) {
  try {
    return git('show', `${commit}:${file}`);
  } catch {
    throw new Error(`Cannot read ${commit}:${file}. The generator needs the full git history (git fetch --unshallow).`);
  }
}

function readJsonAt(commit, file) {
  const key = `${commit}:${file}`;
  if (!jsonCache.has(key)) jsonCache.set(key, JSON.parse(readAt(commit, file)));
  return jsonCache.get(key);
}

const emptyLocalStorage = {getItem: () => null, setItem: () => undefined, removeItem: () => undefined};

/** Executes a TypeScript module from git history with the given imports and globals. */
function runHistoricalModule(commit, file, imports, globals = {}) {
  const source = readAt(commit, file);
  const {outputText} = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true},
  });
  const commonJsModule = {exports: {}};
  const requireImport = (specifier) => {
    if (Object.prototype.hasOwnProperty.call(imports, specifier)) return imports[specifier];
    throw new Error(`${commit}:${file} imports "${specifier}", which the generator does not provide.`);
  };
  const globalNames = Object.keys(globals);
  const run = new Function('module', 'exports', 'require', ...globalNames, outputText);
  run(commonJsModule, commonJsModule.exports, requireImport, ...globalNames.map((name) => globals[name]));
  return commonJsModule.exports;
}

function checkLzStringVersion(commit) {
  const lock = readJsonAt(commit, 'package-lock.json');
  const then = lock.packages?.['node_modules/lz-string']?.version;
  const now = require('lz-string/package.json').version;
  if (then !== now) {
    throw new Error(`${commit} used lz-string ${then}, but ${now} is installed. Install lz-string@${then} to run its encoder.`);
  }
}

/** Loads the encoder (and decoder) module of a commit, wired to that commit's own imports. */
function loadCodec(commit, file) {
  checkLzStringVersion(commit);
  const tierModule = runHistoricalModule(commit, 'models/Tier.ts', {});
  const imports = {
    'lz-string': LZString,
    '@/imageset.config.json': readJsonAt(commit, 'imageset.config.json'),
    '@/models/Tier': tierModule,
  };
  const globals = {window: undefined, process: {env: {}}, localStorage: emptyLocalStorage};
  return runHistoricalModule(commit, file, imports, globals);
}

function labelLookup(commit) {
  const lookup = new Map();
  for (const [packageName, data] of Object.entries(readJsonAt(commit, 'imageset.config.json').packages)) {
    for (const image of data.images) {
      lookup.set(`${packageName}-${image.filename}`, image.label || image.filename.split('.')[0]);
    }
  }
  return lookup;
}

// ---------------------------------------------------------------------------------------------
// Generating entries
// ---------------------------------------------------------------------------------------------

const newestLabels = labelLookup(LABEL_COMMIT);

/** The list as it was on screen when the app at `commit` encoded it (models/Item shape). */
function onScreenTiers(sample, packageItemLookup) {
  return sample.tiers.map((tier) => ({
    id: tier.id,
    name: tier.name,
    items: tier.items.map((item) => {
      if (item.custom) return {id: item.id, content: item.content, imageUrl: 'blob:uploaded-image'};
      const known = packageItemLookup[item.id];
      if (known) return known;
      const label = newestLabels.get(item.id);
      if (label === undefined) throw new Error(`Sample ${sample.id} uses unknown item ${item.id}`);
      return {id: item.id, content: label, imageUrl: `/images/${item.id}`};
    }),
  }));
}

/** The canonical state lib/state must decode, derived from the encoder input and the format rules. */
function expectedState(format, title, encoderTiers) {
  const tiers = encoderTiers.map((tier) => ({
    id: tier.id,
    name: tier.name,
    items: tier.items.map((item) => (format === 'v2'
      ? (item.c === undefined ? {id: item.i} : {id: item.i, content: item.c})
      : {id: item.id, content: item.content})),
  }));
  if (format === 'v0') return {version: 0, tiers};
  const everyItemHasLabel = tiers.every((tier) => tier.items.every((item) => 'content' in item));
  return {version: everyItemHasLabel ? 1 : 2, ...(title ? {title} : {}), tiers};
}

/** What the bytes say, read directly: a sanity check of expectedState. */
function readBack(format, encoded) {
  const parsed = JSON.parse(LZString.decompressFromEncodedURIComponent(encoded));
  if (format === 'v0' !== Array.isArray(parsed)) throw new Error(`${format} output has the wrong shape`);
  const tiers = (Array.isArray(parsed) ? parsed : parsed.tiers).map((tier) => ({
    id: tier.i,
    name: tier.n,
    items: tier.t.map((item) => (item.c === undefined ? {id: item.i} : {id: item.i, content: item.c})),
  }));
  return {title: Array.isArray(parsed) ? undefined : parsed.title, tiers};
}

function assertSame(actual, expected, message) {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(`${message}\nexpected: ${JSON.stringify(expected).slice(0, 400)}\nactual:   ${JSON.stringify(actual).slice(0, 400)}`);
  }
}

/** Runs the historical decoder of the same commit on the generated link. */
function crossCheckWithHistoricalDecoder(format, codec, encoded, expected, entryId) {
  const decoded = format === 'v0'
    ? {title: undefined, tiers: codec.decodeTierStateFromURL(encoded)}
    : new codec.TierCortex().decodeTierStateFromURL(encoded);
  if (!decoded || !decoded.tiers) throw new Error(`${entryId}: the historical decoder rejected the link`);
  assertSame(decoded.title, expected.title, `${entryId}: historical decoder title`);
  assertSame(decoded.tiers.length, expected.tiers.length, `${entryId}: historical decoder tier count`);
  decoded.tiers.forEach((tier, tierIndex) => {
    const expectedTier = expected.tiers[tierIndex];
    assertSame([tier.id, tier.name], [expectedTier.id, expectedTier.name], `${entryId}: historical decoder tier ${tierIndex}`);
    assertSame(tier.items.map((item) => item.id), expectedTier.items.map((item) => item.id), `${entryId}: historical decoder item ids in tier ${tierIndex}`);
    tier.items.forEach((item, itemIndex) => {
      const expectedItem = expectedTier.items[itemIndex];
      if ('content' in expectedItem) {
        assertSame(item.content, expectedItem.content, `${entryId}: historical decoder label of ${item.id}`);
      }
    });
  });
}

function generateEntries() {
  const entries = [];
  const currentEncoder = loadCodec(LABEL_COMMIT, 'lib/TierCortex.ts').TierCortex;

  for (const {format, commit, file} of ENCODERS) {
    const codec = loadCodec(commit, file);
    for (const sample of SAMPLES) {
      const entryId = `${format}-${sample.id}`;
      let encoded;
      let expected;

      if (format === 'v0') {
        // c7a5995 TierListManager: encodeTierStateForURL(updatedTiers)
        const tiers = onScreenTiers(sample, codec.packageItemLookup);
        encoded = codec.encodeTierStateForURL(tiers);
        expected = expectedState(format, undefined, tiers);
      } else {
        const cortex = new codec.TierCortex();
        const name = sample.title ?? '';
        const tiers = onScreenTiers(sample, cortex.packageItemLookup);
        if (format === 'v1') {
          // 6daca2d TierListManager: TierCortex.encodeTierStateForURL(name, updatedTiers)
          encoded = codec.TierCortex.encodeTierStateForURL(name, tiers);
          expected = expectedState(format, name, tiers);
        } else {
          // a273ba8 TierListManager: items become {i, c: isCustomItem(id) ? content : undefined}
          const isCustomItem = (id) => !newestLabels.has(id);
          const optimized = tiers.map((tier) => ({
            ...tier,
            items: tier.items.map((item) => ({
              i: item.id,
              c: isCustomItem(item.id) ? item.content : undefined,
            })),
          }));
          // The historical isCustomItem agrees on every id that commit could know about.
          for (const tier of tiers) {
            for (const item of tier.items) {
              const knownThen = Object.prototype.hasOwnProperty.call(cortex.packageItemLookup, item.id);
              if ((knownThen || isCustomItem(item.id)) && cortex.isCustomItem(item.id) !== isCustomItem(item.id)) {
                throw new Error(`${entryId}: ${commit} isCustomItem disagrees for ${item.id}`);
              }
            }
          }
          encoded = codec.TierCortex.encodeTierStateForURL(name, optimized);
          expected = expectedState(format, name, optimized);
          const current = currentEncoder.encodeTierStateForURL(name, optimized);
          if (current !== encoded) throw new Error(`${entryId}: the encoder at ${LABEL_COMMIT} writes different bytes than ${commit}`);
        }
      }

      const readBackState = readBack(format, encoded);
      assertSame(readBackState.title, expected.title, `${entryId}: title in the generated bytes`);
      assertSame(readBackState.tiers, expected.tiers, `${entryId}: tiers in the generated bytes`);
      crossCheckWithHistoricalDecoder(format, codec, encoded, expected, entryId);

      entries.push(JSON.parse(JSON.stringify({
        id: entryId,
        format,
        sourceCommit: commit,
        sourceFile: file,
        description: sample.description,
        state: encoded,
        expected,
      })));
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------------------------
// Append-only output
// ---------------------------------------------------------------------------------------------

function main() {
  const checkOnly = process.argv.includes('--check');
  const generated = generateEntries();
  const existingText = readFileIfExists(outputPath, 'utf8');
  const existing = existingText === undefined ? [] : JSON.parse(existingText);
  const stored = new Map(existing.map((entry) => [entry.id, entry]));

  const changed = generated.filter((entry) => stored.has(entry.id) && !isDeepStrictEqual(stored.get(entry.id), entry));
  const added = generated.filter((entry) => !stored.has(entry.id));

  if (changed.length > 0) {
    console.error(`Regenerated entries differ from the stored ones: ${changed.map((entry) => entry.id).join(', ')}.`);
    console.error('Stored entries are a contract and are never rewritten. Find out what changed (the samples, the');
    console.error('historical code or lz-string) instead of editing the fixture.');
    process.exit(1);
  }

  const counts = generated.reduce((all, entry) => ({...all, [entry.format]: (all[entry.format] ?? 0) + 1}), {});
  const longest = Math.max(...generated.map((entry) => entry.state.length));
  if (checkOnly) {
    if (added.length > 0) {
      console.error(`Missing from ${path.relative(root, outputPath)}: ${added.map((entry) => entry.id).join(', ')}`);
      process.exit(1);
    }
    console.log(`All ${generated.length} generated entries match the stored ones (${JSON.stringify(counts)}, longest state ${longest} characters).`);
    return;
  }

  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, JSON.stringify([...existing, ...added], null, 2) + '\n');
  console.log(`Appended ${added.length} entries; ${path.relative(root, outputPath)} holds ${existing.length + added.length} (${JSON.stringify(counts)}, longest state ${longest} characters).`);
}

main();
