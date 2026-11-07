// Builds the dnd-kit fork: runs each package's upstream build commands (tsup) and writes the
// output next to the sources, where the package.json "exports" point. The output is
// committed, so installing and building the app needs no extra tools.
//
// Usage, from the repository root after `npm ci`:
//   node packages/dnd-kit/build.mjs               install the tools, build, delete the tools
//   node packages/dnd-kit/build.mjs --keep-tools  keep packages/dnd-kit/node_modules
//
// The tools (tsup and the TypeScript it uses) are the versions upstream used for this
// release, listed in package.json here; .npmrc here makes npm pick the same versions on every
// machine. They are deleted after the build because their @types/react would otherwise sit
// next to the packages and clash with the app's own copy in type checks.
//
// The build commands come from each package's "build" script, exactly as upstream wrote them
// for Bun ("bun build:core && bun build:sortable"); this script runs the same tsup commands
// with Node. See docs/dnd-fork.md.

import {spawnSync} from 'node:child_process';
import {existsSync, readdirSync, readFileSync, realpathSync, rmSync} from 'node:fs';
import {dirname, join, parse} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const toolsDir = join(root, 'node_modules');
const keepTools = process.argv.includes('--keep-tools');

/** The fork's packages: every folder here with a package.json named @dnd-kit/<folder>. */
const PACKAGES = ['abstract', 'collision', 'dom', 'geometry', 'helpers', 'react', 'state'];

function readManifest(name) {
  return JSON.parse(readFileSync(join(root, name, 'package.json'), 'utf8'));
}

/** The other fork packages that a package's sources import, for example "helpers". */
function importedPackages(name) {
  const found = new Set();
  const scan = (dir) => {
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) scan(path);
      else if (/\.tsx?$/.test(entry.name)) {
        for (const match of readFileSync(path, 'utf8').matchAll(/from\s+['"]@dnd-kit\/([a-z-]+)/g)) {
          if (match[1] !== name) found.add(match[1]);
        }
      }
    }
  };
  scan(join(root, name, 'src'));
  return found;
}

/**
 * Packages in build order: each one after the fork packages it depends on or imports.
 * Imports count too: upstream @dnd-kit/dom imports @dnd-kit/helpers without listing it as a
 * dependency, and its build bundles the built helpers code into sortable.js.
 */
function buildOrder() {
  const manifests = new Map(PACKAGES.map((name) => [name, readManifest(name)]));
  const order = [];
  const visiting = new Set();
  const visit = (name) => {
    if (order.includes(name)) return;
    if (visiting.has(name)) throw new Error(`Dependency cycle at @dnd-kit/${name}`);
    visiting.add(name);
    const {dependencies = {}} = manifests.get(name);
    const needed = new Set([
      ...Object.keys(dependencies).flatMap((dependency) => /^@dnd-kit\/(.+)$/.exec(dependency)?.[1] ?? []),
      ...importedPackages(name),
    ]);
    for (const other of needed) {
      if (other !== name && manifests.has(other)) visit(other);
    }
    visiting.delete(name);
    order.push(name);
  };
  PACKAGES.forEach(visit);
  return order;
}

/** The tsup argument lists of a package's "build" script, following `bun <script>` steps. */
function tsupCommands(scripts, scriptName = 'build') {
  const script = scripts[scriptName];
  if (typeof script !== 'string') throw new Error(`Missing script "${scriptName}"`);
  return script.split('&&').flatMap((part) => {
    const words = part.trim().split(/\s+/);
    if (words[0] === 'tsup') return [words.slice(1)];
    if ((words[0] === 'bun' || words[0] === 'npm') && words.length >= 2) {
      const name = words[0] === 'npm' && words[1] === 'run' ? words[2] : words[1];
      return tsupCommands(scripts, name);
    }
    throw new Error(`Cannot run build step "${part.trim()}"`);
  });
}

/** Deletes a package's previous build output: the "files" entries other than docs. */
function clean(name, manifest) {
  for (const entry of manifest.files ?? []) {
    if (entry === 'LICENSE' || entry === 'README.md') continue;
    // "dist/**" and "plugins/*" name whole output folders.
    const target = entry.replace(/\/\*+$/, '');
    if (target.includes('*') || target.startsWith('src')) throw new Error(`Unexpected files entry "${entry}" in @dnd-kit/${name}`);
    rmSync(join(root, name, target), {recursive: true, force: true});
  }
}

/**
 * Deletes build output at the top of a package folder that upstream does not publish, so the
 * folder holds what the npm package holds. For example tsup writes index.d.cts for
 * @dnd-kit/react, but its "files" list leaves it out.
 */
function pruneUnpublished(name, manifest) {
  const published = new Set(manifest.files ?? []);
  for (const entry of readdirSync(join(root, name), {withFileTypes: true})) {
    if (!entry.isFile() || published.has(entry.name)) continue;
    if (/\.(js|cjs|mjs|map|d\.ts|d\.cts|d\.mts)$/.test(entry.name)) {
      rmSync(join(root, name, entry.name));
    }
  }
}

/** Every file that "main", "module", "types" and "exports" point at must exist. */
function checkEntryPoints(name, manifest) {
  const targets = [manifest.main, manifest.module, manifest.types];
  const collect = (value) => {
    if (typeof value === 'string') targets.push(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(collect);
  };
  collect(manifest.exports);
  for (const target of targets) {
    if (!target || target.includes('*')) continue;
    if (!existsSync(join(root, name, target))) throw new Error(`@dnd-kit/${name}: missing ${target} after the build`);
  }
}

/**
 * The builds of abstract, dom and react read the types of the other fork packages through
 * node_modules/@dnd-kit/<name>, so the app's npm workspaces must link them here first.
 */
function checkWorkspaceLinks() {
  for (const name of PACKAGES) {
    let dir = root;
    let linked;
    while (!linked) {
      const candidate = join(dir, 'node_modules', '@dnd-kit', name);
      if (existsSync(candidate)) linked = candidate;
      else if (dir === parse(dir).root) break;
      else dir = dirname(dir);
    }
    if (!linked || realpathSync(linked) !== realpathSync(join(root, name))) {
      throw new Error(`node_modules/@dnd-kit/${name} does not link to ${join(root, name)}. Run \`npm ci\` in the repository root first.`);
    }
  }
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {cwd, stdio: 'inherit', shell: process.platform === 'win32' && command === 'npm'});
  if (result.status !== 0) {
    console.error(`Failed: ${command} ${args.join(' ')} (in ${cwd})`);
    process.exit(result.status ?? 1);
  }
}

checkWorkspaceLinks();

// The tools: npm reads .npmrc here (no lockfile, fixed "before" date, no install scripts).
run('npm', ['install', '--no-audit', '--no-fund'], root);
const tsupManifest = JSON.parse(readFileSync(join(toolsDir, 'tsup', 'package.json'), 'utf8'));
const tsup = join(toolsDir, 'tsup', tsupManifest.bin.tsup);

for (const name of buildOrder()) {
  const manifest = readManifest(name);
  clean(name, manifest);
  for (const args of tsupCommands(manifest.scripts ?? {})) {
    console.log(`@dnd-kit/${name}: tsup ${args.join(' ')}`);
    run(process.execPath, [tsup, ...args], join(root, name));
  }
  pruneUnpublished(name, manifest);
  checkEntryPoints(name, manifest);
}

if (!keepTools) rmSync(toolsDir, {recursive: true, force: true});
console.log('dnd-kit fork built.');
