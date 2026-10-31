import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {afterEach, beforeAll, beforeEach, describe, expect, it} from 'vitest';

/**
 * Runs the `prebuild` steps (scripts/prepareImages.js --copy, then check-image-registry.mjs
 * --files) in a temporary copy of the repository layout, with made-up image set packages in its
 * own node_modules. The real node_modules and public/images are never touched.
 */

const repoRoot = path.resolve(__dirname, '../../..');
let webp: Buffer;
let placeholder: Buffer;

const image = (width: number, height: number, format: 'webp' | 'png' = 'webp') =>
  sharp({create: {width, height, channels: 4, background: {r: 200, g: 40, b: 40, alpha: 1}}})[format]().toBuffer();

beforeAll(async () => {
  webp = await image(4, 4);
  placeholder = await image(456, 456, 'png');
});

describe('previewCopySize', () => {
  it('returns a 128 px shorter side at the same aspect ratio when larger, and the input size when smaller', async () => {
    const {PREVIEW_COPY_SIZE, previewCopySize} = await import('@/scripts/lib/image-sets.mjs');
    expect(PREVIEW_COPY_SIZE).toBe(128);
    expect(previewCopySize(2048, 2048)).toEqual({width: 128, height: 128});
    expect(previewCopySize(600, 300)).toEqual({width: 256, height: 128});
    expect(previewCopySize(300, 900)).toEqual({width: 128, height: 384});
    expect(previewCopySize(140, 144)).toEqual({width: 128, height: 132});
    expect(previewCopySize(128, 128)).toEqual({width: 128, height: 128});
    expect(previewCopySize(100, 300)).toEqual({width: 100, height: 300});
    expect(previewCopySize(4, 4)).toEqual({width: 4, height: 4});
  });
});

describe('scripts/prepareImages.js and check:images --files', () => {
  let root: string;

  const write = (file: string, value: unknown) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
    fs.writeFileSync(path.join(root, file), typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n');
  };
  const exists = (file: string) => fs.existsSync(path.join(root, file));
  const config = () => fs.readFileSync(path.join(root, 'imageset.config.json'), 'utf8');

  /** A package with the image-set API (getImageList, getImageMetadata), like the published ones. */
  const fakePackage = (name: string, files: string[]) => {
    write(`node_modules/${name}/package.json`, {name, version: '1.0.0', main: 'index.js'});
    write(`node_modules/${name}/index.js`, `
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'public', 'images');
function walk(d) {
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d, {withFileTypes: true}).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.webp') ? [path.relative(dir, path.join(d, e.name))] : []);
}
exports.getImageList = () => walk(dir);
exports.getImageMetadata = () => walk(dir).map((filename) => ({filename, label: filename.toUpperCase(), tags: [{name: 'all-of-them', title: 'All of them'}]}));
`);
    for (const file of files) write(`node_modules/${name}/public/images/${file}`, webp);
  };

  const prepare = () => {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/prepareImages.js'), '--copy'], {cwd: root, encoding: 'utf8'});
    return {status: result.status, output: `${result.stdout}${result.stderr}`};
  };
  const checkImages = (...args: string[]) => {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/check-image-registry.mjs'), '--root', root, ...args], {encoding: 'utf8'});
    return {status: result.status, output: `${result.stdout}${result.stderr}`};
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'otb-prepare-images-'));
    for (const file of ['scripts/prepareImages.js', 'scripts/lib/image-sets.mjs', 'scripts/lib/files.mjs', 'scripts/check-image-registry.mjs']) {
      write(file, fs.readFileSync(path.join(repoRoot, file)));
    }
    // prepareImages needs sharp. Link the installed copy into the temporary node_modules.
    fs.mkdirSync(path.join(root, 'node_modules'));
    fs.symlinkSync(path.join(repoRoot, 'node_modules/sharp'), path.join(root, 'node_modules/sharp'), 'dir');
    fakePackage('image-one', ['a.webp', 'sub/b.webp']);
    fakePackage('image-two', ['c.webp']);
    write('imageset.custom.json', {packages: {'image-one': {displayName: 'One'}, 'image-old': {legacy: true}, 'image-two': {displayName: 'Two', googleFont: 'Saira'}}});
    write('imageset.legacy.json', {'image-old': {displayName: 'Old', images: [{filename: 'x.webp', label: 'X', tags: []}], tags: {}, legacy: true}});
    write('public/images/image-old/x.webp', webp);
    write('public/placeholder-image.png', placeholder);
    write('imageset.config.json', '{"packages": {}}');
    write('image-aliases.json', {});

    const first = prepare();
    expect(first.output).toContain('Config updated');
    expect(first.status).toBe(0);
    expect(checkImages('--update', '--files').status).toBe(0);
  });

  afterEach(() => {
    fs.rmSync(root, {recursive: true, force: true});
  });

  it('writes the official images, all PNG copies and an ordered imageset.config.json when it runs with --copy', async () => {
    for (const file of ['image-one/a.webp', 'image-one/a.png', 'image-one/sub/b.webp', 'image-one/sub/b.png', 'image-two/c.webp', 'image-two/c.png']) {
      expect(exists(`public/images/${file}`), file).toBe(true);
    }
    // The committed legacy WebP stays as it is; its PNG copy is made from it.
    expect(fs.readFileSync(path.join(root, 'public/images/image-old/x.webp')).equals(webp)).toBe(true);
    expect(await sharp(path.join(root, 'public/images/image-old/x.png')).metadata()).toMatchObject({format: 'png', width: 4, height: 4});
    const packages = JSON.parse(config()).packages;
    expect(Object.keys(packages)).toEqual(['image-one', 'image-old', 'image-two']);
    expect(packages['image-old'].legacy).toBe(true);
    expect(packages['image-two']).toMatchObject({displayName: 'Two', googleFont: 'Saira', images: [{filename: 'c.webp', label: 'C.WEBP', tags: ['all-of-them']}]});
    const files = checkImages('--files');
    expect(files.output).toContain('Image files OK');
    expect(files.status).toBe(0);
  });

  it('writes each PNG copy and placeholder-image.preview.png at previewCopySize when the images have various sizes', async () => {
    const {previewCopySize} = await import('@/scripts/lib/image-sets.mjs');
    const sizes: [string, number, number][] = [['wide.webp', 600, 300], ['tall.webp', 300, 900], ['finals.webp', 140, 144], ['small.webp', 100, 300]];
    for (const [file, width, height] of sizes) {
      write(`node_modules/image-one/public/images/${file}`, await image(width, height));
    }
    write('public/images/image-old/x.webp', await image(2048, 2048));

    const result = prepare();
    expect(result.status).toBe(0);
    for (const [file, width, height] of sizes) {
      const copy = await sharp(path.join(root, `public/images/image-one/${file.replace('.webp', '.png')}`)).metadata();
      expect({width: copy.width, height: copy.height}, file).toEqual(previewCopySize(width, height));
      // The WebP image the app shows stays at full size.
      expect(await sharp(path.join(root, `public/images/image-one/${file}`)).metadata(), file).toMatchObject({width, height});
    }
    expect(await sharp(path.join(root, 'public/images/image-old/x.png')).metadata()).toMatchObject({format: 'png', width: 128, height: 128});
    expect(await sharp(path.join(root, 'public/images/image-old/x.webp')).metadata()).toMatchObject({width: 2048, height: 2048});
    expect(await sharp(path.join(root, 'public/placeholder-image.preview.png')).metadata()).toMatchObject({format: 'png', width: 128, height: 128});
  });

  it('returns exit code 1 when public/placeholder-image.png is missing', () => {
    fs.rmSync(path.join(root, 'public/placeholder-image.png'));

    const result = prepare();
    expect(result.output).toContain('The placeholder tile for link previews: 1 file(s) missing in public: placeholder-image.preview.png');
    expect(result.status).toBe(1);
  });

  it('returns exit code 1 and writes no change to imageset.config.json when a package folder is missing', () => {
    const before = config();
    fs.renameSync(path.join(root, 'node_modules/image-two'), path.join(root, 'image-two-moved'));

    const result = prepare();
    expect(result.output).toContain('Could not prepare image-two');
    expect(result.output).toContain('imageset.config.json was not updated');
    expect(result.status).toBe(1);
    expect(config()).toBe(before);
  });

  it('returns exit code 1 when a package has no images', () => {
    fs.rmSync(path.join(root, 'node_modules/image-one/public/images'), {recursive: true});
    fs.mkdirSync(path.join(root, 'node_modules/image-one/public/images'));

    const result = prepare();
    expect(result.output).toContain('image-one has no images');
    expect(result.status).toBe(1);
  });

  it('returns exit code 1 and writes no change to imageset.config.json when a committed legacy image is missing', () => {
    const before = config();
    fs.rmSync(path.join(root, 'public/images/image-old/x.webp'));

    const result = prepare();
    expect(result.output).toContain('Legacy set image-old (committed images; restore them with git): 1 file(s) missing');
    expect(result.output).toContain('x.webp');
    expect(result.status).toBe(1);
    expect(config()).toBe(before);
  });

  it('returns exit code 1 when a committed legacy image is not a valid WebP file', () => {
    // The PNG copy from the first run exists; prepareImages removes it before converting again.
    expect(exists('public/images/image-old/x.png')).toBe(true);
    write('public/images/image-old/x.webp', 'not a WebP image');

    const result = prepare();
    expect(result.output).toContain('Legacy set image-old (PNG copies for link previews): 1 file(s) missing in public/images/image-old: x.png');
    expect(result.status).toBe(1);
  });

  it('returns exit code 1 from check:images --files when the image of a shipped id is missing', () => {
    fs.rmSync(path.join(root, 'public/images/image-one/sub/b.png'));
    fs.rmSync(path.join(root, 'public/images/image-old/x.webp'));

    const result = checkImages('--files');
    expect(result.output).toContain('2 image file(s) of shipped item ids are missing in public/images/: image-one/sub/b.png, image-old/x.webp');
    expect(result.status).toBe(1);
    // Without --files (npm run check, before any build) the files are not checked.
    expect(checkImages().status).toBe(0);
  });
});
