#!/usr/bin/env node
/**
 * Fails when an existing entry of an append-only file changed or disappeared, compared with a
 * base git ref. Adding entries is allowed.
 *
 * Append-only files (they are contracts: links that are out in the world depend on them):
 *   tests/fixtures/**\/*.json   golden links. JSON arrays: existing entries keep their position
 *                               and content, new entries go at the end.
 *   image-registry.lock.json    every item id ever shipped. JSON object: existing keys keep
 *                               their value, new keys may be added.
 *   image-aliases.json          renamed item ids. Same rule as the registry.
 * Formatting and key order inside an entry do not matter; the JSON values are compared.
 *
 * Usage:
 *   npm run check:fixtures                          compare with the default base
 *   npm run check:fixtures -- --base origin/main    compare with the given ref
 *
 * The comparison point is the merge base of the base ref and HEAD, so a branch that is behind
 * its base does not fail. The current files are read from the working tree, so uncommitted
 * edits count. Default base: $FIXTURES_BASE_REF, else the first ref that exists of
 * test/playwright-pom, origin/main, main.
 *
 * In CI (.github/workflows/ci.yml): check out with `fetch-depth: 0` and set FIXTURES_BASE_REF
 * through `env:` to `origin/<base branch>` on pull requests and to the previous commit on pushes.
 *
 * Exit codes: 0 ok, 1 an entry changed or disappeared, 2 the base could not be read.
 */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';

const APPEND_ONLY_PATHS = ['tests/fixtures', 'image-registry.lock.json', 'image-aliases.json'];
const DEFAULT_BASES = ['test/playwright-pom', 'origin/main', 'main'];

function fail(message, code) {
  console.error(message);
  process.exit(code);
}

function git(args, options = {}) {
  return execFileSync('git', args, {encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...options});
}

function refExists(ref) {
  try {
    git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

/** The base ref, and where it came from (for error messages). */
function parseArgs(argv) {
  const baseIndex = argv.indexOf('--base');
  if (baseIndex !== -1) {
    const base = argv[baseIndex + 1];
    if (!base || base.startsWith('--')) fail('Pass a git ref after --base, for example --base origin/main.', 2);
    return {base, source: '--base'};
  }
  if (process.env.FIXTURES_BASE_REF) return {base: process.env.FIXTURES_BASE_REF, source: 'FIXTURES_BASE_REF'};
  const found = DEFAULT_BASES.find(refExists);
  if (!found) fail(`None of ${DEFAULT_BASES.join(', ')} exists. Pass --base <ref> or set FIXTURES_BASE_REF.`, 2);
  return {base: found, source: 'default'};
}

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

function entryName(entry, index) {
  return isPlainObject(entry) && typeof entry.id === 'string' ? `entry ${entry.id} (#${index + 1})` : `entry #${index + 1}`;
}

/** Lists what changed or disappeared between the base value and the current value of a file. */
function compare(base, current) {
  const problems = [];
  let kept = 0;

  if (Array.isArray(base)) {
    if (!Array.isArray(current)) return {problems: ['the file is no longer a JSON array'], kept, added: 0};
    base.forEach((entry, index) => {
      const name = entryName(entry, index);
      if (index >= current.length) {
        problems.push(`${name} was removed`);
      } else if (isDeepStrictEqual(entry, current[index])) {
        kept++;
      } else if (current.some((other) => isDeepStrictEqual(entry, other))) {
        problems.push(`${name} moved to another position`);
      } else {
        problems.push(`${name} was changed or removed`);
      }
    });
    return {problems, kept, added: Math.max(0, current.length - base.length)};
  }

  if (isPlainObject(base)) {
    if (!isPlainObject(current)) return {problems: ['the file is no longer a JSON object'], kept, added: 0};
    for (const key of Object.keys(base)) {
      if (!Object.prototype.hasOwnProperty.call(current, key)) problems.push(`key ${JSON.stringify(key)} was removed`);
      else if (!isDeepStrictEqual(base[key], current[key])) problems.push(`key ${JSON.stringify(key)} was changed`);
      else kept++;
    }
    const added = Object.keys(current).filter((key) => !Object.prototype.hasOwnProperty.call(base, key)).length;
    return {problems, kept, added};
  }

  return isDeepStrictEqual(base, current) ? {problems, kept: 1, added: 0} : {problems: ['the value was changed'], kept, added: 0};
}

function main() {
  let root;
  try {
    root = git(['rev-parse', '--show-toplevel']).trim();
  } catch {
    fail('Run this inside the git repository.', 2);
  }

  const {base, source} = parseArgs(process.argv.slice(2));
  if (/^0+$/.test(base)) {
    fail(`The base ref from ${source} is the all-zero commit, so there is no previous commit to compare with. Pass --base <ref>.`, 2);
  }
  if (!refExists(base)) {
    fail([
      `Cannot find the base ref "${base}" (from ${source}).`,
      'In CI, check out with fetch-depth: 0 so the base branch and earlier commits are available.',
      'A force-push can also remove the previous commit. Then pass --base <ref> by hand.',
    ].join('\n'), 2);
  }
  let mergeBase;
  try {
    mergeBase = git(['merge-base', base, 'HEAD'], {cwd: root}).trim();
  } catch {
    fail(`Cannot find a common ancestor of "${base}" and HEAD. In CI, check out with fetch-depth: 0.`, 2);
  }

  const baseFiles = git(['ls-tree', '-r', '--name-only', mergeBase, '--', ...APPEND_ONLY_PATHS], {cwd: root})
    .split('\n')
    .filter((file) => file.endsWith('.json'));

  let failed = false;
  console.log(`Append-only files compared with ${base} (${mergeBase.slice(0, 12)}):`);
  for (const file of baseFiles) {
    let baseValue;
    try {
      baseValue = JSON.parse(git(['show', `${mergeBase}:${file}`], {cwd: root}));
    } catch {
      console.log(`  - ${file}: not valid JSON at the base, skipped`);
      continue;
    }
    const currentPath = path.join(root, file);
    if (!fs.existsSync(currentPath)) {
      failed = true;
      console.error(`  ✗ ${file}: the file was deleted or moved`);
      continue;
    }
    let currentValue;
    try {
      currentValue = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
    } catch (error) {
      failed = true;
      console.error(`  ✗ ${file}: not valid JSON (${error.message})`);
      continue;
    }
    const {problems, kept, added} = compare(baseValue, currentValue);
    if (problems.length > 0) {
      failed = true;
      console.error(`  ✗ ${file}:`);
      for (const problem of problems) console.error(`      ${problem}`);
    } else {
      console.log(`  ✓ ${file}: ${kept} kept, ${added} added`);
    }
  }

  const currentFiles = git(['ls-files', '--cached', '--others', '--exclude-standard', '--', ...APPEND_ONLY_PATHS], {cwd: root})
    .split('\n')
    .filter((file) => file.endsWith('.json') && !baseFiles.includes(file) && fs.existsSync(path.join(root, file)));
  for (const file of currentFiles) console.log(`  + ${file}: new file`);
  if (baseFiles.length === 0 && currentFiles.length === 0) console.log('  (no append-only files)');

  if (failed) {
    fail([
      '',
      'Existing entries of these files are a contract: shared links depend on them.',
      'Never edit, reorder or remove an entry. Add new entries at the end instead.',
      'If the app no longer matches a fixture, the app regressed: fix the app.',
    ].join('\n'), 1);
  }
}

main();
