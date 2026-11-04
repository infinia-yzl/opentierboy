import LZString from 'lz-string';
import {afterEach, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {removeImageSet} from '@/scripts/remove-image-set.mjs';
import {createImageSetRepo, type ImageSetRepo, tinyImages} from '../support/image-set-repo';

/**
 * Runs scripts/remove-image-set.mjs in a temporary repository (tests/unit/support/image-set-repo.ts)
 * with two active sets and one legacy set. npm uninstall and npm run check are made up;
 * prepareImages and check-image-registry.mjs run for real.
 */
let images: Awaited<ReturnType<typeof tinyImages>>;
let repo: ImageSetRepo;
let output: string[];

const OLD_ENTRY = {
  displayName: 'Old Times',
  images: [{filename: 'x.webp', label: 'X.WEBP', tags: ['all-of-them']}],
  tags: {'all-of-them': {title: 'All of them', description: 'Every image', category: 'general'}},
  legacy: true,
};

const DEPENDABOT = `version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    ignore:
      - dependency-name: "lz-string"
      # The legacy image sets are frozen.
      - dependency-name: "image-old"
    cooldown:
      default-days: 7
`;

const LINKS = `import legacyConfig from '@/imageset.legacy.json';

export const LEGACY_SETS = [
  {packageName: 'image-old', displayName: 'Old Times', slug: 'old-times', tag: 'all-of-them', tagPath: 'all-of-them', tagTitle: 'All of them'},
] as const;

export const OTHER = [{packageName: 'image-old'}];
`;

const PAGE = `const FEATURED_SETS = {
  "image-one": ["all", "all-of-them"],
  // Add more packages and their featured sets here
};
`;

const remove = (...argv: string[]) => removeImageSet({
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
  repo.installPackage('image-one', '1.0.0', [{file: 'a.webp'}, {file: 'b.webp'}]);
  repo.installPackage('image-two', '1.1.0', [{file: 'c.webp'}]);
  repo.installPackage('image-old', '2.0.0', [{file: 'x.webp'}]);
  repo.write('imageset.custom.json', {packages: {'image-one': {displayName: 'One'}, 'image-old': {legacy: true}, 'image-two': {displayName: 'Two', googleFont: 'Saira'}}});
  repo.write('imageset.legacy.json', {'image-old': OLD_ENTRY});
  repo.write('.github/dependabot.yml', DEPENDABOT);
  repo.write('tests/support/links.ts', LINKS);
  repo.write('app/page.tsx', PAGE);
  expect(repo.prepare().status).toBe(0);
  expect(repo.checkImages('--update').status).toBe(0);
  // Renamed images: old ids that shipped once, with aliases to the current ids.
  const lock = repo.readJson('image-registry.lock.json');
  repo.write('image-registry.lock.json', {
    ...lock,
    'image-old-was.webp': {package: 'image-old', filename: 'was.webp', label: 'Was'},
    'image-two-was.webp': {package: 'image-two', filename: 'was.webp', label: 'Was'},
  });
  repo.write('image-aliases.json', {'image-old-was.webp': 'image-old-x.webp', 'image-two-was.webp': 'image-two-c.webp'});
  expect(repo.checkImages().status).toBe(0);
  // Tests and fixtures that use the legacy set, one of them only inside a compressed link.
  repo.write('tests/e2e/old.spec.ts', "test('renders Old Times when /rank/old-times opens', async () => {});\n");
  repo.write('tests/fixtures/state/links.json', [{id: 'v3-1', state: `3.${LZString.compressToEncodedURIComponent(JSON.stringify({r: [['s', 'S', ['image-old-x.webp']]]}))}`}]);
  repo.write('tests/e2e/one.spec.ts', "test('renders One when image-one-a.webp is ranked', async () => {});\n");
  repo.write('tests/e2e/unrelated.spec.ts', "test('renders image-old-school when image-oldest is a name', async () => {});\n");
  repo.calls.length = 0;
});

afterEach(() => {
  repo.remove();
});

describe('scripts/remove-image-set.mjs', () => {
  it.each(['image-old', 'image-one'])('writes no file and runs nothing when %s is removed without --yes', (packageName) => {
    const before = repo.snapshot();

    expect(remove(packageName)).toBe(0);
    const text = output.join('\n');
    expect(text).toContain('WARNING: OpenTierBoy never removes a shipped image set.');
    expect(text).toContain(`Dry run: nothing changed. Run again with --yes to remove ${packageName}.`);
    expect(repo.calls).toEqual([]);
    expect(repo.snapshot()).toEqual(before);
  });

  it('writes the removal of the legacy set to every file when image-old is removed with --yes', () => {
    const before = {
      dependabot: repo.read('.github/dependabot.yml'),
      links: repo.read('tests/support/links.ts'),
      page: repo.read('app/page.tsx'),
      lock: repo.readJson('image-registry.lock.json'),
    };

    expect(remove('image-old', '--yes')).toBe(0);
    const text = output.join('\n');
    expect(repo.calls.filter((call) => call.command === 'npm').map((call) => call.args.slice(0, 2))).toEqual([['uninstall', 'image-old'], ['run', 'check']]);
    expect(repo.readJson('package.json').dependencies).toEqual({'image-one': '1.0.0', 'image-two': '1.1.0'});
    expect(repo.exists('node_modules/image-old')).toBe(false);
    expect(repo.exists('public/images/image-old')).toBe(false);

    expect(repo.readJson('imageset.custom.json')).toEqual({packages: {'image-one': {displayName: 'One'}, 'image-two': {displayName: 'Two', googleFont: 'Saira'}}});
    expect(repo.readJson('imageset.legacy.json')).toEqual({});
    expect(Object.keys(repo.readJson('imageset.config.json').packages)).toEqual(['image-one', 'image-two']);
    const lock = repo.readJson('image-registry.lock.json');
    expect(Object.keys(lock)).toEqual(Object.keys(before.lock).filter((id) => !id.startsWith('image-old-')));
    expect(repo.readJson('image-aliases.json')).toEqual({'image-two-was.webp': 'image-two-c.webp'});
    // Only the one line goes; the rest of each text file stays byte for byte.
    expect(repo.read('.github/dependabot.yml')).toBe(before.dependabot.replace('      - dependency-name: "image-old"\n', ''));
    expect(repo.read('tests/support/links.ts')).toBe(before.links.replace(/^ {2}\{packageName: 'image-old'.*\n/m, ''));
    expect(repo.read('app/page.tsx')).toBe(before.page);

    expect(text).toContain('These files under tests/ still name image-old');
    expect(text).toContain('  tests/e2e/old.spec.ts (1)');
    expect(text).toContain('  tests/fixtures/state/links.json (1)');
    expect(text).toContain('  tests/support/links.ts (1)');
    expect(text).not.toContain('one.spec.ts');
    expect(text).not.toContain('unrelated.spec.ts');
    expect(text).toContain('npm run check passed.');
    expect(repo.checkImages().status).toBe(0);
  });

  it('writes the removal of the active set and its landing page card when image-one is removed with --yes', () => {
    const before = repo.snapshot();

    expect(remove('image-one', '--yes')).toBe(0);
    expect(repo.readJson('imageset.custom.json')).toEqual({packages: {'image-old': {legacy: true}, 'image-two': {displayName: 'Two', googleFont: 'Saira'}}});
    expect(repo.read('app/page.tsx')).toBe(PAGE.replace('  "image-one": ["all", "all-of-them"],\n', ''));
    expect(Object.keys(repo.readJson('image-registry.lock.json')).filter((id) => id.startsWith('image-one-'))).toEqual([]);
    expect(Object.keys(repo.readJson('imageset.config.json').packages)).toEqual(['image-old', 'image-two']);
    expect(repo.exists('node_modules/image-one')).toBe(false);
    // The legacy set's files stay as they were.
    for (const file of ['imageset.legacy.json', 'image-aliases.json', '.github/dependabot.yml', 'tests/support/links.ts']) {
      expect(repo.snapshot()[file], file).toBe(before[file]);
    }
    expect(output.join('\n')).toContain('  tests/e2e/one.spec.ts (1)');
    expect(repo.checkImages().status).toBe(0);
  });

  it('returns exit code 1 and writes no file when the legacy set is missing from the Dependabot ignore list', () => {
    repo.write('.github/dependabot.yml', DEPENDABOT.replace('      - dependency-name: "image-old"\n', ''));
    const before = repo.snapshot();

    expect(remove('image-old', '--yes')).toBe(1);
    expect(output.join('\n')).toContain('refused: .github/dependabot.yml: expected exactly one line for image-old in the npm ignore list, found 0. Edit it by hand.');
    expect(repo.calls).toEqual([]);
    expect(repo.snapshot()).toEqual(before);
  });

  it('returns exit code 1 when npm run check fails after the removal', () => {
    const exec = repo.exec;
    const failingCheck = (command: string, args: string[], options: {cwd: string}) =>
      command === 'npm' && args[0] === 'run' ? {status: 1, output: 'FAIL tests/e2e/old.spec.ts'} : exec(command, args, options);

    expect(removeImageSet({root: repo.root, argv: ['image-old', '--yes'], exec: failingCheck, log: (line: string) => output.push(line), error: (line: string) => output.push(line)})).toBe(1);
    const text = output.join('\n');
    expect(text).toContain('FAIL tests/e2e/old.spec.ts');
    expect(text).toContain('npm run check failed (exit code 1).');
    expect(repo.readJson('imageset.legacy.json')).toEqual({});
  });
});
