#!/usr/bin/env node
/**
 * Checks that every item id the app ever shipped still resolves.
 *
 * Shared links store item ids (`<packageName>-<filename>`), so an id that disappears breaks
 * every link that uses it. The registry has two files at the repository root:
 *
 *   image-registry.lock.json  every id ever shipped -> {package, filename, label}. The label is
 *                             the one shown when the id was registered (for reference only).
 *                             Append-only: entries are added, never changed or removed.
 *   image-aliases.json        {"<old id>": "<new id>"} for renamed images. TierCortex.resolveItem
 *                             follows these, so old links show the renamed image.
 *
 * The check fails when:
 *   - an image in imageset.config.json is not registered yet (run with --update),
 *   - a registered id is no longer shipped and has no alias to a shipped id,
 *   - an alias is broken: its old id was never registered or is still shipped, it loops, or it
 *     does not end at a shipped id.
 *
 * Usage:
 *   npm run check:images                 check only
 *   npm run check:images -- --update     also register new ids (appends; never removes)
 *   node scripts/check-image-registry.mjs --root <dir>   check another checkout (for tests)
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const MAX_ALIAS_STEPS = 10;

const args = process.argv.slice(2);
const update = args.includes('--update');
const rootIndex = args.indexOf('--root');
const root = rootIndex === -1
  ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  : path.resolve(args[rootIndex + 1] ?? '.');

const configPath = path.join(root, 'imageset.config.json');
const lockPath = path.join(root, 'image-registry.lock.json');
const aliasesPath = path.join(root, 'image-aliases.json');

const errors = [];
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`${path.relative(root, file)} is not valid JSON: ${error.message}`);
    process.exit(1);
  }
}

/** Every id the app ships now, with the label TierCortex shows for it. */
function shippedIds(config) {
  const ids = new Map();
  for (const [packageName, data] of Object.entries(config.packages ?? {})) {
    for (const image of data.images ?? []) {
      ids.set(`${packageName}-${image.filename}`, {
        package: packageName,
        filename: image.filename,
        label: image.label || image.filename.split('.')[0],
      });
    }
  }
  return ids;
}

const config = readJson(configPath, undefined);
if (!config) {
  console.error(`${path.relative(root, configPath) || configPath} is missing.`);
  process.exit(1);
}
const shipped = shippedIds(config);

const lockExists = fs.existsSync(lockPath);
const lock = readJson(lockPath, {});
const aliases = readJson(aliasesPath, undefined);

if (!lockExists && !update) {
  errors.push('image-registry.lock.json is missing. Create it with: npm run check:images -- --update');
}
if (!isPlainObject(lock)) errors.push('image-registry.lock.json must be a JSON object of id -> {package, filename, label}.');
if (aliases === undefined) errors.push('image-aliases.json is missing. It holds {} when no image was renamed.');
else if (!isPlainObject(aliases)) errors.push('image-aliases.json must be a JSON object of old id -> new id.');

if (errors.length === 0) {
  // Registered entries must describe their own id.
  for (const [id, entry] of Object.entries(lock)) {
    if (!isPlainObject(entry) || typeof entry.package !== 'string' || typeof entry.filename !== 'string' || typeof entry.label !== 'string') {
      errors.push(`Registry entry ${id} must be {package, filename, label} with string values.`);
    } else if (`${entry.package}-${entry.filename}` !== id) {
      errors.push(`Registry entry ${id} does not match its package and filename (${entry.package}, ${entry.filename}).`);
    }
  }

  // New ids: register them with --update.
  const added = [];
  shipped.forEach((entry, id) => {
    if (has(lock, id)) return;
    if (update) {
      lock[id] = entry;
      added.push(id);
    } else {
      errors.push(`New item id ${id} is not registered. Run: npm run check:images -- --update`);
    }
  });

  // Aliases: from a registered id that is no longer shipped, through other ids, to a shipped id.
  const resolveAlias = (id) => {
    const seen = [id];
    let current = id;
    for (let step = 0; step < MAX_ALIAS_STEPS; step++) {
      if (!has(aliases, current)) return {error: `ends at ${current}, which is not shipped`};
      const next = aliases[current];
      if (typeof next !== 'string') return {error: `maps ${current} to a value that is not an id`};
      if (seen.includes(next)) return {error: `loops (${[...seen, next].join(' -> ')})`};
      if (shipped.has(next)) return {target: next};
      seen.push(next);
      current = next;
    }
    return {error: `takes more than ${MAX_ALIAS_STEPS} steps`};
  };

  for (const oldId of Object.keys(aliases)) {
    if (!has(lock, oldId)) errors.push(`Alias ${oldId} is not a registered id. Aliases only rename ids that shipped.`);
    if (shipped.has(oldId)) errors.push(`Alias ${oldId} is still shipped, so the alias would never be used. Remove the image or the alias.`);
    const {error} = resolveAlias(oldId);
    if (error) errors.push(`Alias ${oldId} ${error}.`);
  }

  // Registered ids that are gone must have an alias.
  for (const id of Object.keys(lock)) {
    if (shipped.has(id)) continue;
    if (!has(aliases, id)) {
      errors.push(`Item id ${id} was shipped and is gone. Shared links use it: restore the image, or add "${id}": "<new id>" to image-aliases.json.`);
    }
  }

  if (update && errors.length === 0 && (added.length > 0 || !lockExists)) {
    fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
    console.log(`Registered ${added.length} new item id(s) in image-registry.lock.json.`);
    for (const id of added) console.log(`  + ${id}`);
  }

  const relabelled = Object.entries(lock).filter(([id, entry]) => shipped.has(id) && shipped.get(id).label !== entry.label);
  if (relabelled.length > 0) {
    console.log(`${relabelled.length} item(s) show a different label than when they were registered (allowed):`);
    for (const [id, entry] of relabelled) console.log(`  ${id}: "${entry.label}" -> "${shipped.get(id).label}"`);
  }
}

if (errors.length > 0) {
  console.error('Image registry check failed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`Image registry OK: ${Object.keys(lock).length} registered ids, ${shipped.size} shipped now, ${Object.keys(aliases).length} alias(es).`);
