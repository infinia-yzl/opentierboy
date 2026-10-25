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
 * An alias target must be a new id, added in the same change that removes the old id. Never
 * point an alias at an id that already shipped: merging two ids that shipped together would
 * show the merged image twice, with duplicate drag ids, in an old list holding both. This
 * script sees only the current files, so it cannot tell when an id shipped;
 * scripts/image-set-update.mjs enforces the rule for automated image set updates, and reviews
 * enforce it for hand-made changes.
 *
 * The check fails when:
 *   - an image in imageset.config.json is not registered yet (run with --update),
 *   - a registered id is no longer shipped and has no alias to a shipped id,
 *   - an alias is broken: its old id was never registered or is still shipped, it loops, or it
 *     does not end at a shipped id,
 *   - two old ids lead to the same shipped id without one being renamed into the other,
 *   - with --files: the image of a shipped id, or the PNG copy of a WebP image that link
 *     previews load, is missing in public/images/<package>/. The `prebuild` script passes it
 *     after prepareImages, so a lost file stops the build. `npm run check` does not: the
 *     official sets are only copied into public/images/ at build time.
 *
 * Usage:
 *   npm run check:images                 check only
 *   npm run check:images -- --update     also register new ids (appends; never removes)
 *   npm run check:images -- --files      also check the image files in public/images/
 *   node scripts/check-image-registry.mjs --root <dir>   check another checkout (for tests)
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const MAX_ALIAS_STEPS = 10;

const args = process.argv.slice(2);
const update = args.includes('--update');
const checkFiles = args.includes('--files');
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
      if (shipped.has(next)) return {target: next, chain: [...seen, next]};
      seen.push(next);
      current = next;
    }
    return {error: `takes more than ${MAX_ALIAS_STEPS} steps`};
  };

  const resolved = [];
  for (const oldId of Object.keys(aliases)) {
    if (!has(lock, oldId)) errors.push(`Alias ${oldId} is not a registered id. Aliases only rename ids that shipped.`);
    if (shipped.has(oldId)) errors.push(`Alias ${oldId} is still shipped, so the alias would never be used. Remove the image or the alias.`);
    const {error, target, chain} = resolveAlias(oldId);
    if (error) errors.push(`Alias ${oldId} ${error}.`);
    else resolved.push({oldId, target, chain});
  }

  // Two old ids may lead to the same image only when one was renamed into the other
  // (a chain such as v1 -> v2 -> v3). Otherwise a list holding both old ids would show the
  // same item twice, with the same id (duplicate drag ids).
  for (let first = 0; first < resolved.length; first++) {
    for (let second = first + 1; second < resolved.length; second++) {
      const a = resolved[first];
      const b = resolved[second];
      if (a.target !== b.target || a.chain.includes(b.oldId) || b.chain.includes(a.oldId)) continue;
      errors.push(`Aliases ${a.oldId} and ${b.oldId} both lead to ${a.target}. A list holding both would show the same item twice. Give each old id its own new id.`);
    }
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

  // Every shipped image, and the PNG copy of every WebP image (link previews load PNG files).
  if (checkFiles) {
    const imagesDir = path.join(root, 'public', 'images');
    const missing = [];
    shipped.forEach((entry) => {
      const files = [entry.filename];
      if (/\.webp$/i.test(entry.filename)) files.push(entry.filename.replace(/\.webp$/i, '.png'));
      for (const file of files) {
        if (!fs.existsSync(path.join(imagesDir, entry.package, file))) missing.push(`${entry.package}/${file}`);
      }
    });
    if (missing.length > 0) {
      const shown = missing.slice(0, 10).join(', ') + (missing.length > 10 ? ', ...' : '');
      errors.push(`${missing.length} image file(s) of shipped item ids are missing in public/images/: ${shown}. Run prepareImages, or restore committed legacy images with git.`);
    } else {
      console.log(`Image files OK: every shipped image (and the PNG copy of each WebP image) is in public/images/.`);
    }
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
