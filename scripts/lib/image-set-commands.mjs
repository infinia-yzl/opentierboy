/**
 * Pure helpers of the maintainer commands `npm run add-image-set` (scripts/add-image-set.mjs)
 * and `npm run remove-image-set` (scripts/remove-image-set.mjs): reading the arguments,
 * checking a request against the repository's files, and working out each file change as data.
 * No file access and no dependencies; the entry scripts read and write the files.
 *
 * Errors are plain Error objects with the name ImageSetCommandError and a `code`:
 *   usage           the arguments cannot be read
 *   package-name    not an image set package name (image-...)
 *   listed          add: the set is already in imageset.custom.json or imageset.legacy.json
 *   not-listed      remove: the set is not in imageset.custom.json
 *   version         not an exact x.y.z version
 *   display-name    --name is missing or not plain visible text
 *   slug-taken      the URL slug of the display name names another set already
 *   font            --font is not a font lib/fonts.ts loads
 *   background      --background is not an image file in public/
 *   line            a text file does not have exactly the one line the command edits
 */
import {displayFields, PACKAGE_NAME, setSlug} from './image-sets.mjs';

/** x.y.z without leading zeros, each part at most 9 digits: the rule of VERSION_PATTERN in scripts/image-set-update.mjs. */
export const EXACT_VERSION = /^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$/;
const MAX_PACKAGE_LENGTH = 64;
const MAX_DISPLAY_NAME = 64;
/** Unicode control (Cc) and format (Cf) characters. */
const HIDDEN_CHARACTERS = /[\p{Cc}\p{Cf}]/u;
/** A background image path the landing page card loads: a file under public/. */
const BACKGROUND_PATH = /^\/(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/)*[A-Za-z0-9_-][A-Za-z0-9._-]*\.(?:webp|png|jpe?g|avif)$/;

const has = (object, key) => object !== null && typeof object === 'object' && Object.prototype.hasOwnProperty.call(object, key);
const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

export function commandError(code, message) {
  const error = new Error(message);
  error.name = 'ImageSetCommandError';
  error.code = code;
  return error;
}

/** JSON text as the repository writes it: two-space indents and a final newline. */
export const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;

/** Reads `--flag value` and `--flag=value` options and positional arguments. Throws on an unknown flag. */
function readArgs(argv, valueFlags, booleanFlags) {
  const options = {};
  const positional = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const [flag, inline] = arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg, undefined];
    if (booleanFlags.includes(flag) && inline === undefined) {
      options[flag] = true;
    } else if (valueFlags.includes(flag)) {
      const value = inline ?? argv[index + 1];
      if (value === undefined || (inline === undefined && value.startsWith('--'))) throw commandError('usage', `${flag} needs a value.`);
      if (inline === undefined) index++;
      options[flag] = value;
    } else {
      throw commandError('usage', `Unknown option ${flag}.`);
    }
  }
  return {options, positional};
}

function checkPackageName(packageName) {
  if (typeof packageName !== 'string' || packageName.length > MAX_PACKAGE_LENGTH || !PACKAGE_NAME.test(packageName)) {
    throw commandError('package-name', `${JSON.stringify(String(packageName))} is not an image set package name: it must start with "image-" and hold only lowercase letters, digits and single dashes.`);
  }
}

export const ADD_USAGE = 'Usage: npm run add-image-set -- <package>@<x.y.z> --name "<Display Name>" [--font "<Google font>"] [--background /splash/<file>.webp]';
export const REMOVE_USAGE = 'Usage: npm run remove-image-set -- <package> [--yes]';

/** The arguments of add-image-set: {packageName, version, displayName, googleFont?, backgroundImage?}. Throws on bad input. */
export function parseAddArgs(argv) {
  const {options, positional} = readArgs(argv, ['--name', '--font', '--background'], []);
  if (positional.length !== 1) throw commandError('usage', `Give one package with its version. ${ADD_USAGE}`);
  const spec = positional[0];
  const at = spec.lastIndexOf('@');
  const packageName = at > 0 ? spec.slice(0, at) : spec;
  const version = at > 0 ? spec.slice(at + 1) : '';
  checkPackageName(packageName);
  if (!EXACT_VERSION.test(version)) {
    throw commandError('version', `Give the exact version as ${packageName}@x.y.z (got ${JSON.stringify(spec)}). No range, tag, "v", pre-release or "+build".`);
  }
  if (options['--name'] === undefined) throw commandError('display-name', `--name "<Display Name>" is missing. ${ADD_USAGE}`);
  return {
    packageName,
    version,
    displayName: options['--name'],
    ...(options['--font'] !== undefined && {googleFont: options['--font']}),
    ...(options['--background'] !== undefined && {backgroundImage: options['--background']}),
  };
}

/** The arguments of remove-image-set: {packageName, yes}. Throws on bad input. */
export function parseRemoveArgs(argv) {
  const {options, positional} = readArgs(argv, [], ['--yes']);
  if (positional.length !== 1) throw commandError('usage', `Give one package. ${REMOVE_USAGE}`);
  checkPackageName(positional[0]);
  return {packageName: positional[0], yes: options['--yes'] === true};
}

/**
 * The fonts lib/fonts.ts loads: the quoted keys of its `fontDefinitions` object. An active
 * set's googleFont must be one of them, or the landing page card has no font to use.
 */
export function fontNames(fontsSource) {
  const block = /const fontDefinitions = \{([^}]*)\}/.exec(String(fontsSource));
  if (!block) return [];
  return [...block[1].matchAll(/^\s*['"]([^'"]+)['"]\s*:/gm)].map((match) => match[1]);
}

/** The display name of every set in imageset.custom.json: from it for active sets, from imageset.legacy.json for legacy sets. */
function displayNames(customConfig, legacyConfig) {
  return Object.entries(customConfig.packages).map(([packageName, custom]) => ({
    packageName,
    displayName: custom?.legacy === true ? legacyConfig[packageName]?.displayName ?? packageName : displayFields(packageName, custom).displayName,
  }));
}

/**
 * Checks an add-image-set request against the repository's files. `fonts` are the fonts
 * lib/fonts.ts loads (fontNames); `isPublicFile(path)` tells whether public/<path> is a file.
 * Returns {slug, custom}: the URL slug and the new imageset.custom.json entry. Throws the first
 * refusal.
 *
 * @param {{packageName: string, version: string, displayName: string, googleFont?: string, backgroundImage?: string}} request
 * @param {{customConfig: any, legacyConfig: any, fonts?: string[], isPublicFile?: (publicPath: string) => boolean}} context
 */
export function checkAdd(request, {customConfig, legacyConfig, fonts = [], isPublicFile = () => false}) {
  const {packageName, version, displayName, googleFont, backgroundImage} = request;
  checkPackageName(packageName);
  if (!EXACT_VERSION.test(String(version))) throw commandError('version', `${JSON.stringify(String(version))} is not an exact x.y.z version.`);
  if (!isPlainObject(customConfig) || !isPlainObject(customConfig.packages)) throw commandError('usage', 'imageset.custom.json must be {"packages": {...}}.');
  if (!isPlainObject(legacyConfig)) throw commandError('usage', 'imageset.legacy.json must be an object of package name -> config entry.');
  if (has(customConfig.packages, packageName)) {
    throw commandError('listed', customConfig.packages[packageName]?.legacy === true
      ? `${packageName} is already a legacy set in imageset.custom.json. Legacy sets are frozen and never change.`
      : `${packageName} is already an active set in imageset.custom.json. Its new versions arrive through image-set-update.yml.`);
  }
  if (has(legacyConfig, packageName)) throw commandError('listed', `${packageName} has a frozen entry in imageset.legacy.json, so it is a legacy set and never comes back as an active set.`);

  if (typeof displayName !== 'string' || displayName.trim() === '') throw commandError('display-name', '--name must be a display name, for example --name "THE FINALS".');
  if (HIDDEN_CHARACTERS.test(displayName) || displayName !== displayName.trim() || [...displayName].length > MAX_DISPLAY_NAME) {
    throw commandError('display-name', `--name must be at most ${MAX_DISPLAY_NAME} visible characters, without control characters or spaces at either end.`);
  }
  const slug = setSlug(displayName);
  if (slug === '') throw commandError('display-name', `The display name ${JSON.stringify(displayName)} has no URL form: it needs letters or digits from A to Z or 0 to 9.`);
  for (const other of displayNames(customConfig, legacyConfig)) {
    if (setSlug(other.displayName) === slug || other.packageName === slug) {
      throw commandError('slug-taken', `The display name ${JSON.stringify(displayName)} makes the URL slug "${slug}", which ${other.packageName} ("${other.displayName}") already uses. Choose another display name.`);
    }
    if (setSlug(other.displayName) === packageName) {
      throw commandError('slug-taken', `The package name ${packageName} is the URL slug of ${other.packageName} ("${other.displayName}"), so /rank/${packageName} would open the new set instead.`);
    }
  }

  if (googleFont !== undefined && !fonts.includes(googleFont)) {
    throw commandError('font', `--font ${JSON.stringify(googleFont)} is not a font lib/fonts.ts loads (${fonts.join(', ') || 'none'}). Add the font there first, or leave --font out.`);
  }
  if (backgroundImage !== undefined && (!BACKGROUND_PATH.test(backgroundImage) || !isPublicFile(backgroundImage))) {
    throw commandError('background', `--background ${JSON.stringify(backgroundImage)} must be the path of an image file in public/, for example /splash/<file>.webp.`);
  }
  return {
    slug,
    custom: {displayName, ...(googleFont !== undefined && {googleFont}), ...(backgroundImage !== undefined && {backgroundImage})},
  };
}

/** imageset.custom.json with the new active set's entry at the end. */
export function withCustomEntry(customConfig, packageName, custom) {
  return {...customConfig, packages: {...customConfig.packages, [packageName]: custom}};
}

/**
 * The problems of a new set's entry in the imageset.config.json that prepareImages built, one
 * line each: no entry; images or categories with a shape other than square, while
 * tests/unit/rules/image-shapes.test.ts stands; ids that another package registered in
 * image-registry.lock.json or ships now (`image-a` with `b-c.webp` and `image-a-b` with `c.webp`
 * both make `image-a-b-c.webp`).
 */
export function newEntryProblems(packageName, config, lock) {
  const entry = config?.packages?.[packageName];
  if (!isPlainObject(entry) || !Array.isArray(entry.images)) return [`imageset.config.json has no entry for ${packageName}.`];
  const problems = [];
  for (const image of entry.images) {
    if (image?.shape !== undefined) problems.push(`Image ${image.filename} has the shape "${image.shape}". Image sets must not publish shapes other than square yet (tests/unit/rules/image-shapes.test.ts).`);
  }
  for (const [tag, data] of Object.entries(isPlainObject(entry.tags) ? entry.tags : {})) {
    if (data?.shape !== undefined) problems.push(`Category ${tag} has the shape "${data.shape}". Image sets must not publish shapes other than square yet (tests/unit/rules/image-shapes.test.ts).`);
  }
  const shippedBy = new Map();
  for (const [name, data] of Object.entries(config.packages)) {
    if (name === packageName) continue;
    for (const image of Array.isArray(data?.images) ? data.images : []) shippedBy.set(`${name}-${image?.filename}`, name);
  }
  for (const image of entry.images) {
    const id = `${packageName}-${image?.filename}`;
    const registered = isPlainObject(lock) && has(lock, id) ? lock[id]?.package : undefined;
    if (registered !== undefined && registered !== packageName) problems.push(`Item id ${id} is already registered for ${registered} in image-registry.lock.json.`);
    else if (shippedBy.has(id)) problems.push(`Item id ${id} is already shipped by ${shippedBy.get(id)}.`);
  }
  return problems;
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const indentOf = (line) => line.length - line.trimStart().length;

/**
 * Removes the one line of `text` that matches `pattern`. With `within`, only lines of the block
 * that starts at the one line matching `within` and ends at the first later line, at its indent
 * or less, that closes it (`]` or `}`) count. `required`: throw unless exactly one line matches;
 * otherwise no match changes nothing. More than one match always throws. With `noContinuation`,
 * also throws when the next line is indented deeper and is not a new list item (a YAML entry
 * with more keys). Returns {text, line} (line undefined when nothing changed).
 *
 * @param {string} text
 * @param {RegExp} pattern
 * @param {{file: string, what: string, within?: RegExp, required?: boolean, noContinuation?: boolean}} options
 */
export function removeOneLine(text, pattern, {file, what, within, required = true, noContinuation = false}) {
  const lines = text.split('\n');
  let start = 0;
  let end = lines.length;
  if (within) {
    const starts = lines.flatMap((line, index) => (within.test(line) ? [index] : []));
    if (starts.length !== 1) throw commandError('line', `${file}: expected one line matching ${within}, found ${starts.length}. Edit ${what} by hand.`);
    start = starts[0] + 1;
    const closing = lines.findIndex((line, index) => index >= start && /^\s*[\]}]/.test(line) && indentOf(line) <= indentOf(lines[starts[0]]));
    end = closing === -1 ? lines.length : closing;
  }
  const matches = [];
  for (let index = start; index < end; index++) if (pattern.test(lines[index])) matches.push(index);
  if (matches.length > 1 || (required && matches.length !== 1)) {
    throw commandError('line', `${file}: expected exactly one line for ${what}, found ${matches.length}. Edit it by hand.`);
  }
  if (matches.length === 0) return {text, line: undefined};
  const [index] = matches;
  if (noContinuation) {
    const next = lines.slice(index + 1).find((line) => line.trim() !== '');
    if (next !== undefined && indentOf(next) > indentOf(lines[index]) && !next.trim().startsWith('- ')) {
      throw commandError('line', `${file}: the line for ${what} has more lines under it. Edit it by hand.`);
    }
  }
  return {text: [...lines.slice(0, index), ...lines.slice(index + 1)].join('\n'), line: lines[index]};
}

/** The line patterns remove-image-set edits, for one package. */
export function linePatterns(packageName) {
  const name = escapeRegExp(packageName);
  return {
    dependabot: new RegExp(`^\\s*- dependency-name: (["']?)${name}\\1\\s*$`),
    legacySets: new RegExp(`^\\s*\\{packageName: '${name}',.*\\},?\\s*$`),
    featuredSets: new RegExp(`^\\s*["']?${name}["']?: \\[.*\\],?\\s*$`),
  };
}

/** Files remove-image-set may edit, by role. */
export const REMOVE_FILES = Object.freeze({
  custom: 'imageset.custom.json',
  legacy: 'imageset.legacy.json',
  lock: 'image-registry.lock.json',
  aliases: 'image-aliases.json',
  dependabot: '.github/dependabot.yml',
  links: 'tests/support/links.ts',
  page: 'app/page.tsx',
});

/**
 * What remove-image-set changes, as data. `files` holds the current text of each file of
 * REMOVE_FILES (undefined when missing) and package.json. Returns {packageName, legacy, slug,
 * ids, uninstall, changes: [{file, text, summary}], notes}: `text` is the new text of the file,
 * `ids` every item id of the set (registered or shipped). Throws when the set is not listed or
 * an edited line is not there exactly once.
 *
 * @param {string} packageName
 * @param {Record<string, string | undefined>} files
 */
export function planRemoval(packageName, files) {
  checkPackageName(packageName);
  const parse = (file) => {
    if (files[file] === undefined) return undefined;
    try {
      return JSON.parse(files[file]);
    } catch {
      throw commandError('usage', `${file} is not valid JSON.`);
    }
  };
  const custom = parse(REMOVE_FILES.custom);
  const legacyConfig = parse(REMOVE_FILES.legacy) ?? {};
  const lock = parse(REMOVE_FILES.lock) ?? {};
  const aliases = parse(REMOVE_FILES.aliases) ?? {};
  const config = parse('imageset.config.json') ?? {packages: {}};
  const packageJson = parse('package.json') ?? {};
  if (!isPlainObject(custom?.packages) || !has(custom.packages, packageName)) {
    throw commandError('not-listed', `${packageName} is not an image set in imageset.custom.json.`);
  }
  const legacy = custom.packages[packageName]?.legacy === true;
  const displayName = legacy ? legacyConfig[packageName]?.displayName : displayFields(packageName, custom.packages[packageName]).displayName;
  /** @type {{file: string, text: string, summary: string[]}[]} */
  const changes = [];
  /** @type {string[]} */
  const notes = [];
  const without = (object, keep) => Object.fromEntries(Object.entries(object).filter(keep));

  changes.push({file: REMOVE_FILES.custom, text: jsonText({...custom, packages: without(custom.packages, ([name]) => name !== packageName)}), summary: [`remove the entry of ${packageName}`]});
  if (has(legacyConfig, packageName)) {
    changes.push({file: REMOVE_FILES.legacy, text: jsonText(without(legacyConfig, ([name]) => name !== packageName)), summary: [`remove the frozen entry of ${packageName}`]});
  }

  const shipped = (Array.isArray(config.packages?.[packageName]?.images) ? config.packages[packageName].images : []).map((image) => `${packageName}-${image.filename}`);
  const registered = Object.entries(lock).filter(([, entry]) => entry?.package === packageName).map(([id]) => id);
  const ids = [...new Set([...registered, ...shipped])];
  const idSet = new Set(ids);
  if (registered.length > 0) {
    changes.push({file: REMOVE_FILES.lock, text: jsonText(without(lock, ([, entry]) => entry?.package !== packageName)), summary: [`remove ${registered.length} registered id(s) of ${packageName}`]});
  }
  const removedAliases = Object.entries(aliases).filter(([from, to]) => idSet.has(from) || idSet.has(to));
  if (removedAliases.length > 0) {
    changes.push({
      file: REMOVE_FILES.aliases,
      text: jsonText(without(aliases, ([from, to]) => !idSet.has(from) && !idSet.has(to))),
      summary: removedAliases.map(([from, to]) => `remove the alias ${from} -> ${to}`),
    });
    for (const [from] of removedAliases.filter(([from]) => !idSet.has(from))) {
      notes.push(`The alias from ${from} pointed into ${packageName}. ${from} belongs to another set, so npm run check:images reports it as gone until a person decides what it should show.`);
    }
  }

  const patterns = linePatterns(packageName);
  const editLine = (file, pattern, what, options) => {
    if (files[file] === undefined) {
      if (options.required) throw commandError('line', `${file} is missing, so ${what} cannot be removed. Edit it by hand.`);
      return;
    }
    const {text, line} = removeOneLine(files[file], pattern, {file, what, ...options});
    if (line !== undefined) changes.push({file, text, summary: [`remove the line ${line.trim()}`]});
  };
  if (legacy) {
    editLine(REMOVE_FILES.dependabot, patterns.dependabot, `${packageName} in the npm ignore list`, {required: true, noContinuation: true});
    editLine(REMOVE_FILES.links, patterns.legacySets, `${packageName} in LEGACY_SETS`, {required: true, within: /^export const LEGACY_SETS = \[/});
  } else {
    editLine(REMOVE_FILES.page, patterns.featuredSets, `${packageName} in FEATURED_SETS`, {required: false, within: /^const FEATURED_SETS = \{/});
  }

  const uninstall = has(packageJson.dependencies, packageName) || has(packageJson.devDependencies, packageName);
  if (!uninstall) notes.push(`${packageName} is not a dependency in package.json, so nothing is uninstalled.`);
  return {packageName, legacy, displayName, slug: displayName ? setSlug(displayName) : undefined, ids, uninstall, changes, notes};
}

/**
 * How often `text` names the set: its package name (not as the start of a longer name, so
 * image-set does not match image-set-update), one of its item ids, or its /rank/<slug> path.
 *
 * @param {string} text
 * @param {{packageName: string, ids?: string[], slug?: string}} names
 */
export function countMentions(text, {packageName, ids = [], slug}) {
  const patterns = [
    `(?<![A-Za-z0-9_-])${escapeRegExp(packageName)}(?![A-Za-z0-9_-])`,
    ...ids.map(escapeRegExp),
    ...(slug ? [`/rank/${escapeRegExp(slug)}(?![A-Za-z0-9_-])`] : []),
  ];
  return (String(text).match(new RegExp(patterns.join('|'), 'g')) ?? []).length;
}

/**
 * The `state` values of a JSON fixture (golden links) as text, decoded with `decompress`
 * (lz-string's decompressFromEncodedURIComponent), so countMentions finds the ids inside the
 * links. v3 links start with "3.". Values that do not decode are left out.
 */
export function decodedStates(value, decompress) {
  const found = [];
  const walk = (node) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (isPlainObject(node)) {
      for (const [key, child] of Object.entries(node)) {
        if (key === 'state' && typeof child === 'string') {
          try {
            const text = decompress(child.startsWith('3.') ? child.slice(2) : child);
            if (typeof text === 'string' && text !== '') found.push(text);
          } catch {
            // Not a link value.
          }
        } else {
          walk(child);
        }
      }
    }
  };
  walk(value);
  return found;
}
