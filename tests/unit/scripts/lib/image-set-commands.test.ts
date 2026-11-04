import fs from 'node:fs';
import path from 'node:path';
import LZString from 'lz-string';
import {describe, expect, it} from 'vitest';
import {
  checkAdd,
  countMentions,
  decodedStates,
  EXACT_VERSION,
  fontNames,
  jsonText,
  newEntryProblems,
  parseAddArgs,
  parseRemoveArgs,
  planRemoval,
  REMOVE_FILES,
  removeOneLine,
  withCustomEntry,
} from '@/scripts/lib/image-set-commands.mjs';
import {VERSION_PATTERN} from '@/scripts/image-set-update.mjs';

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepo = (file: string) => fs.readFileSync(path.join(repoRoot, file), 'utf8');

/** The error a call throws, for checking its code and message. */
function thrown(call: () => unknown): {name?: string; code?: string; message: string} {
  try {
    call();
  } catch (error) {
    return error as {name?: string; code?: string; message: string};
  }
  throw new Error('expected the call to throw');
}

const customConfig = {packages: {
  'image-one': {displayName: 'THE ONE', googleFont: 'Saira'},
  'image-old': {legacy: true},
}};
const legacyConfig = {'image-old': {displayName: 'Old Times', images: [{filename: 'x.webp'}], tags: {}, legacy: true}};
const context = {customConfig, legacyConfig, fonts: ['Saira', 'Russo One'], isPublicFile: (file: string) => file === '/splash/new-bg.webp'};
const request = {packageName: 'image-new', version: '1.0.0', displayName: 'New Game'};

describe('parseAddArgs', () => {
  it.each([
    [['image-new@1.2.3', '--name', 'New Game'], {packageName: 'image-new', version: '1.2.3', displayName: 'New Game'}],
    [['--name=New Game', 'image-new@0.0.1'], {packageName: 'image-new', version: '0.0.1', displayName: 'New Game'}],
    [['image-new@1.0.0', '--name', 'N', '--font', 'Saira', '--background', '/splash/n.webp'], {packageName: 'image-new', version: '1.0.0', displayName: 'N', googleFont: 'Saira', backgroundImage: '/splash/n.webp'}],
  ])('returns the request when the arguments are %j', (argv, expected) => {
    expect(parseAddArgs(argv)).toEqual(expected);
  });

  it.each([
    ['no package is given', ['--name', 'X'], 'usage'],
    ['two packages are given', ['image-a@1.0.0', 'image-b@1.0.0', '--name', 'X'], 'usage'],
    ['an option is unknown', ['image-a@1.0.0', '--name', 'X', '--force'], 'usage'],
    ['--name has no value', ['image-a@1.0.0', '--name'], 'usage'],
    ['--name is followed by another option', ['image-a@1.0.0', '--name', '--font', 'Saira'], 'usage'],
    ['the name does not start with image-', ['overwatch@1.0.0', '--name', 'X'], 'package-name'],
    ['the name has capitals', ['image-Over@1.0.0', '--name', 'X'], 'package-name'],
    ['the name is scoped', ['@me/image-a@1.0.0', '--name', 'X'], 'package-name'],
    ['the name has a double dash', ['image--a@1.0.0', '--name', 'X'], 'package-name'],
    ['no version is given', ['image-a', '--name', 'X'], 'version'],
    ['the version has two parts', ['image-a@1.0', '--name', 'X'], 'version'],
    ['the version is a range', ['image-a@^1.0.0', '--name', 'X'], 'version'],
    ['the version is a tag', ['image-a@latest', '--name', 'X'], 'version'],
    ['the version is a pre-release', ['image-a@1.0.0-beta.1', '--name', 'X'], 'version'],
    ['the version starts with v', ['image-a@v1.0.0', '--name', 'X'], 'version'],
    ['the version has a leading zero', ['image-a@01.0.0', '--name', 'X'], 'version'],
    ['--name is missing', ['image-a@1.0.0'], 'display-name'],
  ])('throws code %s when %s', (_name, argv, code) => {
    expect(thrown(() => parseAddArgs(argv))).toMatchObject({name: 'ImageSetCommandError', code});
  });
});

describe('parseRemoveArgs', () => {
  it('returns yes: false when --yes is left out, and yes: true when it is given', () => {
    expect(parseRemoveArgs(['image-old'])).toEqual({packageName: 'image-old', yes: false});
    expect(parseRemoveArgs(['--yes', 'image-old'])).toEqual({packageName: 'image-old', yes: true});
  });

  it.each([
    ['no package is given', ['--yes'], 'usage'],
    ['an option is unknown', ['image-old', '--force'], 'usage'],
    ['--yes has a value', ['image-old', '--yes=no'], 'usage'],
    ['the name is not an image set name', ['lz-string'], 'package-name'],
  ])('throws code %s when %s', (_name, argv, code) => {
    expect(thrown(() => parseRemoveArgs(argv))).toMatchObject({code});
  });
});

describe('EXACT_VERSION', () => {
  it('returns the VERSION_PATTERN result of image-set-update.mjs when given plain and odd versions', () => {
    for (const version of ['0.0.0', '1.2.3', '10.20.30', '999999999.0.0', '1000000000.0.0', '01.2.3', '1.2', '1.2.3.4', 'v1.2.3', '1.2.3-rc.1', '1.2.3+b', '^1.2.3', '', ' 1.2.3']) {
      expect(EXACT_VERSION.test(version), version).toBe(VERSION_PATTERN.test(version));
    }
  });
});

describe('fontNames', () => {
  it('returns the fonts of fontDefinitions when lib/fonts.ts is read', () => {
    expect(fontNames(readRepo('lib/fonts.ts'))).toEqual(['Saira', 'Cinzel', 'Russo One', 'Chakra Petch']);
  });

  it('returns [] when the text has no fontDefinitions object', () => {
    expect(fontNames('export const x = 1;')).toEqual([]);
  });
});

describe('checkAdd', () => {
  it('returns the slug and the imageset.custom.json entry when the request passes every check', () => {
    expect(checkAdd(request, context)).toEqual({slug: 'new-game', custom: {displayName: 'New Game'}});
    expect(checkAdd({...request, googleFont: 'Russo One', backgroundImage: '/splash/new-bg.webp'}, context)).toEqual({
      slug: 'new-game',
      custom: {displayName: 'New Game', googleFont: 'Russo One', backgroundImage: '/splash/new-bg.webp'},
    });
  });

  it.each([
    ['the set is active already', {packageName: 'image-one'}, 'listed', 'image-one is already an active set'],
    ['the set is legacy', {packageName: 'image-old'}, 'listed', 'image-old is already a legacy set'],
    ['the set has only a frozen entry', {packageName: 'image-frozen'}, 'listed', 'image-frozen has a frozen entry in imageset.legacy.json'],
    ['the name is not image-*', {packageName: 'other'}, 'package-name', 'must start with "image-"'],
    ['the version is a range', {version: '~1.0.0'}, 'version', 'is not an exact x.y.z version'],
    ['the display name is empty', {displayName: ' '}, 'display-name', '--name must be a display name'],
    ['the display name ends with a space', {displayName: 'New '}, 'display-name', 'without control characters or spaces at either end'],
    ['the display name has a zero-width space', {displayName: 'Ne​w'}, 'display-name', 'without control characters'],
    ['the display name is too long', {displayName: 'x'.repeat(65)}, 'display-name', 'at most 64 visible characters'],
    ['the display name has no URL form', {displayName: '日本'}, 'display-name', 'has no URL form'],
    ['the slug is an active set\'s', {displayName: 'The One'}, 'slug-taken', 'makes the URL slug "the-one", which image-one ("THE ONE") already uses'],
    ['the slug is a legacy set\'s', {displayName: 'OLD TIMES'}, 'slug-taken', 'which image-old ("Old Times") already uses'],
    ['the slug is another package name', {displayName: 'Image One'}, 'slug-taken', 'makes the URL slug "image-one", which image-one'],
    ['the package name is another set\'s slug', {packageName: 'image-x', displayName: 'X'}, 'slug-taken', 'The package name image-x is the URL slug of image-x2'],
    ['the font is not loaded', {googleFont: 'Arial'}, 'font', 'is not a font lib/fonts.ts loads (Saira, Russo One)'],
    ['the background is not in public/', {backgroundImage: '/splash/missing.webp'}, 'background', 'must be the path of an image file in public/'],
    ['the background leaves public/', {backgroundImage: '/../secret.webp'}, 'background', 'must be the path of an image file in public/'],
    ['the background is not an image', {backgroundImage: '/splash/new-bg.svg'}, 'background', 'must be the path of an image file in public/'],
  ])('throws code %s when %s', (_name, change, code, message) => {
    const withOther = {
      ...context,
      customConfig: {packages: {...customConfig.packages, 'image-x2': {displayName: 'Image X'}}},
      legacyConfig: {...legacyConfig, 'image-frozen': legacyConfig['image-old']},
    };
    const error = thrown(() => checkAdd({...request, ...change}, withOther));
    expect(error).toMatchObject({name: 'ImageSetCommandError', code});
    expect(error.message).toContain(message);
  });

  it('returns a slug only when it differs from the slug of every set of this repository', () => {
    const repoContext = {customConfig: JSON.parse(readRepo('imageset.custom.json')), legacyConfig: JSON.parse(readRepo('imageset.legacy.json'))};
    expect(thrown(() => checkAdd({...request, displayName: 'Helldivers  2'}, repoContext)).code).toBe('slug-taken');
    expect(thrown(() => checkAdd({...request, displayName: 'The Finals'}, repoContext)).code).toBe('slug-taken');
    expect(checkAdd({...request, displayName: 'DEADLOCK'}, repoContext).slug).toBe('deadlock');
  });
});

describe('withCustomEntry', () => {
  it('returns imageset.custom.json with the new set last and the others unchanged when given an entry', () => {
    const before = JSON.stringify(customConfig);
    const after = withCustomEntry(customConfig, 'image-new', {displayName: 'New'});
    expect(Object.keys(after.packages)).toEqual(['image-one', 'image-old', 'image-new']);
    expect(after.packages['image-new']).toEqual({displayName: 'New'});
    expect(JSON.stringify(customConfig)).toBe(before);
    expect(jsonText(after)).toBe(`${JSON.stringify(after, null, 2)}\n`);
  });
});

describe('newEntryProblems', () => {
  const entry = (images: object[], tags: object = {all: {title: 'All', description: 'All', category: 'general'}}) => ({displayName: 'New', images, tags});
  const config = (newEntry: object) => ({packages: {'image-one': entry([{filename: 'two-a.webp', label: 'A', tags: []}]), 'image-new': newEntry}});

  it('returns [] when the entry is square and its ids are new', () => {
    expect(newEntryProblems('image-new', config(entry([{filename: 'a.webp', label: 'A', tags: ['all']}])), {})).toEqual([]);
  });

  it('returns a line for each image and category with a shape when the package declares shapes', () => {
    const shaped = entry([{filename: 'a.webp', label: 'A', tags: ['tall'], shape: 'landscape'}], {tall: {title: 'T', description: 'T', category: 'general', shape: 'portrait'}});
    expect(newEntryProblems('image-new', config(shaped), {})).toEqual([
      'Image a.webp has the shape "landscape". Image sets must not publish shapes other than square yet (tests/unit/rules/image-shapes.test.ts).',
      'Category tall has the shape "portrait". Image sets must not publish shapes other than square yet (tests/unit/rules/image-shapes.test.ts).',
    ]);
  });

  it('returns a line for each id that another package registered or ships when ids collide', () => {
    // image-one ships two-a.webp as image-one-two-a.webp; image-one-two's a.webp has the same id.
    const colliding = {packages: {'image-one': entry([{filename: 'two-a.webp', label: 'A', tags: []}]), 'image-one-two': entry([{filename: 'a.webp', label: 'A', tags: []}, {filename: 'b.webp', label: 'B', tags: []}])}};
    expect(newEntryProblems('image-one-two', colliding, {'image-one-two-b.webp': {package: 'image-one', filename: 'two-b.webp', label: 'B'}})).toEqual([
      'Item id image-one-two-a.webp is already shipped by image-one.',
      'Item id image-one-two-b.webp is already registered for image-one in image-registry.lock.json.',
    ]);
    expect(newEntryProblems('image-one-two', colliding, {'image-one-two-a.webp': {package: 'image-one-two', filename: 'a.webp', label: 'A'}})).toEqual(['Item id image-one-two-a.webp is already shipped by image-one.']);
  });

  it('returns a line when imageset.config.json has no entry for the set', () => {
    expect(newEntryProblems('image-new', {packages: {}}, {})).toEqual(['imageset.config.json has no entry for image-new.']);
  });
});

describe('removeOneLine', () => {
  const text = 'a\nlist = [\n  one,\n  two,\n]\none,\n';

  it('returns the text without the line when exactly one line in the block matches', () => {
    expect(removeOneLine(text, /^\s*one,$/, {file: 'f', what: 'one', within: /^list = \[/})).toEqual({text: 'a\nlist = [\n  two,\n]\none,\n', line: '  one,'});
  });

  it('throws code line when two lines match and no block is given', () => {
    expect(thrown(() => removeOneLine(text, /^\s*one,$/, {file: 'f', what: 'one'})).message).toBe('f: expected exactly one line for one, found 2. Edit it by hand.');
  });

  it('throws code line when a required line is missing, and returns the text unchanged when it is optional', () => {
    expect(thrown(() => removeOneLine(text, /three/, {file: 'f', what: 'three'})).code).toBe('line');
    expect(removeOneLine(text, /three/, {file: 'f', what: 'three', required: false})).toEqual({text, line: undefined});
  });

  it('throws code line when the block start is missing or the line has more lines under it', () => {
    expect(thrown(() => removeOneLine(text, /one/, {file: 'f', what: 'one', within: /^other = \[/})).code).toBe('line');
    const yaml = '    ignore:\n      - dependency-name: "image-a"\n        versions: [">=2"]\n      - dependency-name: "image-b"\n';
    expect(thrown(() => removeOneLine(yaml, /image-a/, {file: 'f', what: 'image-a', noContinuation: true})).message).toBe('f: the line for image-a has more lines under it. Edit it by hand.');
    expect(removeOneLine(yaml, /image-b/, {file: 'f', what: 'image-b', noContinuation: true}).line).toBe('      - dependency-name: "image-b"');
  });
});

describe('planRemoval', () => {
  const lock = {
    'image-one-a.webp': {package: 'image-one', filename: 'a.webp', label: 'A'},
    'image-old-x.webp': {package: 'image-old', filename: 'x.webp', label: 'X'},
    'image-old-was.webp': {package: 'image-old', filename: 'was.webp', label: 'Was'},
    'image-one-was.webp': {package: 'image-one', filename: 'was.webp', label: 'Was'},
    'image-one-moved.webp': {package: 'image-one', filename: 'moved.webp', label: 'Moved'},
  };
  const files = (changes: Record<string, string | undefined> = {}) => ({
    [REMOVE_FILES.custom]: jsonText(customConfig),
    [REMOVE_FILES.legacy]: jsonText(legacyConfig),
    [REMOVE_FILES.lock]: jsonText(lock),
    [REMOVE_FILES.aliases]: jsonText({'image-old-was.webp': 'image-old-x.webp', 'image-one-was.webp': 'image-one-a.webp', 'image-one-moved.webp': 'image-old-x.webp'}),
    [REMOVE_FILES.dependabot]: '    ignore:\n      - dependency-name: "lz-string"\n      - dependency-name: "image-old"\n    cooldown:\n',
    [REMOVE_FILES.links]: "export const LEGACY_SETS = [\n  {packageName: 'image-old', slug: 'old-times'},\n] as const;\n",
    [REMOVE_FILES.page]: 'const FEATURED_SETS = {\n  "image-one": ["all"],\n};\n',
    'imageset.config.json': jsonText({packages: {'image-one': {images: [{filename: 'a.webp'}]}, 'image-old': {images: [{filename: 'x.webp'}]}}}),
    'package.json': jsonText({dependencies: {'image-one': '1.0.0', 'image-old': '2.0.0'}}),
    ...changes,
  });
  const changed = (plan: {changes: {file: string; text: string}[]}) => Object.fromEntries(plan.changes.map((change) => [change.file, change.text]));

  it('returns the changes of every file of a legacy set when image-old is planned', () => {
    const plan = planRemoval('image-old', files());
    expect(plan).toMatchObject({packageName: 'image-old', legacy: true, displayName: 'Old Times', slug: 'old-times', uninstall: true});
    expect(plan.ids).toEqual(['image-old-x.webp', 'image-old-was.webp']);
    const texts = changed(plan);
    expect(Object.keys(texts)).toEqual([REMOVE_FILES.custom, REMOVE_FILES.legacy, REMOVE_FILES.lock, REMOVE_FILES.aliases, REMOVE_FILES.dependabot, REMOVE_FILES.links]);
    expect(JSON.parse(texts[REMOVE_FILES.custom])).toEqual({packages: {'image-one': customConfig.packages['image-one']}});
    expect(JSON.parse(texts[REMOVE_FILES.legacy])).toEqual({});
    expect(Object.keys(JSON.parse(texts[REMOVE_FILES.lock]))).toEqual(['image-one-a.webp', 'image-one-was.webp', 'image-one-moved.webp']);
    expect(texts[REMOVE_FILES.dependabot]).toBe('    ignore:\n      - dependency-name: "lz-string"\n    cooldown:\n');
    expect(texts[REMOVE_FILES.links]).toBe('export const LEGACY_SETS = [\n] as const;\n');
  });

  it('returns the aliases from and to its ids as removed, with a note for an alias from another set, when image-old is planned', () => {
    const plan = planRemoval('image-old', files());
    expect(JSON.parse(changed(plan)[REMOVE_FILES.aliases])).toEqual({'image-one-was.webp': 'image-one-a.webp'});
    expect(plan.changes.find((change) => change.file === REMOVE_FILES.aliases)?.summary).toEqual([
      'remove the alias image-old-was.webp -> image-old-x.webp',
      'remove the alias image-one-moved.webp -> image-old-x.webp',
    ]);
    expect(plan.notes).toEqual([expect.stringContaining('The alias from image-one-moved.webp pointed into image-old.')]);
  });

  it('returns the FEATURED_SETS line among the changes of an active set when image-one is planned', () => {
    const plan = planRemoval('image-one', files());
    expect(plan).toMatchObject({legacy: false, displayName: 'THE ONE', slug: 'the-one'});
    const texts = changed(plan);
    expect(Object.keys(texts)).toEqual([REMOVE_FILES.custom, REMOVE_FILES.lock, REMOVE_FILES.aliases, REMOVE_FILES.page]);
    expect(texts[REMOVE_FILES.page]).toBe('const FEATURED_SETS = {\n};\n');
    expect(JSON.parse(texts[REMOVE_FILES.aliases])).toEqual({'image-old-was.webp': 'image-old-x.webp'});
  });

  it('returns no app/page.tsx change and a note when the active set has no card and is not a dependency', () => {
    const plan = planRemoval('image-one', files({[REMOVE_FILES.page]: 'const FEATURED_SETS = {\n};\n', 'package.json': jsonText({dependencies: {}})}));
    expect(plan.changes.map((change) => change.file)).not.toContain(REMOVE_FILES.page);
    expect(plan.uninstall).toBe(false);
    expect(plan.notes).toEqual(['image-one is not a dependency in package.json, so nothing is uninstalled.']);
  });

  it.each([
    ['the set is not listed', 'image-none', {}, 'not-listed'],
    ['the legacy set is not in the Dependabot ignore list', 'image-old', {[REMOVE_FILES.dependabot]: '    ignore:\n'}, 'line'],
    ['the legacy set\'s Dependabot entry has more keys', 'image-old', {[REMOVE_FILES.dependabot]: '      - dependency-name: "image-old"\n        versions: [">=3"]\n'}, 'line'],
    ['the legacy set is not in LEGACY_SETS', 'image-old', {[REMOVE_FILES.links]: 'export const LEGACY_SETS = [\n] as const;\n'}, 'line'],
    ['tests/support/links.ts is missing', 'image-old', {[REMOVE_FILES.links]: undefined}, 'line'],
    ['the active set has two FEATURED_SETS lines', 'image-one', {[REMOVE_FILES.page]: 'const FEATURED_SETS = {\n  "image-one": ["a"],\n  "image-one": ["b"],\n};\n'}, 'line'],
    ['a file is not JSON', 'image-one', {[REMOVE_FILES.lock]: '{'}, 'usage'],
  ])('throws code %s when %s', (_name, packageName, changes, code) => {
    expect(thrown(() => planRemoval(packageName, files(changes)))).toMatchObject({name: 'ImageSetCommandError', code});
  });

  it('returns a plan for every set when the files of this repository are read', () => {
    const repoFiles = Object.fromEntries([...Object.values(REMOVE_FILES), 'imageset.config.json', 'package.json'].map((file) => [file, readRepo(file)]));
    const packages = Object.keys(JSON.parse(readRepo('imageset.custom.json')).packages);
    expect(packages).toHaveLength(7);
    for (const packageName of packages) {
      const plan = planRemoval(packageName, repoFiles);
      expect(plan.ids.length, packageName).toBeGreaterThan(0);
      expect(plan.uninstall, packageName).toBe(true);
      // Every edit removes exactly one line of the text file.
      for (const change of plan.changes.filter((item) => !item.file.endsWith('.json'))) {
        expect(change.text.split('\n').length, `${packageName} ${change.file}`).toBe(repoFiles[change.file]!.split('\n').length - 1);
      }
      expect(plan.changes.some((change) => change.file === REMOVE_FILES.dependabot), packageName).toBe(plan.legacy);
    }
  });
});

describe('countMentions', () => {
  const names = {packageName: 'image-set', ids: ['image-set-hero1.webp'], slug: 'example-items-template'};

  it('returns the number of package names, ids and /rank paths when the text names the set', () => {
    expect(countMentions('"image-set" and image-set-hero1.webp at /rank/example-items-template/people and /rank/example-items-template?state=x', names)).toBe(4);
  });

  it('returns 0 when the text names only longer names that start the same', () => {
    expect(countMentions('scripts/image-set-update.mjs, image-set-hero2.webp, image-sets, /rank/example-items-template-2', names)).toBe(0);
  });
});

describe('decodedStates', () => {
  it('returns the decoded text of every state value when given fixtures in v3 and older formats', () => {
    const v3 = `3.${LZString.compressToEncodedURIComponent('{"r":[["s","S",["image-set-hero1.webp"]]]}')}`;
    const v0 = LZString.compressToEncodedURIComponent('[{"id":"s","items":[{"id":"image-set-hero1.webp"}]}]');
    const decoded = decodedStates([{state: v3}, {nested: {state: v0}}, {state: 42}, {other: v0}], LZString.decompressFromEncodedURIComponent);
    expect(decoded).toEqual(['{"r":[["s","S",["image-set-hero1.webp"]]]}', '[{"id":"s","items":[{"id":"image-set-hero1.webp"}]}]']);
  });

  it('returns [] when a state value does not decode', () => {
    expect(decodedStates([{state: ''}, {state: '!!'}], LZString.decompressFromEncodedURIComponent)).toEqual([]);
  });
});
