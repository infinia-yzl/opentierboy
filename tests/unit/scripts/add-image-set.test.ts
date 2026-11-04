import {afterEach, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {addImageSet} from '@/scripts/add-image-set.mjs';
import {createImageSetRepo, type ImageSetRepo, tinyImages} from '../support/image-set-repo';

/**
 * Runs scripts/add-image-set.mjs in a temporary repository (tests/unit/support/image-set-repo.ts).
 * The npm install step is made up: it copies a staged package folder into node_modules and pins
 * it in package.json, as `npm install <package>@<version> --save-exact` does. prepareImages and
 * check-image-registry.mjs run for real.
 */
let images: Awaited<ReturnType<typeof tinyImages>>;
let repo: ImageSetRepo;
let output: string[];

const OLD_ENTRY = {
  displayName: 'Old',
  images: [{filename: 'x.webp', label: 'X.WEBP', tags: ['all-of-them']}],
  tags: {'all-of-them': {title: 'All of them', description: 'Every image', category: 'general'}},
  legacy: true,
};

const add = (...argv: string[]) => addImageSet({
  root: repo.root,
  argv,
  exec: repo.exec,
  log: (line: string) => output.push(line),
  error: (line: string) => output.push(line),
});

beforeAll(async () => {
  images = await tinyImages();
});

beforeEach(() => {
  output = [];
  repo = createImageSetRepo(images);
  repo.installPackage('image-one', '1.0.0', [{file: 'a.webp'}, {file: 'two-b.webp'}]);
  repo.installPackage('image-old', '2.0.0', [{file: 'x.webp'}]);
  repo.write('imageset.custom.json', {packages: {'image-one': {displayName: 'One', googleFont: 'Saira'}, 'image-old': {legacy: true}}});
  repo.write('imageset.legacy.json', {'image-old': OLD_ENTRY});
  expect(repo.prepare().status).toBe(0);
  expect(repo.checkImages('--update').status).toBe(0);
  repo.calls.length = 0;
});

afterEach(() => {
  repo.remove();
});

describe('scripts/add-image-set.mjs', () => {
  it('writes the set to the package, set and registry files when the package passes every check', () => {
    repo.publish('image-new', '1.2.3', [{file: 'n1.webp', label: 'First'}, {file: 'sub/n2.webp', label: 'Second'}]);
    const lockBefore = repo.readJson('image-registry.lock.json');

    const status = add('image-new@1.2.3', '--name', 'New Game', '--font', 'Saira', '--background', '/splash/one-bg.webp');
    expect(output.join('\n')).toContain('becomes the URL slug of image-new: /rank/new-game');
    expect(status).toBe(0);

    expect(repo.calls.find((call) => call.command === 'npm')?.args).toEqual(['install', 'image-new@1.2.3', '--save-exact', '--ignore-scripts', '--no-audit', '--no-fund']);
    expect(repo.readJson('package.json').dependencies['image-new']).toBe('1.2.3');
    const custom = repo.readJson('imageset.custom.json');
    expect(Object.keys(custom.packages)).toEqual(['image-one', 'image-old', 'image-new']);
    expect(custom.packages['image-new']).toEqual({displayName: 'New Game', googleFont: 'Saira', backgroundImage: '/splash/one-bg.webp'});
    // The file keeps the repository's JSON layout.
    expect(repo.read('imageset.custom.json')).toBe(`${JSON.stringify(custom, null, 2)}\n`);

    const config = repo.readJson('imageset.config.json');
    expect(Object.keys(config.packages)).toEqual(['image-one', 'image-old', 'image-new']);
    expect(config.packages['image-new']).toMatchObject({
      displayName: 'New Game',
      images: [{filename: 'n1.webp', label: 'First'}, {filename: 'sub/n2.webp', label: 'Second'}],
      googleFont: 'Saira',
      backgroundImage: '/splash/one-bg.webp',
    });
    const lock = repo.readJson('image-registry.lock.json');
    expect(Object.keys(lock)).toEqual([...Object.keys(lockBefore), 'image-new-n1.webp', 'image-new-sub/n2.webp']);
    expect(lock['image-new-n1.webp']).toEqual({package: 'image-new', filename: 'n1.webp', label: 'First'});

    const text = output.join('\n');
    expect(text).toContain('Added image-new@1.2.3 as the active set "New Game" with 2 images and 1 categories.');
    expect(text).toContain('FEATURED_SETS in app/page.tsx) is the owner\'s decision. This command never adds one.');
    expect(repo.checkImages('--files').status).toBe(0);
  });

  it('returns exit code 1 and writes no file when the display name makes a slug another set uses', () => {
    const before = repo.snapshot();

    expect(add('image-new@1.0.0', '--name', 'OLD')).toBe(1);
    expect(output.join('\n')).toContain('refused: The display name "OLD" makes the URL slug "old", which image-old ("Old") already uses.');
    expect(repo.calls).toEqual([]);
    expect(repo.snapshot()).toEqual(before);
  });

  it.each([
    ['the package has a landscape image', [{file: 'n1.webp'}, {file: 'wide.webp', shape: 'landscape'}], 'Image wide.webp has the shape "landscape"'],
    ['a category has a portrait shape', [{file: 'n1.webp', tags: [{name: 'tall', title: 'Tall', shape: 'portrait'}]}], 'Category tall has the shape "portrait"'],
    ['an image file is missing', [{file: 'n1.webp'}, {file: 'gone.webp', missing: true}], 'npm run prepare-images failed'],
    ['a label has an invisible character', [{file: 'n1.webp', label: 'Zero​width'}], 'has a control or invisible formatting character'],
  ])('returns exit code 1 and writes back every file when %s', (_name, specs, message) => {
    repo.publish('image-new', '1.0.0', specs);
    const before = repo.snapshot();

    expect(add('image-new@1.0.0', '--name', 'New')).toBe(1);
    const text = output.join('\n');
    expect(text).toContain(message);
    expect(text).toContain('Rolled back');
    expect(repo.snapshot()).toEqual(before);
    expect(repo.exists('node_modules/image-new')).toBe(false);
    expect(repo.exists('public/images/image-new')).toBe(false);
    expect(repo.checkImages().status).toBe(0);
  });

  it('returns exit code 1 and writes back every file when an id is registered for another package', () => {
    // image-one ships two-b.webp as image-one-two-b.webp; image-one-two's b.webp has the same id.
    repo.publish('image-one-two', '1.0.0', [{file: 'b.webp'}]);
    const before = repo.snapshot();

    expect(add('image-one-two@1.0.0', '--name', 'One Two')).toBe(1);
    expect(output.join('\n')).toContain('Item id image-one-two-b.webp is already registered for image-one in image-registry.lock.json.');
    expect(repo.snapshot()).toEqual(before);
    expect(repo.exists('node_modules/image-one-two')).toBe(false);
  });

  it('returns exit code 1 and writes back every file when npm install fails', () => {
    const before = repo.snapshot();

    expect(add('image-unpublished@1.0.0', '--name', 'Unpublished')).toBe(1);
    const text = output.join('\n');
    expect(text).toContain('npm error 404');
    expect(text).toContain('refused: npm install image-unpublished@1.0.0 --save-exact failed (exit code 1).');
    expect(repo.snapshot()).toEqual(before);
  });
});
