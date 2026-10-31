#!/usr/bin/env node
/**
 * Checks for .github/workflows/image-set-update.yml, the workflow that opens a pull request
 * when an official image set publishes a new version on npm.
 *
 * The package name and version come from the event payload (repository_dispatch
 * `image-set-published` with {package, version}, or the workflow_dispatch inputs). They are
 * untrusted, so the workflow passes them only through the environment, never as arguments:
 *
 *   PACKAGE=image-overwatch VERSION=1.3.0 node scripts/image-set-update.mjs validate
 *     PACKAGE must be an official image set: an entry of imageset.custom.json at HEAD without
 *     "legacy". VERSION must be a plain x.y.z version (no "v", no pre-release, no "+build"),
 *     and not older than the version in package.json at HEAD (a replayed event never
 *     downgrades). Writes package=, version= and same= (true when package.json already has
 *     that version: nothing to do) to $GITHUB_OUTPUT when that is set.
 *
 *   PACKAGE=... VERSION=... node scripts/image-set-update.mjs gate --registry <file> [--body <file>]
 *     Compares the staged changes (the git index) with HEAD and fails unless they are exactly
 *     an update of that package to that version. --registry is the answer of
 *     `npm view <PACKAGE>@<VERSION> dist.integrity scripts bin dependencies gypfile --json`:
 *     registry data, fetched without running the package's code (parseRegistry checks it).
 *     - package.json: only dependencies.<PACKAGE>, raised to VERSION;
 *     - package-lock.json: the root's dependency on PACKAGE and the node_modules/<PACKAGE>
 *       entry: only the keys version, resolved, integrity, license, engines, dependencies,
 *       funding; the registry tarball of exactly that version; the registry's integrity and
 *       dependencies; and the published version has no install script, gypfile or bin. Other
 *       entries may only disappear (dependencies nothing needs any more) or change their
 *       dev/optional flags (npm recomputes them when such a dependency leaves; listed in the
 *       pull request), except the app's direct dependencies, which keep theirs;
 *     - imageset.config.json: only the entry of PACKAGE; the other sets stay identical. The
 *       entry has exactly the keys buildPackageEntry writes; displayName, googleFont and
 *       backgroundImage equal what imageset.custom.json at HEAD gives (displayFields); no
 *       duplicate filename, no new filename that differs from another only in letter case,
 *       at most 2,000 new images; only known shapes, never "square" (the default is not
 *       stored); tag names of letters, digits, "_" and "-" (not all, __proto__, constructor or
 *       prototype, in any letter case), each with its own non-empty URL form (tagSlug) other
 *       than "all"; labels (at most 100 characters) and tag texts (at most 200) without control
 *       or invisible formatting characters and without leading or trailing spaces;
 *     - image-registry.lock.json: only new ids of images that PACKAGE adds (append-only);
 *     - image-aliases.json: only new aliases from an id that this update removes to an id that
 *       this update adds (A32: an alias target must be a new id added in the same change);
 *     - nothing else: no other path (no file in public/images/: official sets are copied at
 *       build time and never committed), no deletion, no symbolic link, no executable file.
 *     Then it runs HEAD's scripts/check-image-registry.mjs on the staged registry files, and
 *     writes the pull request text to --body: added ids with their labels, changed labels,
 *     items that changed categories, new, removed or changed categories, new aliases and
 *     install flag changes. Text that a code span cannot show faithfully (other scripts,
 *     look-alike letters, backticks, space runs) is followed by its exact escaped form.
 *
 * The workflow's second job applies the patch with `git apply --cached`, so the working tree
 * keeps HEAD's files and this script (from HEAD) is the code that runs. It uses only Node
 * built-in modules and scripts/lib/image-sets.mjs. Exit code 1: refused.
 */
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {
  DEFAULT_SHAPE,
  displayFields,
  ENTRY_KEYS,
  IMAGE_KEYS,
  isShape,
  officialPackages,
  PACKAGE_NAME,
  SHAPES,
  TAG_KEYS,
  tagSlug,
} from './lib/image-sets.mjs';

/** x.y.z without leading zeros, each part at most 9 digits. */
export const VERSION_PATTERN = /^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$/;
const MAX_PACKAGE_LENGTH = 64;
/** Filenames of new images: folders and names of letters, digits, ".", "_" and "-". */
const NEW_FILENAME = /^(?:[A-Za-z0-9_][A-Za-z0-9._-]*\/)*[A-Za-z0-9_][A-Za-z0-9._-]*\.webp$/;
const ALLOWED_FILES = new Set(['package.json', 'package-lock.json', 'imageset.config.json', 'image-registry.lock.json', 'image-aliases.json']);
const LIST_LIMIT = 100;
const MAX_NEW_IMAGES = 2000;
const MAX_LABEL = 100;
const MAX_TAG_TEXT = 200;
/** Tag (category) names appear in /rank/<set>/<tag> URLs and as object keys. */
export const TAG_NAME = /^[A-Za-z0-9_-]{1,64}$/;
const RESERVED_TAGS = new Set(['all', '__proto__', 'constructor', 'prototype']);
/** Unicode control (Cc) and format (Cf) characters: bidi controls, zero-width characters... */
const HIDDEN_CHARACTERS = /[\p{Cc}\p{Cf}]/u;
const SHA512 = /^sha512-[A-Za-z0-9+/]{86}==$/;
/** Keys the lockfile entry of an image set may have. */
const LOCK_ENTRY_KEYS = ['version', 'resolved', 'integrity', 'license', 'engines', 'dependencies', 'funding'];
/** npm runs these scripts of a dependency on install. */
const INSTALL_SCRIPTS = ['preinstall', 'install', 'postinstall'];
/** The fields the workflow asks `npm view` for, and the largest answer it accepts. */
export const REGISTRY_FIELDS = ['dist.integrity', 'scripts', 'bin', 'dependencies', 'gypfile'];
const MAX_REGISTRY_BYTES = 256 * 1024;

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const has = (object, key) => object !== null && typeof object === 'object' && Object.prototype.hasOwnProperty.call(object, key);
const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const isText = (value) => typeof value === 'string' && value !== '';
const unknownKeys = (object, allowed) => Object.keys(object).filter((key) => !allowed.includes(key));

/** A short, single-line, quoted form of untrusted text for messages and logs. */
function quote(value) {
  const text = String(value);
  return JSON.stringify(text.length > 64 ? `${text.slice(0, 64)}...` : text);
}

/**
 * An exact, ASCII-only form of untrusted text: JSON with every character outside printable
 * ASCII, every backtick and every space next to another space written as \uXXXX.
 */
export function escapedText(value) {
  return JSON.stringify(String(value))
    .replace(/[^\x20-\x7e]|`/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)
    .replace(/ {2,}/g, (spaces) => '\\u0020'.repeat(spaces.length));
}

const isStringMap = (value) => isPlainObject(value) && Object.values(value).every((item) => typeof item === 'string');

/**
 * Reads the answer of `npm view <package>@<version> dist.integrity scripts bin dependencies
 * gypfile --json`: registry data about the published version, fetched without running any of
 * its code. Returns {integrity, scripts, bin, dependencies, gypfile}, or throws.
 */
export function parseRegistry(text) {
  if (typeof text !== 'string' || text.trim() === '') throw new Error('npm view gave no answer.');
  if (Buffer.byteLength(text) > MAX_REGISTRY_BYTES) throw new Error(`The npm view answer is larger than ${MAX_REGISTRY_BYTES} bytes.`);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('The npm view answer is not JSON.');
  }
  // When only one of the fields exists, npm view prints its bare value.
  if (typeof data === 'string') data = {'dist.integrity': data};
  if (!isPlainObject(data)) throw new Error('The npm view answer is not an object.');
  const extra = unknownKeys(data, REGISTRY_FIELDS);
  if (extra.length > 0) throw new Error(`The npm view answer has unexpected fields ${extra.map(quote).join(', ')}.`);
  const integrity = data['dist.integrity'];
  if (typeof integrity !== 'string' || !SHA512.test(integrity)) throw new Error('The npm view answer has no sha512 dist.integrity.');
  if (data.scripts !== undefined && !isStringMap(data.scripts)) throw new Error('The npm view answer has malformed scripts.');
  if (data.dependencies !== undefined && !isStringMap(data.dependencies)) throw new Error('The npm view answer has malformed dependencies.');
  if (data.bin !== undefined && typeof data.bin !== 'string' && !isStringMap(data.bin)) throw new Error('The npm view answer has a malformed bin.');
  if (data.gypfile !== undefined && typeof data.gypfile !== 'boolean') throw new Error('The npm view answer has a malformed gypfile.');
  return {integrity, scripts: data.scripts ?? {}, bin: data.bin, dependencies: data.dependencies ?? {}, gypfile: data.gypfile === true};
}

/** Compares two x.y.z versions: negative, zero or positive. */
export function compareVersions(a, b) {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  for (let index = 0; index < 3; index++) {
    if (partsA[index] !== partsB[index]) return partsA[index] - partsB[index];
  }
  return 0;
}

/**
 * Checks the package name and version of an update request against the official sets and the
 * version in package.json (`current`, when installed). Returns the values and whether the
 * version is the installed one, or throws with the reason.
 */
export function validateInput(packageName, version, customConfig, current) {
  if (typeof packageName !== 'string' || packageName === '') throw new Error('No package name was given.');
  if (packageName.length > MAX_PACKAGE_LENGTH || !PACKAGE_NAME.test(packageName)) {
    throw new Error(`The package name ${quote(packageName)} is not an image set name (image-<lowercase letters, digits, dashes>).`);
  }
  const official = officialPackages(customConfig);
  if (!official.includes(packageName)) {
    throw new Error(`${packageName} is not an official image set. Official sets: ${official.join(', ') || 'none'} (imageset.custom.json).`);
  }
  if (typeof version !== 'string' || version === '') throw new Error('No version was given.');
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`The version ${quote(version)} is not a plain x.y.z version (no "v", pre-release or "+build" suffix).`);
  }
  if (typeof current === 'string' && VERSION_PATTERN.test(current) && compareVersions(version, current) < 0) {
    throw new Error(`${packageName} ${version} is older than ${current} in package.json. The workflow never downgrades.`);
  }
  return {packageName, version, same: current === version};
}

function git(args, options = {}) {
  return execFileSync('git', args, {encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...options});
}

function readJsonAtHead(file) {
  try {
    return JSON.parse(git(['show', `HEAD:${file}`]));
  } catch (error) {
    throw new Error(`Cannot read ${file} at HEAD: ${error.message.split('\n')[0]}`);
  }
}

/** Parses `git diff --cached --raw -z --no-renames HEAD`. */
export function parseRaw(raw) {
  const parts = raw.split('\0').filter((part) => part !== '');
  const changes = [];
  for (let index = 0; index + 1 < parts.length; index += 2) {
    const meta = parts[index].replace(/^:/, '').split(' ');
    changes.push({oldMode: meta[0], newMode: meta[1], status: meta[4], path: parts[index + 1]});
  }
  return changes;
}

const labelOf = (image) => image.label || image.filename.split('.')[0];

function packageImages(config, packageName) {
  const entry = config?.packages?.[packageName];
  const images = new Map();
  for (const image of Array.isArray(entry?.images) ? entry.images : []) {
    if (isPlainObject(image) && typeof image.filename === 'string') images.set(`${packageName}-${image.filename}`, image);
  }
  return images;
}

function checkPackageJson(before, after, packageName, version, errors) {
  const strip = (value) => {
    const copy = clone(value);
    if (isPlainObject(copy?.dependencies)) delete copy.dependencies[packageName];
    return copy;
  };
  if (!isDeepStrictEqual(strip(before), strip(after))) {
    errors.push(`package.json: only dependencies.${packageName} may change.`);
  }
  if (after?.dependencies?.[packageName] !== version) {
    errors.push(`package.json: dependencies.${packageName} must be exactly ${version}.`);
  }
  const current = before?.dependencies?.[packageName];
  if (current === version) errors.push(`package.json: ${packageName} is already ${version}.`);
  else if (typeof current === 'string' && VERSION_PATTERN.test(current) && compareVersions(version, current) < 0) {
    errors.push(`package.json: ${version} is older than ${current}.`);
  }
}

/** npm recomputes these flags when a dependency leaves the tree. They only decide what `npm ci --omit` skips. */
const INSTALL_FLAGS = ['dev', 'optional', 'devOptional', 'peer'];
function withoutFlags(entry) {
  const copy = clone(entry);
  if (isPlainObject(copy)) for (const flag of INSTALL_FLAGS) delete copy[flag];
  return copy;
}

const flagsOf = (entry) => INSTALL_FLAGS.filter((flag) => isPlainObject(entry) && entry[flag] === true);

/**
 * Checks package-lock.json. The lockfile entry of the package was written in job 1, where the
 * package's code ran, so it is compared with `published`, the registry's data (parseRegistry).
 * Returns the removed entries and the entries whose install flags changed.
 */
function checkPackageLock(before, after, packageName, version, published, errors) {
  const withoutPackages = (value) => {
    const copy = clone(value) ?? {};
    delete copy.packages;
    return copy;
  };
  if (!isDeepStrictEqual(withoutPackages(before), withoutPackages(after))) {
    errors.push('package-lock.json: only "packages" may change.');
  }
  const beforePackages = isPlainObject(before?.packages) ? before.packages : {};
  const afterPackages = isPlainObject(after?.packages) ? after.packages : {};

  const rootWithout = (root) => {
    const copy = clone(root) ?? {};
    if (isPlainObject(copy.dependencies)) delete copy.dependencies[packageName];
    return copy;
  };
  if (!isDeepStrictEqual(rootWithout(beforePackages['']), rootWithout(afterPackages['']))) {
    errors.push(`package-lock.json: the root entry may only change its dependency on ${packageName}.`);
  }
  if (afterPackages['']?.dependencies?.[packageName] !== version) {
    errors.push(`package-lock.json: the root entry must depend on ${packageName} ${version} exactly.`);
  }

  const key = `node_modules/${packageName}`;
  const entry = afterPackages[key];
  if (!isPlainObject(entry)) {
    errors.push(`package-lock.json: ${key} is missing.`);
  } else {
    const tarball = `https://registry.npmjs.org/${packageName}/-/${packageName}-${version}.tgz`;
    // Exact keys: no hasInstallScript, bin, os, cpu, link or dev/optional flags on the package.
    const extra = unknownKeys(entry, LOCK_ENTRY_KEYS);
    if (extra.length > 0) {
      errors.push(`package-lock.json: ${key} has keys an image set must not have: ${extra.map(quote).join(', ')} (allowed: ${LOCK_ENTRY_KEYS.join(', ')}).`);
    }
    if (entry.version !== version) errors.push(`package-lock.json: ${key} must be version ${version}.`);
    if (entry.resolved !== tarball) errors.push(`package-lock.json: ${key} must come from ${tarball}.`);
    if (typeof entry.integrity !== 'string' || !SHA512.test(entry.integrity)) {
      errors.push(`package-lock.json: ${key} needs a sha512 integrity.`);
    }
    if (entry.license !== undefined && !isText(entry.license)) errors.push(`package-lock.json: ${key} has a malformed license.`);
    if (entry.engines !== undefined && !isStringMap(entry.engines)) errors.push(`package-lock.json: ${key} has malformed engines.`);
    if (entry.dependencies !== undefined && !isStringMap(entry.dependencies)) errors.push(`package-lock.json: ${key} has malformed dependencies.`);

    // The registry's data about the published version, not job 1's word for it.
    if (!published) {
      errors.push('No registry data about the published version (npm view, --registry).');
    } else {
      if (entry.integrity !== published.integrity) {
        errors.push(`package-lock.json: ${key} has another integrity than the registry gives for ${packageName}@${version} (npm view dist.integrity).`);
      }
      for (const script of INSTALL_SCRIPTS) {
        if (has(published.scripts, script)) errors.push(`The published ${packageName}@${version} has a "${script}" script. An image set must not run code on install.`);
      }
      if (published.gypfile) errors.push(`The published ${packageName}@${version} has a gypfile (npm would build native code on install).`);
      if (published.bin !== undefined && (typeof published.bin === 'string' ? published.bin !== '' : Object.keys(published.bin).length > 0)) {
        errors.push(`The published ${packageName}@${version} has a bin. An image set must not install commands.`);
      }
      if (!isDeepStrictEqual(entry.dependencies ?? {}, published.dependencies)) {
        errors.push(`package-lock.json: the dependencies of ${key} differ from the ones the registry gives for ${packageName}@${version}.`);
      }
    }
  }

  const root = beforePackages[''] ?? {};
  const direct = new Set(Object.keys({...root.dependencies, ...root.devDependencies, ...root.optionalDependencies, ...root.peerDependencies}));
  const isDirect = (name) => direct.has(name.replace(/^node_modules\//, ''));
  const removed = [];
  const flagChanges = [];
  for (const name of new Set([...Object.keys(beforePackages), ...Object.keys(afterPackages)])) {
    if (name === '' || name === key) continue;
    if (!has(afterPackages, name)) {
      if (isDirect(name)) errors.push(`package-lock.json: removes ${name}, a direct dependency.`);
      else removed.push(name);
    } else if (!has(beforePackages, name)) {
      errors.push(`package-lock.json: adds ${name}. An image set update may not bring other packages.`);
    } else if (!isDeepStrictEqual(withoutFlags(beforePackages[name]), withoutFlags(afterPackages[name]))) {
      errors.push(`package-lock.json: changes ${name}. An image set update may not change other packages.`);
    } else if (!isDeepStrictEqual(beforePackages[name], afterPackages[name])) {
      // Only the install flags changed. npm recomputes them for packages that only the removed
      // dependencies shared; a direct dependency of the app keeps its flags.
      if (isDirect(name)) errors.push(`package-lock.json: changes the dev/optional flags of ${name}, a direct dependency.`);
      else flagChanges.push({name, before: flagsOf(beforePackages[name]), after: flagsOf(afterPackages[name])});
    }
  }
  return {removed, flagChanges};
}

/**
 * Labels and tag texts show in the app and in the pull request. They must be visible text: no
 * control or format characters (bidi controls, zero-width characters), no leading or trailing
 * space, and at most `max` characters. Accents and other scripts are fine.
 */
function checkText(where, value, max, errors) {
  if (!isText(value)) {
    errors.push(`${where} must be a non-empty string.`);
    return;
  }
  if (HIDDEN_CHARACTERS.test(value)) errors.push(`${where} has a control or invisible formatting character: ${escapedText(value)}.`);
  if (/^\s|\s$/u.test(value)) errors.push(`${where} starts or ends with a space: ${escapedText(value)}.`);
  if ([...value].length > max) errors.push(`${where} is longer than ${max} characters.`);
}

function checkShape(where, shape, errors) {
  if (shape === undefined) return;
  if (!isShape(shape)) errors.push(`${where}: unknown shape ${quote(shape)} (allowed: ${SHAPES.join(', ')}).`);
  else if (shape === DEFAULT_SHAPE) errors.push(`${where}: shape "${DEFAULT_SHAPE}" is the default and is never stored.`);
}

/**
 * Checks the staged imageset.config.json entry of the updated set against what
 * scripts/prepareImages.js (buildPackageEntry) writes. `custom` is the set's entry in
 * imageset.custom.json at HEAD.
 */
export function checkPackageEntry(packageName, entry, custom, errors) {
  const where = `imageset.config.json: ${packageName}`;
  if (!isPlainObject(entry)) {
    errors.push(`${where} must be an object.`);
    return;
  }
  if (has(entry, 'legacy')) errors.push(`${where} must not be marked legacy.`);
  const extra = unknownKeys(entry, ENTRY_KEYS);
  if (extra.length > 0) errors.push(`${where} has unknown keys ${extra.map(quote).join(', ')} (allowed: ${ENTRY_KEYS.join(', ')}).`);

  // The display name is the URL slug in shared links; the font and the background image load on
  // the landing page. They come from imageset.custom.json at HEAD, never from a package.
  const expected = displayFields(packageName, custom);
  for (const key of ['displayName', 'googleFont', 'backgroundImage']) {
    if (!isDeepStrictEqual(entry[key], expected[key])) {
      const shown = (value) => (value === undefined ? 'nothing' : quote(value));
      errors.push(`${where}: ${key} is ${shown(entry[key])}, but imageset.custom.json at HEAD gives ${shown(expected[key])}.`);
    }
  }

  const tags = isPlainObject(entry.tags) ? entry.tags : {};
  if (!isPlainObject(entry.tags)) errors.push(`${where}: tags must be an object.`);
  // /rank/<set>/<tag> opens the first tag whose URL form (tagSlug) matches, and "all" always
  // opens every item: each tag needs its own, non-empty URL form other than "all".
  const slugs = new Map();
  for (const [name, tag] of Object.entries(tags)) {
    const tagWhere = `${where}: tag ${quote(name)}`;
    if (!TAG_NAME.test(name) || RESERVED_TAGS.has(name.toLowerCase())) {
      errors.push(`${tagWhere}: a tag name is 1 to 64 letters, digits, "_" or "-", and not ${[...RESERVED_TAGS].join(', ')} (in any letter case).`);
    } else {
      const slug = tagSlug(name);
      if (slug === '') errors.push(`${tagWhere}: its URL form is empty, so /rank/<set>/<tag> cannot open it.`);
      else if (slug === 'all') errors.push(`${tagWhere}: its URL form is "all", which always opens every item.`);
      else if (slugs.has(slug)) errors.push(`${tagWhere}: its URL form ${quote(slug)} is the same as tag ${quote(slugs.get(slug))}'s, so /rank/<set>/${slug} opens only one of them.`);
      else slugs.set(slug, name);
    }
    if (!isPlainObject(tag)) {
      errors.push(`${tagWhere} must be an object.`);
      continue;
    }
    const tagExtra = unknownKeys(tag, TAG_KEYS);
    if (tagExtra.length > 0) errors.push(`${tagWhere} has unknown keys ${tagExtra.map(quote).join(', ')} (allowed: ${TAG_KEYS.join(', ')}).`);
    for (const key of ['title', 'description', 'category']) checkText(`${tagWhere}: ${key}`, tag[key], MAX_TAG_TEXT, errors);
    checkShape(tagWhere, tag.shape, errors);
  }

  if (!Array.isArray(entry.images) || entry.images.length === 0) {
    errors.push(`${where} must have images.`);
    return;
  }
  const filenames = new Set();
  const usedTags = new Set();
  entry.images.forEach((image, index) => {
    const imageWhere = `${where}: image ${isPlainObject(image) && isText(image.filename) ? quote(image.filename) : `#${index + 1}`}`;
    if (!isPlainObject(image)) {
      errors.push(`${imageWhere} must be an object.`);
      return;
    }
    const imageExtra = unknownKeys(image, IMAGE_KEYS);
    if (imageExtra.length > 0) errors.push(`${imageWhere} has unknown keys ${imageExtra.map(quote).join(', ')} (allowed: ${IMAGE_KEYS.join(', ')}).`);
    if (!isText(image.filename)) {
      errors.push(`${imageWhere} needs a filename.`);
    } else if (filenames.has(image.filename)) {
      errors.push(`${imageWhere} is listed twice. Each item id must appear once.`);
    } else {
      filenames.add(image.filename);
    }
    checkText(`${imageWhere}: label`, image.label, MAX_LABEL, errors);
    if (!Array.isArray(image.tags) || !image.tags.every(isText)) {
      errors.push(`${imageWhere}: tags must be a list of tag names.`);
    } else {
      for (const tag of image.tags) {
        usedTags.add(tag);
        if (!has(tags, tag)) errors.push(`${imageWhere}: tag ${quote(tag)} is not in the tags of ${packageName}.`);
      }
    }
    checkShape(imageWhere, image.shape, errors);
  });
  for (const name of Object.keys(tags)) {
    if (!usedTags.has(name)) errors.push(`${where}: tag ${quote(name)} has no images.`);
  }
}

function checkConfig(before, after, packageName, custom, errors) {
  if (!isPlainObject(before?.packages) || !isPlainObject(after?.packages)) {
    errors.push('imageset.config.json: must be {"packages": {...}}.');
    return;
  }
  const rest = (value) => {
    const copy = clone(value);
    delete copy.packages;
    return copy;
  };
  if (!isDeepStrictEqual(rest(before), rest(after))) errors.push('imageset.config.json: only "packages" may change.');
  if (!isDeepStrictEqual(Object.keys(before.packages), Object.keys(after.packages))) {
    errors.push('imageset.config.json: the list of image sets and their order must stay the same.');
  }
  for (const name of Object.keys(before.packages)) {
    if (name !== packageName && !isDeepStrictEqual(before.packages[name], after.packages[name])) {
      errors.push(`imageset.config.json: ${name} changed. This update may only change ${packageName}.`);
    }
  }
  checkPackageEntry(packageName, after.packages[packageName], custom, errors);
}

const sortedTags = (image) => (Array.isArray(image?.tags) ? [...image.tags].map(String).sort() : []);

/** Tags (categories) of the set that are new, gone or changed, with the fields that changed. */
function tagChangesOf(before, after) {
  const tagsBefore = isPlainObject(before?.tags) ? before.tags : {};
  const tagsAfter = isPlainObject(after?.tags) ? after.tags : {};
  const changes = [];
  for (const [tag, data] of Object.entries(tagsAfter)) {
    if (!has(tagsBefore, tag)) {
      changes.push({tag, kind: 'added', title: data?.title});
      continue;
    }
    const fields = TAG_KEYS
      .filter((key) => !isDeepStrictEqual(tagsBefore[tag]?.[key], data?.[key]))
      .map((key) => ({key, before: tagsBefore[tag]?.[key], after: data?.[key]}));
    if (fields.length > 0) changes.push({tag, kind: 'changed', fields});
  }
  for (const tag of Object.keys(tagsBefore)) {
    if (!has(tagsAfter, tag)) changes.push({tag, kind: 'removed', title: tagsBefore[tag]?.title});
  }
  return changes;
}

/**
 * Checks staged changes against HEAD. `read(file, side)` returns the text of a file at 'HEAD'
 * or in the 'index' (undefined when missing). `published` is the registry's data about the
 * published version (parseRegistry). Returns {errors, report}.
 */
export function checkUpdate({packageName, version, changes, read, published}) {
  const errors = [];
  const json = (file, side) => {
    const text = read(file, side);
    if (text === undefined) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      errors.push(`${file}: not valid JSON (${side}).`);
      return undefined;
    }
  };
  if (changes.length === 0) errors.push('The patch changes nothing.');

  // Official sets are copied into public/images/ at build time and never committed, so the
  // patch may not hold image files: everything outside ALLOWED_FILES is refused.
  for (const change of changes) {
    const file = change.path;
    if (change.status !== 'A' && change.status !== 'M') {
      errors.push(`${file}: change type ${change.status} is not allowed (only added or modified files).`);
    } else if (change.newMode !== '100644') {
      errors.push(`${file}: mode ${change.newMode} is not allowed (only regular files that are not executable).`);
    } else if (!ALLOWED_FILES.has(file)) {
      errors.push(`${file}: an image set update may not change this file.`);
    } else if (change.status !== 'M' && file !== 'image-aliases.json') {
      errors.push(`${file}: may only be modified, not created.`);
    }
  }

  const changed = new Set(changes.map((change) => change.path));
  const side = (file) => (changed.has(file) ? 'index' : 'HEAD');
  const packageBefore = json('package.json', 'HEAD');
  const packageAfter = json('package.json', side('package.json'));
  const lockBefore = json('package-lock.json', 'HEAD');
  const lockAfter = json('package-lock.json', side('package-lock.json'));
  const configBefore = json('imageset.config.json', 'HEAD');
  const configAfter = json('imageset.config.json', side('imageset.config.json'));
  const registryBefore = json('image-registry.lock.json', 'HEAD') ?? {};
  const registryAfter = json('image-registry.lock.json', side('image-registry.lock.json')) ?? {};
  const aliasesBefore = json('image-aliases.json', 'HEAD') ?? {};
  const aliasesAfter = json('image-aliases.json', side('image-aliases.json')) ?? {};

  const customAtHead = json('imageset.custom.json', 'HEAD');

  checkPackageJson(packageBefore, packageAfter, packageName, version, errors);
  const {removed: removedLockEntries, flagChanges} = checkPackageLock(lockBefore, lockAfter, packageName, version, published, errors);
  checkConfig(configBefore, configAfter, packageName, customAtHead?.packages?.[packageName], errors);

  const imagesBefore = packageImages(configBefore, packageName);
  const imagesAfter = packageImages(configAfter, packageName);
  const added = [...imagesAfter.keys()].filter((id) => !imagesBefore.has(id));
  const removed = [...imagesBefore.keys()].filter((id) => !imagesAfter.has(id));
  const addedIds = new Set(added);
  const removedIds = new Set(removed);
  if (added.length > MAX_NEW_IMAGES) {
    errors.push(`imageset.config.json: this update adds ${added.length} images; at most ${MAX_NEW_IMAGES} new images per update are accepted. Publish them in smaller versions.`);
  }
  const kept = [...imagesAfter.keys()].filter((id) => imagesBefore.has(id));
  const relabelled = kept
    .filter((id) => labelOf(imagesBefore.get(id)) !== labelOf(imagesAfter.get(id)))
    .map((id) => ({id, before: labelOf(imagesBefore.get(id)), after: labelOf(imagesAfter.get(id))}));
  // A new version may move existing items to other categories. That is allowed; the owner sees it.
  const retagged = kept
    .filter((id) => !isDeepStrictEqual(sortedTags(imagesBefore.get(id)), sortedTags(imagesAfter.get(id))))
    .map((id) => ({id, before: sortedTags(imagesBefore.get(id)), after: sortedTags(imagesAfter.get(id))}));
  const tagChanges = tagChangesOf(configBefore?.packages?.[packageName], configAfter?.packages?.[packageName]);
  // Filenames that differ only in letter case clash on case-insensitive file systems.
  const byLowerCase = new Map();
  for (const image of imagesAfter.values()) {
    const lower = image.filename.toLowerCase();
    byLowerCase.set(lower, [...(byLowerCase.get(lower) ?? []), image.filename]);
  }
  for (const id of added) {
    const {filename} = imagesAfter.get(id);
    if (!NEW_FILENAME.test(filename)) {
      errors.push(`imageset.config.json: new image ${quote(filename)} needs a plain .webp filename (letters, digits, ".", "_", "-", "/").`);
    }
    const clashes = byLowerCase.get(filename.toLowerCase()).filter((other) => other !== filename);
    if (clashes.length > 0) {
      errors.push(`imageset.config.json: new image ${quote(filename)} differs only in letter case from ${clashes.map(quote).join(', ')}.`);
    }
  }

  // image-registry.lock.json is append-only, and only ids that this update adds may appear.
  for (const id of Object.keys(registryBefore)) {
    if (!has(registryAfter, id)) errors.push(`image-registry.lock.json: ${id} was removed. Item ids are permanent.`);
    else if (!isDeepStrictEqual(registryBefore[id], registryAfter[id])) errors.push(`image-registry.lock.json: ${id} was changed.`);
  }
  for (const id of Object.keys(registryAfter)) {
    if (!has(registryBefore, id) && !addedIds.has(id)) errors.push(`image-registry.lock.json: ${id} was registered, but this update does not add it.`);
  }

  // image-aliases.json is append-only. A32: a new alias goes from an id this update removes to
  // an id this update adds, so two ids that shipped together are never merged.
  const newAliases = [];
  for (const id of Object.keys(aliasesBefore)) {
    if (!has(aliasesAfter, id) || aliasesAfter[id] !== aliasesBefore[id]) errors.push(`image-aliases.json: the alias of ${id} was removed or changed.`);
  }
  for (const [id, target] of Object.entries(aliasesAfter)) {
    if (has(aliasesBefore, id)) continue;
    newAliases.push({id, target});
    if (!removedIds.has(id)) errors.push(`image-aliases.json: ${id} gets an alias, but this update does not remove it.`);
    if (!addedIds.has(target)) errors.push(`image-aliases.json: ${id} points to ${quote(target)}, which this update does not add. An alias target must be a new id added in the same change.`);
  }

  const entry = configAfter?.packages?.[packageName];
  const shapes = [
    ...[...imagesAfter.values()].filter((image) => image.shape !== undefined && image.shape !== DEFAULT_SHAPE).map((image) => `${packageName}-${image.filename}: ${image.shape}`),
    ...Object.entries(isPlainObject(entry?.tags) ? entry.tags : {}).filter(([, tag]) => tag?.shape !== undefined && tag.shape !== DEFAULT_SHAPE).map(([tag, data]) => `tag ${tag}: ${data.shape}`),
  ];

  const addedItems = added.map((id) => ({id, label: labelOf(imagesAfter.get(id))}));
  return {errors, report: {packageName, version, added: addedItems, removed, relabelled, retagged, tagChanges, newAliases, shapes, removedLockEntries, flagChanges}};
}

/** Runs HEAD's check-image-registry.mjs on the staged registry files, in a temporary folder. */
function checkRegistry(read) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otb-image-set-update-'));
  try {
    for (const file of ['imageset.config.json', 'image-registry.lock.json', 'image-aliases.json']) {
      const text = read(file);
      if (text !== undefined) fs.writeFileSync(path.join(dir, file), text);
    }
    const result = spawnSync(process.execPath, [path.join(scriptsDir, 'check-image-registry.mjs'), '--root', dir], {encoding: 'utf8'});
    return {ok: result.status === 0, output: `${result.stdout}${result.stderr}`.trim()};
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

/** A code span for untrusted text in the pull request: one line, no backticks, short. */
function code(text) {
  const clean = String(text).replace(/[`\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim();
  return `\`${clean.length > 100 ? `${clean.slice(0, 100)}...` : clean}\``;
}

function list(items, format) {
  if (items.length === 0) return '- none\n';
  const shown = items.slice(0, LIST_LIMIT).map((item) => `- ${format(item)}`);
  if (items.length > LIST_LIMIT) shown.push(`- ... and ${items.length - LIST_LIMIT} more`);
  return `${shown.join('\n')}\n`;
}

const shownValue = (value) => (value === undefined ? 'none' : code(value));
const names = (items) => (items.length === 0 ? 'none' : items.map(code).join(', '));

/**
 * The longest exact form of a text the gate accepts: at most 12 characters per character (an
 * emoji is \ud83d\ude00), plus the quotes. Longer texts (from before the gate) are cut.
 */
const MAX_EXACT = 12 * Math.max(MAX_LABEL, MAX_TAG_TEXT) + 2;
const isCut = (value) => value !== undefined && escapedText(value).length > MAX_EXACT;

/** The exact, ASCII-only form of untrusted text in a code span (escapedText). */
function exactCode(value) {
  if (value === undefined) return 'none';
  const exact = escapedText(value);
  return `\`${exact.length > MAX_EXACT ? `${exact.slice(0, MAX_EXACT)}...` : exact}\``;
}

/** The position (1-based, in characters) of the first difference between two texts. */
function firstDifference(before, after) {
  const a = [...String(before ?? '')];
  const b = [...String(after ?? '')];
  let index = 0;
  while (index < a.length && index < b.length && a[index] === b[index]) index++;
  return index + 1;
}

/** True when a code span would not show the text faithfully: other than printable ASCII (look-alike letters), backticks, or runs of spaces. */
const needsExact = (value) => typeof value === 'string' && /[^\x20-\x7e]|`| {2,}|^ | $/.test(value);

/** One untrusted text, with its exact form when the code span is not faithful. */
const shownText = (value) => (needsExact(value) ? `${code(value)} (exact: ${exactCode(value)})` : shownValue(value));

/**
 * A change from `before` to `after`. When both look the same in code spans, or either is not
 * plain ASCII (a Cyrillic "а" looks like a Latin "a"), the exact forms follow, so the owner sees
 * what changed.
 */
function shownChange(before, after) {
  const plain = `${shownValue(before)} → ${shownValue(after)}`;
  if (shownValue(before) !== shownValue(after) && !needsExact(before) && !needsExact(after)) return plain;
  const where = (isCut(before) || isCut(after)) && before !== after ? `; first difference at character ${firstDifference(before, after)}` : '';
  return `${plain} (exact: ${exactCode(before)} → ${exactCode(after)}${where})`;
}

function formatTagChange(change) {
  if (change.kind === 'added') return `${code(change.tag)}: new, ${shownText(change.title)}`;
  if (change.kind === 'removed') return `${code(change.tag)}: removed (was ${shownText(change.title)})`;
  return `${code(change.tag)}: ${change.fields.map(({key, before, after}) => `${key} ${shownChange(before, after)}`).join('; ')}`;
}

function formatAdded(item) {
  const {id, label} = typeof item === 'string' ? {id: item} : item;
  return label === undefined ? code(id) : `${code(id)}: ${shownText(label)}`;
}

export function pullRequestBody(report) {
  const {packageName, version, added, removed, relabelled, retagged = [], tagChanges = [], newAliases, shapes, removedLockEntries, flagChanges = []} = report;
  let body = `Updates the official image set \`${packageName}\` to \`${version}\`, published on npm.\n\n`;
  body += 'Prepared by the image-set-update workflow. Nothing merges on its own: review the lists below, then merge or close.\n\n';
  body += `### Added item ids (${added.length})\n\n${list(added, formatAdded)}\n`;
  body += `### Changed labels (${relabelled.length})\n\nOld links show the new label for these items.\n\n`;
  body += `${list(relabelled, ({id, before, after}) => `${code(id)}: ${shownChange(before, after)}`)}\n`;
  body += `### Items that changed categories (${retagged.length})\n\nThey keep their ids; templates list them under their new categories.\n\n`;
  body += `${list(retagged, ({id, before, after}) => `${code(id)}: ${names(before)} → ${names(after)}`)}\n`;
  body += `### New, removed or changed categories (${tagChanges.length})\n\n${list(tagChanges, formatTagChange)}\n`;
  body += `### New aliases (${newAliases.length})\n\n${list(newAliases, ({id, target}) => `${code(id)} → ${code(target)}`)}\n`;
  if (removed.length > 0) {
    body += `### Removed item ids (${removed.length})\n\nEach one has an alias above, so old links show its new id.\n\n${list(removed, code)}\n`;
  }
  if (shapes.length > 0) {
    body += `### Shapes other than square (${shapes.length})\n\n`;
    body += '**Do not merge before the drag and drop update (revamp Phase 5e).** Until then, tiles show these images letterboxed and link previews crop them. The unit tests fail on purpose while such shapes are in imageset.config.json.\n\n';
    body += `${list(shapes, code)}\n`;
  }
  if (removedLockEntries.length > 0) {
    body += `### Packages removed from package-lock.json (${removedLockEntries.length})\n\nNothing depends on them any more.\n\n${list(removedLockEntries, code)}\n`;
  }
  if (flagChanges.length > 0) {
    body += `### Install flags changed in package-lock.json (${flagChanges.length})\n\n`;
    body += 'npm recomputed these flags after a dependency left. They only decide what `npm ci --omit` skips; direct dependencies of the app keep theirs.\n\n';
    body += `${list(flagChanges, ({name, before, after}) => `${code(name)}: ${names(before)} → ${names(after)}`)}\n`;
  }
  body += '### Checks\n\n';
  body += `- The first job installed \`${packageName}@${version}\` with \`--ignore-scripts\`, prepared the images, registered new ids (\`check:images -- --update\`), and ran \`npm run check\`, the build and the Playwright tests (Chromium and API).\n`;
  body += '- The second job checked the patch with `scripts/image-set-update.mjs` from the base branch: only this package, its lockfile entry, its config entry, new ids and aliases to new ids may change. The display name, font and background image come from `imageset.custom.json` and did not change.\n';
  body += '- CI runs again on this pull request.\n';
  return body;
}

function readRegistry(registryFile) {
  if (!registryFile) throw new Error('Pass the npm view answer with --registry <file>.');
  // One open file: the size check and the read see the same file, even if the path changes.
  const fd = fs.openSync(registryFile, 'r');
  try {
    if (fs.fstatSync(fd).size > MAX_REGISTRY_BYTES) throw new Error(`The npm view answer is larger than ${MAX_REGISTRY_BYTES} bytes.`);
    return parseRegistry(fs.readFileSync(fd, 'utf8'));
  } finally {
    fs.closeSync(fd);
  }
}

function gate(packageName, version, bodyFile, registryFile) {
  let published;
  try {
    published = readRegistry(registryFile);
  } catch (error) {
    console.error(`refused: ${error.message}`);
    process.exit(1);
  }
  const changes = parseRaw(git(['diff', '--cached', '--raw', '-z', '--no-renames', 'HEAD']));
  const read = (file, side = 'index') => {
    try {
      return git(['show', side === 'HEAD' ? `HEAD:${file}` : `:${file}`]);
    } catch {
      return undefined;
    }
  };
  const {errors, report} = checkUpdate({packageName, version, changes, read, published});
  if (errors.length === 0) {
    const registry = checkRegistry(read);
    if (!registry.ok) errors.push(`check-image-registry.mjs refused the staged files:\n${registry.output}`);
  }
  if (errors.length > 0) {
    for (const error of errors) console.error(`refused: ${error}`);
    console.error(`The update of ${packageName} to ${version} was refused (${errors.length} problem(s)).`);
    process.exit(1);
  }
  const body = pullRequestBody(report);
  if (bodyFile) fs.writeFileSync(bodyFile, body);
  console.log(body);
  console.log(`The patch updates ${packageName} to ${version} and changes nothing else.`);
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command !== 'validate' && command !== 'gate') {
    console.error('Usage: PACKAGE=<image-set> VERSION=<x.y.z> node scripts/image-set-update.mjs validate | gate --registry <file> [--body <file>]');
    process.exit(2);
  }
  let input;
  try {
    const customConfig = readJsonAtHead('imageset.custom.json');
    // The name is checked before it is used as a key.
    validateInput(process.env.PACKAGE, process.env.VERSION, customConfig);
    const current = readJsonAtHead('package.json').dependencies?.[process.env.PACKAGE];
    input = validateInput(process.env.PACKAGE, process.env.VERSION, customConfig, current);
  } catch (error) {
    console.error(`refused: ${error.message}`);
    process.exit(1);
  }
  if (command === 'validate') {
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `package=${input.packageName}\nversion=${input.version}\nsame=${input.same}\n`);
    }
    console.log(input.same
      ? `${input.packageName} is already ${input.version} in package.json. Nothing to update.`
      : `Update request: ${input.packageName} ${input.version}`);
    return;
  }
  const option = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined);
  gate(input.packageName, input.version, option('--body'), option('--registry'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
