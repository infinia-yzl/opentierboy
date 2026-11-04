import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

/**
 * A temporary copy of the repository layout for the image set commands
 * (scripts/add-image-set.mjs, scripts/remove-image-set.mjs): their scripts, the files they read
 * and write, and made-up image set packages with the image-set API (getImageList,
 * getImageMetadata). It needs no network: tests pass an `exec` that installs and uninstalls
 * packages by copying folders, and runs node scripts for real. The real node_modules and
 * public/images are never touched.
 */
export const repoRoot = path.resolve(__dirname, '../../..');

const SCRIPTS = ['scripts/prepareImages.js', 'scripts/lib/image-sets.mjs', 'scripts/lib/files.mjs', 'scripts/check-image-registry.mjs'];

export type ImageSpec = {file: string; label?: string; tags?: {name: string; title?: string; shape?: string}[]; shape?: string; missing?: boolean};
export type ExecCall = {command: string; args: string[]};

export async function tinyImages() {
  const make = (format: 'webp' | 'png', size: number) =>
    sharp({create: {width: size, height: size, channels: 4, background: {r: 200, g: 40, b: 40, alpha: 1}}})[format]().toBuffer();
  return {webp: await make('webp', 4), png: await make('png', 8)};
}

export function createImageSetRepo(images: {webp: Buffer; png: Buffer}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'otb-image-set-command-'));
  const calls: ExecCall[] = [];
  const at = (file: string) => path.join(root, file);

  const write = (file: string, value: unknown) => {
    fs.mkdirSync(path.dirname(at(file)), {recursive: true});
    fs.writeFileSync(at(file), typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n');
  };
  const read = (file: string) => fs.readFileSync(at(file), 'utf8');
  const readJson = (file: string) => JSON.parse(read(file));
  const exists = (file: string) => fs.existsSync(at(file));

  /**
   * Writes a package with the image-set API to `dir` (relative to root). getImageList lists
   * every image of `specs`, also those marked `missing`, which have no file.
   */
  const writePackage = (dir: string, name: string, version: string, specs: ImageSpec[]) => {
    write(`${dir}/package.json`, {name, version, main: 'index.js'});
    write(`${dir}/specs.json`, specs);
    write(`${dir}/index.js`, `
const specs = require('./specs.json');
exports.getImageList = () => specs.map((spec) => spec.file);
exports.getImageMetadata = () => specs.map((spec) => ({
  filename: spec.file,
  label: spec.label || spec.file.toUpperCase(),
  tags: spec.tags || [{name: 'all-of-them', title: 'All of them', description: 'Every image'}],
  ...(spec.shape && {shape: spec.shape}),
}));
`);
    for (const spec of specs) if (!spec.missing) write(`${dir}/public/images/${spec.file}`, images.webp);
  };

  /** An installed package in node_modules, and its pin in package.json and package-lock.json. */
  const installPackage = (name: string, version: string, specs: ImageSpec[]) => {
    writePackage(`node_modules/${name}`, name, version, specs);
    const manifest = readJson('package.json');
    manifest.dependencies = {...manifest.dependencies, [name]: version};
    write('package.json', manifest);
    const lock = readJson('package-lock.json');
    lock.packages[''].dependencies = {...lock.packages[''].dependencies, [name]: version};
    lock.packages[`node_modules/${name}`] = {version, resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`};
    write('package-lock.json', lock);
  };

  const uninstallPackage = (name: string) => {
    fs.rmSync(at(`node_modules/${name}`), {recursive: true, force: true});
    const manifest = readJson('package.json');
    delete manifest.dependencies[name];
    write('package.json', manifest);
    const lock = readJson('package-lock.json');
    delete lock.packages[''].dependencies[name];
    delete lock.packages[`node_modules/${name}`];
    write('package-lock.json', lock);
  };

  /**
   * Packages that `npm install <name>@<version>` finds, as if published: staged under
   * registry/<name>@<version>/.
   */
  const publish = (name: string, version: string, specs: ImageSpec[]) => writePackage(`registry/${name}@${version}`, name, version, specs);

  /** The exec of the commands: npm install, uninstall and run check are made up; node runs for real. */
  const exec = (command: string, args: string[], {cwd}: {cwd: string}) => {
    calls.push({command, args});
    if (command !== 'npm') {
      const result = spawnSync(command, args, {cwd, encoding: 'utf8'});
      return {status: result.status ?? 1, output: `${result.stdout}${result.stderr}`};
    }
    if (args[0] === 'install') {
      const spec = args[1];
      const staged = `registry/${spec}`;
      if (!exists(staged)) return {status: 1, output: `npm error 404 '${spec}' is not in this registry.`};
      const [name, version] = [spec.slice(0, spec.lastIndexOf('@')), spec.slice(spec.lastIndexOf('@') + 1)];
      installPackage(name, version, readJson(`${staged}/specs.json`));
      return {status: 0, output: `added 1 package`};
    }
    if (args[0] === 'uninstall') {
      uninstallPackage(args[1]);
      return {status: 0, output: 'removed 1 package'};
    }
    if (args[0] === 'run' && args[1] === 'check') return {status: 0, output: 'all checks passed (made up)'};
    return {status: 1, output: `unexpected npm ${args.join(' ')}`};
  };

  const prepare = () => exec(process.execPath, [at('scripts/prepareImages.js')], {cwd: root});
  const checkImages = (...args: string[]) => exec(process.execPath, [at('scripts/check-image-registry.mjs'), '--root', root, ...args], {cwd: root});

  /** Every file under root except node_modules, public/images and registry, with its contents. */
  const snapshot = () => {
    const files: Record<string, string> = {};
    const walk = (relative: string) => {
      for (const entry of fs.readdirSync(at(relative), {withFileTypes: true})) {
        const child = path.posix.join(relative, entry.name);
        if (['node_modules', 'registry', 'public/images'].includes(child)) continue;
        if (entry.isDirectory()) walk(child);
        else files[child] = fs.readFileSync(at(child), 'base64');
      }
    };
    walk('');
    return files;
  };

  for (const file of SCRIPTS) write(file, fs.readFileSync(path.join(repoRoot, file)));
  write('lib/fonts.ts', fs.readFileSync(path.join(repoRoot, 'lib/fonts.ts')));
  fs.mkdirSync(at('node_modules'));
  // prepareImages needs sharp. Link the installed copy into the temporary node_modules.
  fs.symlinkSync(path.join(repoRoot, 'node_modules/sharp'), at('node_modules/sharp'), 'dir');
  write('public/placeholder-image.png', images.png);
  write('public/splash/one-bg.webp', images.webp);
  write('package.json', {name: 'fork', private: true, dependencies: {}});
  write('package-lock.json', {name: 'fork', lockfileVersion: 3, requires: true, packages: {'': {name: 'fork', dependencies: {}}}});
  write('imageset.config.json', '{"packages": {}}');
  write('image-aliases.json', {});

  const remove = () => fs.rmSync(root, {recursive: true, force: true});
  return {root, calls, at, write, read, readJson, exists, installPackage, publish, exec, prepare, checkImages, snapshot, remove};
}

export type ImageSetRepo = ReturnType<typeof createImageSetRepo>;
