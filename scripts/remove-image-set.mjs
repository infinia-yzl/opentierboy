#!/usr/bin/env node
/**
 * Removes an image set, for forks. OpenTierBoy itself never removes a shipped set: old links
 * use its item ids, and they would show placeholders.
 *
 *   npm run remove-image-set -- <package>          dry run: prints what would change
 *   npm run remove-image-set -- <package> --yes    removes the set
 *
 * With --yes it runs npm uninstall <package>; removes the set's entry from imageset.custom.json
 * and, for a legacy set, from imageset.legacy.json; removes every image-registry.lock.json entry
 * whose "package" is the set, and every image-aliases.json alias from or to one of its ids; for
 * a legacy set, removes its line from the npm ignore list in .github/dependabot.yml and from
 * LEGACY_SETS in tests/support/links.ts; for an active set, removes its line from FEATURED_SETS
 * in app/page.tsx when it is there; deletes public/images/<package>. Each text file edit removes
 * exactly one line, and the command stops before changing anything when that line is not there
 * exactly once (planRemoval in scripts/lib/image-set-commands.mjs).
 *
 * It never edits tests or fixtures. It lists the files under tests/ that still name the set, its
 * ids or its /rank path (links in fixtures are decoded first), and the app files that name it,
 * because a person must decide on them. Then it runs prepareImages and npm run check and prints
 * the result. Exit code 1 when it refused, or when a step or the checks failed.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import LZString from 'lz-string';
import {readFileIfExists} from './lib/files.mjs';
import {countMentions, decodedStates, planRemoval, parseRemoveArgs, REMOVE_FILES} from './lib/image-set-commands.mjs';
import {runCommand} from './add-image-set.mjs';

const TEXT_FILE = /\.(?:[cm]?[jt]sx?|json|md|mdx|ya?ml|css|html|txt)$/i;
const SKIPPED_FOLDERS = new Set(['node_modules', '.next', '.git']);
/** Folders of app code that may name a set (search engine data, link previews, game colours). */
const APP_FOLDERS = ['app', 'components', 'contexts', 'lib', 'models'];

/** Every text file under `dir`, relative to `root`, sorted. */
function textFiles(root, dir) {
  const found = [];
  const walk = (relative) => {
    const entries = fs.readdirSync(path.join(root, relative), {withFileTypes: true});
    for (const entry of entries) {
      const child = path.posix.join(relative, entry.name);
      if (entry.isDirectory() && !SKIPPED_FOLDERS.has(entry.name)) walk(child);
      else if (entry.isFile() && TEXT_FILE.test(entry.name)) found.push(child);
    }
  };
  if (fs.statSync(path.join(root, dir), {throwIfNoEntry: false})?.isDirectory()) walk(dir);
  return found.sort();
}

/** The files that name the set, with the number of mentions. Fixture links are decoded first. */
export function filesNamingSet(root, folders, names) {
  const results = [];
  for (const relative of folders.flatMap((folder) => textFiles(root, folder))) {
    const text = fs.readFileSync(path.join(root, relative), 'utf8');
    let count = countMentions(text, names);
    if (relative.startsWith('tests/fixtures/') && relative.endsWith('.json')) {
      try {
        count += decodedStates(JSON.parse(text), LZString.decompressFromEncodedURIComponent).reduce((sum, state) => sum + countMentions(state, names), 0);
      } catch {
        // Not JSON: the plain text count stands.
      }
    }
    if (count > 0) results.push({file: relative, count});
  }
  return results;
}

const tail = (output, lines = 40) => output.trimEnd().split('\n').slice(-lines).join('\n');

/** Runs the command. `exec` runs npm and node (see addImageSet). Returns the exit code. */
export function removeImageSet({root, argv, exec = runCommand, log = console.log, error = console.error}) {
  const file = (name) => path.join(root, name);
  let request;
  let plan;
  try {
    request = parseRemoveArgs(argv);
    const files = Object.fromEntries([...Object.values(REMOVE_FILES), 'imageset.config.json', 'package.json'].map((name) => [name, readFileIfExists(file(name), 'utf8')]));
    plan = planRemoval(request.packageName, files);
  } catch (refusal) {
    error(`refused: ${refusal.message}`);
    return 1;
  }
  const {packageName} = plan;

  log('WARNING: OpenTierBoy never removes a shipped image set. Shared links use its item ids, and');
  log(`every link that uses ${packageName} would show placeholders. Only a fork should remove a set.`);
  log('');
  log(`${request.yes ? 'Removing' : 'Would remove'} the ${plan.legacy ? 'legacy' : 'active'} set ${packageName}${plan.displayName ? ` ("${plan.displayName}")` : ''}, with ${plan.ids.length} item id(s):`);
  if (plan.uninstall) log(`  package.json, package-lock.json: npm uninstall ${packageName}`);
  for (const change of plan.changes) {
    for (const line of change.summary) log(`  ${change.file}: ${line}`);
  }
  log(`  public/images/${packageName}: delete the copied images`);
  for (const note of plan.notes) log(`Note: ${note}`);

  if (!request.yes) {
    log('');
    log(`Dry run: nothing changed. Run again with --yes to remove ${packageName}.`);
    return 0;
  }

  if (plan.uninstall) {
    const result = exec('npm', ['uninstall', packageName, '--ignore-scripts', '--no-audit', '--no-fund'], {cwd: root});
    if (result.status !== 0) {
      error(tail(result.output));
      error(`refused: npm uninstall ${packageName} failed (exit code ${result.status}). No other file was changed.`);
      return 1;
    }
  }
  for (const change of plan.changes) fs.writeFileSync(file(change.file), change.text);
  fs.rmSync(file(`public/images/${packageName}`), {recursive: true, force: true});
  log(`Removed ${packageName}.`);

  const names = {packageName, ids: plan.ids, slug: plan.slug};
  const inTests = filesNamingSet(root, ['tests'], names);
  log('');
  log(inTests.length === 0
    ? `No file under tests/ names ${packageName} any more.`
    : `These files under tests/ still name ${packageName}, its ids or its /rank path. A person must decide on each (this command never edits tests or fixtures; tests/fixtures/ is append-only in OpenTierBoy):`);
  for (const {file: name, count} of inTests) log(`  ${name} (${count})`);
  const inApp = filesNamingSet(root, APP_FOLDERS, names);
  if (inApp.length > 0) {
    log(`These app files name ${packageName} too:`);
    for (const {file: name, count} of inApp) log(`  ${name} (${count})`);
  }

  log('');
  log('- npm run prepare-images');
  const prepared = exec(process.execPath, [file('scripts/prepareImages.js')], {cwd: root});
  if (prepared.status !== 0) {
    error(tail(prepared.output));
    error(`prepare-images failed (exit code ${prepared.status}).`);
    return 1;
  }
  log('  prepare-images passed: imageset.config.json no longer holds the set.');
  log('- npm run check');
  const checked = exec('npm', ['run', 'check'], {cwd: root});
  log(tail(checked.output));
  if (checked.status !== 0) {
    error(`npm run check failed (exit code ${checked.status}). The tests and fixtures listed above are the usual cause;`);
    error('check:fixtures also reports the removed registry, alias and legacy entries until the removal is on the base branch it compares with.');
    return 1;
  }
  log('npm run check passed.');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = removeImageSet({root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), argv: process.argv.slice(2)});
}
