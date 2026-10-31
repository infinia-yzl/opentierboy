#!/usr/bin/env node
/**
 * Captures real shared tier list links as golden fixtures for the Playwright suite.
 *
 * Usage:
 *   node scripts/capture-shared-links.mjs --source "<where the link came from>" <url-or-path> [...]
 *
 * For each link, the script decodes the `state` parameter once and records what a visitor
 * must see: the page title, the tier names in order and the item labels in each tier.
 * New entries are appended to tests/fixtures/shared-links.json.
 *
 * Existing entries are NEVER rewritten. They are the contract that old links must keep
 * working, so a failing fixture means the app regressed. Do not "fix" the fixture.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import LZString from 'lz-string';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = path.join(root, 'tests/fixtures/shared-links.json');
const config = JSON.parse(fs.readFileSync(path.join(root, 'imageset.config.json'), 'utf8'));

const slugify = (text) => text.toString().toLowerCase()
  .replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-');
const seoTagSlug = (tag) => tag ? tag.toLowerCase().replace(/_+/g, '-').replace(/^-|-$/g, '') : '';

// Same rule as TierCortex.initializePackageItemLookup at the time of capture.
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

function capture(link, source) {
  const url = new URL(link, 'https://opentierboy.com');
  const state = url.searchParams.get('state');
  if (!state) throw new Error(`No state parameter in ${link}`);
  const parsed = JSON.parse(LZString.decompressFromEncodedURIComponent(state));
  const tiers = Array.isArray(parsed) ? parsed : parsed.tiers;
  return {
    source,
    format: describeFormat(parsed),
    path: url.pathname,
    state,
    expected: {
      title: (!Array.isArray(parsed) && parsed.title) || pageTitle(url.pathname),
      tiers: tiers.map((tier) => ({
        name: tier.n.trim() || 'Unranked',
        items: tier.t.map((item) => packageLabels.get(item.i) ?? item.c),
      })),
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

const existing = fs.existsSync(fixturePath) ? JSON.parse(fs.readFileSync(fixturePath, 'utf8')) : [];
const known = new Set(existing.map((entry) => entry.state));
let added = 0;
for (const link of links) {
  const entry = capture(link, source);
  const key = entry.state;
  if (known.has(key)) continue;
  known.add(key);
  existing.push({id: `link-${String(existing.length + 1).padStart(3, '0')}`, ...entry});
  added++;
}
fs.mkdirSync(path.dirname(fixturePath), {recursive: true});
fs.writeFileSync(fixturePath, JSON.stringify(existing, null, 2) + '\n');
console.log(`Added ${added} link(s). The fixture file now holds ${existing.length}.`);
