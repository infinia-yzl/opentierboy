import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import lock from '@/image-registry.lock.json';
import imagesetConfig from '@/imageset.config.json';
import sharedLinks from '../../fixtures/shared-links.json';
import {decodeState} from '@/lib/state';

const repoRoot = path.resolve(__dirname, '../../..');
const script = path.join(repoRoot, 'scripts/check-image-registry.mjs');

function run(root: string | undefined, ...args: string[]) {
  const result = spawnSync(process.execPath, [script, ...(root ? ['--root', root] : []), ...args], {encoding: 'utf8'});
  return {status: result.status, output: `${result.stdout}${result.stderr}`};
}

describe('image registry in this repository', () => {
  it('passes the check', () => {
    const result = run(undefined);
    expect(result.output).toContain('Image registry OK');
    expect(result.status).toBe(0);
  });

  it('registers every shipped item id', () => {
    const packages = (imagesetConfig as {packages: Record<string, {images: {filename: string}[]}>}).packages;
    const shipped = Object.entries(packages).flatMap(([name, data]) => data.images.map(image => `${name}-${image.filename}`));
    expect(shipped.length).toBeGreaterThanOrEqual(430);
    for (const id of shipped) expect(lock, id).toHaveProperty([id]);
  });

  it('registers every package item id used by the golden links', () => {
    const stateDir = path.resolve(__dirname, '../../fixtures/state');
    const states = [
      ...sharedLinks.map(link => link.state),
      ...fs.readdirSync(stateDir).filter(file => file.endsWith('.json'))
        .flatMap(file => (JSON.parse(fs.readFileSync(path.join(stateDir, file), 'utf8')) as {state: string}[]).map(entry => entry.state)),
    ];
    const packageNames = Object.keys((imagesetConfig as {packages: object}).packages);
    let packageIds = 0;
    for (const state of states) {
      for (const tier of decodeState(state)!.tiers) {
        for (const item of tier.items) {
          if (!packageNames.some(name => item.id.startsWith(`${name}-`))) continue;
          packageIds++;
          expect(lock, item.id).toHaveProperty([item.id]);
        }
      }
    }
    expect(packageIds).toBeGreaterThan(1000);
  });
});

describe('scripts/check-image-registry.mjs', () => {
  let root: string;

  const write = (file: string, value: unknown) => fs.writeFileSync(path.join(root, file), JSON.stringify(value, null, 2) + '\n');
  const read = (file: string) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const config = (images: Record<string, string[]>) => ({
    packages: Object.fromEntries(Object.entries(images).map(([name, files]) => [name, {
      displayName: name,
      images: files.map(filename => ({filename, label: filename.split('.')[0].toUpperCase(), tags: []})),
      tags: {},
    }])),
  });

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'otb-registry-'));
    write('imageset.config.json', config({'image-a': ['one.webp', 'sub/two.webp'], 'image-b': ['three.webp']}));
    write('image-aliases.json', {});
  });

  afterEach(() => {
    fs.rmSync(root, {recursive: true, force: true});
  });

  it('asks for --update when the lock file is missing, and --update creates it', () => {
    expect(run(root).status).toBe(1);
    expect(run(root).output).toContain('npm run check:images -- --update');

    expect(run(root, '--update').status).toBe(0);
    expect(read('image-registry.lock.json')).toEqual({
      'image-a-one.webp': {package: 'image-a', filename: 'one.webp', label: 'ONE'},
      'image-a-sub/two.webp': {package: 'image-a', filename: 'sub/two.webp', label: 'SUB/TWO'},
      'image-b-three.webp': {package: 'image-b', filename: 'three.webp', label: 'THREE'},
    });
    expect(run(root).status).toBe(0);
  });

  it('fails on a new image until --update appends it, keeping existing entries as they were', () => {
    run(root, '--update');
    const before = read('image-registry.lock.json');
    write('imageset.config.json', config({'image-a': ['one.webp', 'sub/two.webp', 'four.webp'], 'image-b': ['three.webp']}));

    const check = run(root);
    expect(check.status).toBe(1);
    expect(check.output).toContain('New item id image-a-four.webp is not registered');

    expect(run(root, '--update').status).toBe(0);
    const after = read('image-registry.lock.json');
    expect(Object.keys(after)).toEqual([...Object.keys(before), 'image-a-four.webp']);
    for (const id of Object.keys(before)) expect(after[id]).toEqual(before[id]);
  });

  it('fails when a shipped id disappears, even with --update, and passes once an alias renames it', () => {
    run(root, '--update');
    write('imageset.config.json', config({'image-a': ['one.webp', 'sub/two-renamed.webp'], 'image-b': ['three.webp']}));

    const check = run(root, '--update');
    expect(check.status).toBe(1);
    expect(check.output).toContain('Item id image-a-sub/two.webp was shipped and is gone');
    expect(read('image-registry.lock.json')).toHaveProperty(['image-a-sub/two.webp']);

    write('image-aliases.json', {'image-a-sub/two.webp': 'image-a-sub/two-renamed.webp'});
    expect(run(root, '--update').status).toBe(0);
    expect(run(root).status).toBe(0);
  });

  it('follows alias chains to a shipped id', () => {
    run(root, '--update');
    write('imageset.config.json', config({'image-a': ['one.webp', 'sub/two-v3.webp'], 'image-b': ['three.webp']}));
    write('image-registry.lock.json', {
      ...read('image-registry.lock.json'),
      'image-a-sub/two-v2.webp': {package: 'image-a', filename: 'sub/two-v2.webp', label: 'TWO'},
    });
    write('image-aliases.json', {'image-a-sub/two.webp': 'image-a-sub/two-v2.webp', 'image-a-sub/two-v2.webp': 'image-a-sub/two-v3.webp'});
    expect(run(root, '--update').status).toBe(0);
  });

  it.each([
    ['loops', {'image-a-one.webp': 'image-a-x.webp', 'image-a-x.webp': 'image-a-one.webp'}, 'loops'],
    ['ends at an id that is not shipped', {'image-a-one.webp': 'image-a-nowhere.webp'}, 'which is not shipped'],
    ['renames an id that never shipped', {'image-z-never.webp': 'image-b-three.webp'}, 'is not a registered id'],
    ['renames an id that is still shipped', {'image-b-three.webp': 'image-a-sub/two.webp'}, 'is still shipped'],
  ])('rejects an alias that %s', (_name, aliases, message) => {
    run(root, '--update');
    write('imageset.config.json', config({'image-a': ['sub/two.webp'], 'image-b': ['three.webp']}));
    write('image-aliases.json', aliases);
    const check = run(root);
    expect(check.status).toBe(1);
    expect(check.output).toContain(message);
  });

  it('rejects a lock entry that does not describe its own id', () => {
    run(root, '--update');
    write('image-registry.lock.json', {
      ...read('image-registry.lock.json'),
      'image-b-three.webp': {package: 'image-b', filename: 'other.webp', label: 'THREE'},
    });
    const check = run(root);
    expect(check.status).toBe(1);
    expect(check.output).toContain('does not match its package and filename');
  });

  it('allows label changes and lists them', () => {
    run(root, '--update');
    const changed = config({'image-a': ['one.webp', 'sub/two.webp'], 'image-b': ['three.webp']});
    changed.packages['image-b'].images[0].label = 'Three (new name)';
    write('imageset.config.json', changed);
    const check = run(root);
    expect(check.status).toBe(0);
    expect(check.output).toContain('image-b-three.webp: "THREE" -> "Three (new name)"');
  });
});
