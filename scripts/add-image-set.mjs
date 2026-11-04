#!/usr/bin/env node
/**
 * Adds a new active image set: the first version of a set, which image-set-update.yml cannot
 * bring (it takes only sets already on the active list). Later versions arrive through that
 * workflow.
 *
 *   npm run add-image-set -- <package>@<x.y.z> --name "<Display Name>"
 *     [--font "<Google font from lib/fonts.ts>"] [--background /splash/<file>.webp]
 *
 * It refuses a name that is not image-*, a set already in imageset.custom.json or
 * imageset.legacy.json, a version that is not an exact x.y.z, a missing --name, and a display
 * name whose URL slug another set uses (checkAdd in scripts/lib/image-set-commands.mjs). Then it:
 *   1. installs the exact version (npm install <package>@<version> --save-exact --ignore-scripts);
 *   2. adds {"displayName", "googleFont"?, "backgroundImage"?} at the end of imageset.custom.json;
 *   3. runs prepareImages and check-image-registry.mjs --update, so imageset.config.json and
 *      image-registry.lock.json gain the set and its ids.
 * When a step fails, or the new entry has shapes other than square, ids that another package
 * registered or ships, or the checks of image-set-update.mjs fail (tags, labels, filenames), it
 * puts back package.json, package-lock.json, imageset.custom.json, imageset.config.json and
 * image-registry.lock.json, deletes node_modules/<package> and public/images/<package>, and
 * exits with code 1. It never adds a landing page card (FEATURED_SETS in app/page.tsx): that is
 * the owner's decision.
 */
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileIfExists} from './lib/files.mjs';
import {checkAdd, fontNames, jsonText, newEntryProblems, parseAddArgs, withCustomEntry} from './lib/image-set-commands.mjs';
import {checkPackageEntry} from './image-set-update.mjs';

/** The files this command may change. It puts them back as they were when a step fails. */
export const ADD_FILES = ['package.json', 'package-lock.json', 'imageset.custom.json', 'imageset.config.json', 'image-registry.lock.json'];

/** Runs a command in `root` and returns {status, output}. The output is printed only when a step fails. */
export function runCommand(command, args, {cwd}) {
  const result = spawnSync(command, args, {cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']});
  return {status: result.status ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? result.error.message : ''}`};
}

const tail = (output, lines = 40) => output.trimEnd().split('\n').slice(-lines).join('\n');

/**
 * Runs the command. `exec(command, args, {cwd})` runs npm and node (runCommand by default; tests
 * pass their own to install a local package). Returns the exit code.
 */
export function addImageSet({root, argv, exec = runCommand, log = console.log, error = console.error}) {
  const file = (name) => path.join(root, name);
  const readJson = (name) => {
    const text = readFileIfExists(file(name), 'utf8');
    return text === undefined ? undefined : JSON.parse(text);
  };

  let request;
  let checked;
  try {
    request = parseAddArgs(argv);
    checked = checkAdd(request, {
      customConfig: readJson('imageset.custom.json'),
      legacyConfig: readJson('imageset.legacy.json') ?? {},
      fonts: fontNames(readFileIfExists(file('lib/fonts.ts'), 'utf8') ?? ''),
      isPublicFile: (publicPath) => fs.statSync(path.join(root, 'public', publicPath), {throwIfNoEntry: false})?.isFile() === true,
    });
  } catch (refusal) {
    error(`refused: ${refusal.message}`);
    return 1;
  }
  const {packageName, version} = request;
  log(`The display name "${checked.custom.displayName}" becomes the URL slug of ${packageName}: /rank/${checked.slug}.`);
  log('Shared links use that slug, so the display name can never change.');

  const saved = new Map(ADD_FILES.map((name) => [name, readFileIfExists(file(name), 'utf8')]));
  const rollBack = (reason) => {
    error(`refused: ${reason}`);
    for (const [name, text] of saved) {
      if (text === undefined) fs.rmSync(file(name), {force: true});
      else fs.writeFileSync(file(name), text);
    }
    fs.rmSync(file(`node_modules/${packageName}`), {recursive: true, force: true});
    fs.rmSync(file(`public/images/${packageName}`), {recursive: true, force: true});
    error(`Rolled back: ${ADD_FILES.join(', ')} are as they were, and node_modules/${packageName} and public/images/${packageName} are deleted.`);
    error('If npm changed other packages in node_modules, run npm ci to match package-lock.json again.');
    return 1;
  };

  const steps = [
    {
      what: `npm install ${packageName}@${version} --save-exact`,
      run: () => exec('npm', ['install', `${packageName}@${version}`, '--save-exact', '--ignore-scripts', '--no-audit', '--no-fund'], {cwd: root}),
      after: () => {
        const pinned = readJson('package.json')?.dependencies?.[packageName];
        return pinned === version ? [] : [`package.json has ${packageName} ${JSON.stringify(pinned)} after the install, not exactly ${version}.`];
      },
    },
    {
      what: 'add the set to imageset.custom.json',
      run: () => {
        fs.writeFileSync(file('imageset.custom.json'), jsonText(withCustomEntry(readJson('imageset.custom.json'), packageName, checked.custom)));
        return {status: 0, output: ''};
      },
    },
    {
      what: 'npm run prepare-images',
      run: () => exec(process.execPath, [file('scripts/prepareImages.js')], {cwd: root}),
      after: () => {
        const config = readJson('imageset.config.json');
        const problems = newEntryProblems(packageName, config, readJson('image-registry.lock.json') ?? {});
        const entryErrors = [];
        checkPackageEntry(packageName, config?.packages?.[packageName], checked.custom, entryErrors);
        return [...problems, ...entryErrors];
      },
    },
    {
      what: 'npm run check:images -- --update',
      run: () => exec(process.execPath, [file('scripts/check-image-registry.mjs'), '--root', root, '--update'], {cwd: root}),
    },
  ];

  for (const step of steps) {
    log(`- ${step.what}`);
    let result;
    try {
      result = step.run();
    } catch (failure) {
      return rollBack(`${step.what} failed: ${failure.message}`);
    }
    if (result.status !== 0) {
      error(tail(result.output));
      return rollBack(`${step.what} failed (exit code ${result.status}).`);
    }
    const problems = step.after ? step.after() : [];
    if (problems.length > 0) {
      return rollBack(`${packageName}@${version} does not pass the checks:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    }
  }

  const config = readJson('imageset.config.json');
  const entry = config.packages[packageName];
  log('');
  log(`Added ${packageName}@${version} as the active set "${entry.displayName}" with ${entry.images.length} images and ${Object.keys(entry.tags).length} categories.`);
  log('Next steps:');
  log(`  1. Review and commit the changed files: ${ADD_FILES.join(', ')}.`);
  log('  2. Run npm run check and npm run build.');
  log('  3. A landing page card (FEATURED_SETS in app/page.tsx) is the owner\'s decision. This command never adds one.');
  log(`  4. Later versions of ${packageName} arrive through image-set-update.yml.`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = addImageSet({root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), argv: process.argv.slice(2)});
}
