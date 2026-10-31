#!/usr/bin/env node
/**
 * Captures real shared tier list links as golden fixtures for the Playwright suite.
 *
 * Usage:
 *   node scripts/capture-shared-links.mjs --source "<where the link came from>" <url-or-path> [...]
 *
 * For each link, the script decodes the `state` parameter once and records what a visitor
 * must see: the page title, the tier names in order and the item labels in each tier.
 * New entries are appended to tests/fixtures/shared-links.json. It reads every link format:
 * v0, v1 and v2, and v3 links (`3.` and lz-string of compact JSON, docs/link-format-v3.md).
 * A visitor sees a v3 link image or device image as its label (a label tile, or the
 * placeholder image with the label).
 *
 * Existing entries are NEVER rewritten. They are the contract that old links must keep
 * working, so a failing fixture means the app regressed. Do not "fix" the fixture.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import LZString from 'lz-string';
import {readFileIfExists} from './lib/files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = path.join(root, 'tests/fixtures/shared-links.json');
const config = JSON.parse(fs.readFileSync(path.join(root, 'imageset.config.json'), 'utf8'));

const slugify = (text) => text.toString().toLowerCase()
  .replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-');
const seoTagSlug = (tag) => tag ? tag.toLowerCase().replace(/_+/g, '-').replace(/^-|-$/g, '') : '';

// Same rule as packageItemLookup (lib/packageItems.ts) at the time of capture.
const packageLabels = new Map();
for (const [packageName, data] of Object.entries(config.packages)) {
  for (const image of data.images) {
    packageLabels.set(`${packageName}-${image.filename}`, image.label || image.filename.split('.')[0]);
  }
}

function pageTitle(pathname) {
  const [, rank, nameOrPackage, tagSlug] = pathname.split('/');
  if (rank !== 'rank' || !nameOrPackage) return 'Custom Tier List';
  const entry = Object.entries(config.packages)
    .find(([name, data]) => name === nameOrPackage || slugify(data.displayName) === nameOrPackage);
  if (!entry) return 'Custom Tier List';
  const [, data] = entry;
  if (tagSlug === 'all') return `${data.displayName} - All Items`;
  const tag = Object.keys(data.tags).find((t) => t === tagSlug || seoTagSlug(t) === tagSlug);
  return tag ? `${data.displayName} - ${data.tags[tag].title}` : 'Custom Tier List';
}

function describeFormat(parsed) {
  if (Array.isArray(parsed)) return 'v0';
  const items = parsed.tiers.flatMap((t) => t.t);
  return items.every((item) => 'c' in item) ? 'v1' : 'v2';
}

/** What a visitor sees in a v0, v1 or v2 link: tier names and item labels. */
function legacyView(parsed) {
  const tiers = Array.isArray(parsed) ? parsed : parsed.tiers;
  return {
    title: (!Array.isArray(parsed) && parsed.title) || undefined,
    tiers: tiers.map((tier) => ({
      name: tier.n,
      items: tier.t.map((item) => packageLabels.get(item.i) ?? item.c),
    })),
  };
}

/**
 * What a visitor sees in a v3 link. A row is [id, name, items] or [name, items]; the visitor
 * sees only the name. An item is an image-set id (its label from the image set; an unknown id
 * shows no label), {i, c} (the image set's label, or c for an id it does not know), or {u, c}
 * or {d, c} (the label c, empty when left out).
 */
function v3View(parsed) {
  return {
    title: typeof parsed.t === 'string' && parsed.t !== '' ? parsed.t : undefined,
    tiers: parsed.r.map((row) => ({
      name: row.length === 3 ? row[1] : row[0],
      items: row[row.length - 1].map((item) => {
        if (typeof item === 'string') return packageLabels.get(item) ?? '';
        if ('i' in item) return packageLabels.get(item.i) ?? item.c ?? '';
        return item.c ?? '';
      }),
    })),
  };
}

function capture(link, source) {
  const url = new URL(link, 'https://opentierboy.com');
  const state = url.searchParams.get('state');
  if (!state) throw new Error(`No state parameter in ${link}`);
  const isV3 = state.startsWith('3.');
  const parsed = JSON.parse(LZString.decompressFromEncodedURIComponent(isV3 ? state.slice(2) : state));
  const view = isV3 ? v3View(parsed) : legacyView(parsed);
  return {
    source,
    format: isV3 ? 'v3' : describeFormat(parsed),
    path: url.pathname,
    state,
    expected: {
      title: view.title || pageTitle(url.pathname),
      tiers: view.tiers.map((tier) => ({name: tier.name.trim() || 'Unranked', items: tier.items})),
    },
  };
}

const args = process.argv.slice(2);
const sourceIndex = args.indexOf('--source');
if (sourceIndex === -1 || !args[sourceIndex + 1]) {
  console.error('Pass --source "<where the link came from>" before the links.');
  process.exit(1);
}
const source = args[sourceIndex + 1];
const links = args.filter((_, i) => i !== sourceIndex && i !== sourceIndex + 1);

const existingText = readFileIfExists(fixturePath, 'utf8');
const existing = existingText === undefined ? [] : JSON.parse(existingText);
// One entry per page and state: the same state under another template path can expect another
// page title, so it is a different test.
const keyOf = (entry) => `${entry.path}\n${entry.state}`;
const known = new Set(existing.map(keyOf));
let added = 0;
for (const link of links) {
  const entry = capture(link, source);
  const key = keyOf(entry);
  if (known.has(key)) continue;
  known.add(key);
  existing.push({id: `link-${String(existing.length + 1).padStart(3, '0')}`, ...entry});
  added++;
}
fs.mkdirSync(path.dirname(fixturePath), {recursive: true});
fs.writeFileSync(fixturePath, JSON.stringify(existing, null, 2) + '\n');
console.log(`Added ${added} link(s). The fixture file now holds ${existing.length}.`);
