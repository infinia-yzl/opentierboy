#!/usr/bin/env node
/**
 * Checks that no trusted image site is a known tracker.
 *
 * Link images from the hosts in trusted-image-sites.json load without asking the visitor
 * first. A tracker must never be on that list. This check compares every trusted host with
 * the Disconnect tracker list.
 *
 * The repository holds no copy of the list: its licence (CC BY-NC-SA 4.0, non-commercial)
 * does not fit inside this AGPL repository, which anyone may fork and use commercially.
 * scripts/tracker-list.pin.json names the exact file instead: repository, commit, path and
 * SHA-256. The check downloads that file at that commit with git into .cache/tracker-list/
 * (ignored by git), and verifies the SHA-256 before it uses the file.
 *
 * The check fails when, for a trusted host such as `i.imgur.com`:
 *   - the list holds the host itself or a parent name (`imgur.com`), because the list blocks
 *     every name under a listed domain, or
 *   - the list holds the host's registrable domain or any name under it (`ads.imgur.com`),
 *     because then the same site also runs trackers.
 * Registrable domains come from the Public Suffix List (the tldts package, with private
 * suffixes such as github.io), so `images.example.co.uk` and `ads.other.co.uk` do not match.
 *
 * It also fails when an entry with "subdomains": true is a public suffix (github.io, co.uk),
 * which would trust everyone's sites under it, when a file is missing or malformed, when the
 * list holds no domains, or when the downloaded file does not match the pinned SHA-256.
 *
 * Without network (git cannot download the list and no verified copy is cached), it prints a
 * warning and exits 0, so `npm run check` stays usable offline. With CI=true (GitHub Actions
 * sets it) a failed download is an error.
 *
 * Usage:
 *   npm run check:trusted-sites
 *   node scripts/check-trusted-sites.mjs --root <dir>    check another checkout (for tests)
 *   node scripts/check-trusted-sites.mjs --pin <file>    use another pin file (for tests)
 *   node scripts/check-trusted-sites.mjs --cache <dir>   use another cache folder (for tests)
 *   node scripts/check-trusted-sites.mjs --list <file>   use this list, without pin or download (for tests)
 */
import {spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDomain} from 'tldts';

const args = process.argv.slice(2);
const optionValue = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const resolved = (value) => (value === undefined ? undefined : path.resolve(value));

const root = path.resolve(optionValue('--root') ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const sitesPath = path.join(root, 'trusted-image-sites.json');
const pinPath = resolved(optionValue('--pin')) ?? path.join(root, 'scripts/tracker-list.pin.json');
const cacheDir = resolved(optionValue('--cache')) ?? path.join(root, '.cache/tracker-list');
const listOverride = resolved(optionValue('--list'));
const inCi = ['true', '1'].includes(String(process.env.CI ?? '').toLowerCase());

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const normalise = (name) => name.trim().toLowerCase().replace(/\.$/, '');
const shown = (file) => path.relative(process.cwd(), file) || file;
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function fail(messages) {
  console.error('Trusted image sites check failed:');
  for (const message of messages) console.error(`  - ${message}`);
  process.exit(1);
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    fail([`${label} is not valid JSON: ${error.message}`]);
  }
}

function readJson(file) {
  if (!fs.existsSync(file)) fail([`${shown(file)} is missing.`]);
  return parseJson(fs.readFileSync(file, 'utf8'), shown(file));
}

/** The pin file: which list to download, and the SHA-256 it must have. */
function readPin(file) {
  const pin = readJson(file);
  const problems = [];
  if (!isPlainObject(pin)) fail([`${shown(file)} must be a JSON object.`]);
  if (typeof pin.repository !== 'string' || !/^(https:\/\/|file:\/\/|\/)[^\s]+$/.test(pin.repository)) {
    problems.push('"repository" must be an https URL (or a local path, in tests).');
  }
  if (typeof pin.commit !== 'string' || !/^[0-9a-f]{40}$/.test(pin.commit)) problems.push('"commit" must be a full 40-character commit hash.');
  if (typeof pin.path !== 'string' || !/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(pin.path) || pin.path.split('/').includes('..')) {
    problems.push('"path" must be a plain relative file path.');
  }
  if (typeof pin.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(pin.sha256)) problems.push('"sha256" must be 64 lowercase hex characters.');
  if (problems.length > 0) fail(problems.map((problem) => `${shown(file)}: ${problem}`));
  return pin;
}

function git(gitArgs, cwd) {
  return spawnSync('git', gitArgs, {
    cwd,
    encoding: 'buffer',
    timeout: 120_000,
    maxBuffer: 64 * 1024 * 1024,
    env: {...process.env, GIT_TERMINAL_PROMPT: '0'},
  });
}

const gitError = (result) =>
  result.error ? result.error.message : (result.stderr?.toString('utf8').trim().split('\n').pop() || `git exited with ${result.status}`);

/**
 * The pinned list as text. Uses the cached copy when its SHA-256 matches, otherwise downloads
 * the file with git. Returns {error} when the download fails (no network), and {fatal} when
 * the download worked but the file is wrong.
 */
function loadPinnedList(pin) {
  const cached = path.join(cacheDir, `${pin.commit}-${path.basename(pin.path)}`);
  if (fs.existsSync(cached)) {
    const bytes = fs.readFileSync(cached);
    if (sha256(bytes) === pin.sha256) return {text: bytes.toString('utf8'), source: 'cached copy'};
    fs.rmSync(cached, {force: true}); // damaged or stale: download again
  }

  fs.mkdirSync(cacheDir, {recursive: true});
  const work = fs.mkdtempSync(path.join(cacheDir, 'download-'));
  try {
    const init = git(['init', '--quiet', work], cacheDir);
    if (init.status !== 0) return {error: `git init failed: ${gitError(init)}`};
    const fetch = git(['-c', 'http.lowSpeedLimit=1000', '-c', 'http.lowSpeedTime=30', 'fetch', '--quiet', '--depth', '1', '--no-tags', '--', pin.repository, pin.commit], work);
    if (fetch.status !== 0) return {error: `git fetch failed: ${gitError(fetch)}`};
    const show = git(['show', `${pin.commit}:${pin.path}`], work);
    if (show.status !== 0) return {fatal: `The pinned commit ${pin.commit} has no file ${pin.path}: ${gitError(show)}`};
    const actual = sha256(show.stdout);
    if (actual !== pin.sha256) {
      return {fatal: `The downloaded ${pin.path} has SHA-256 ${actual}, but the pin says ${pin.sha256}. Check ${shown(pinPath)}.`};
    }
    fs.writeFileSync(cached, show.stdout);
    return {text: show.stdout.toString('utf8'), source: 'downloaded'};
  } finally {
    fs.rmSync(work, {recursive: true, force: true});
  }
}

/** Every domain in a Disconnect services.json, with where it is listed. */
function trackerDomains(list) {
  // Shape: {categories: {<category>: [{<entity>: {<homepage URL>: [domains...], <flag>: "..."}}]}}
  if (!isPlainObject(list) || !isPlainObject(list.categories)) {
    fail(['The tracker list must be an object with a "categories" object (Disconnect services.json).']);
  }
  const domains = new Map();
  for (const [category, entities] of Object.entries(list.categories)) {
    if (!Array.isArray(entities)) fail([`Tracker list category "${category}" must be an array.`]);
    for (const entity of entities) {
      if (!isPlainObject(entity)) fail([`Tracker list category "${category}" holds an entry that is not an object.`]);
      for (const [name, properties] of Object.entries(entity)) {
        if (!isPlainObject(properties)) fail([`Tracker list entity "${name}" must be an object.`]);
        for (const value of Object.values(properties)) {
          // Arrays hold domains. Other values are flags such as "dnt": "eff".
          if (!Array.isArray(value)) continue;
          for (const domain of value) {
            if (typeof domain !== 'string' || normalise(domain) === '') continue;
            const key = normalise(domain);
            if (!domains.has(key)) domains.set(key, {category, entity: name});
          }
        }
      }
    }
  }
  return domains;
}

/** The sites in trusted-image-sites.json. The unit tests check the rest of the format. */
function trustedSites(file) {
  if (!isPlainObject(file) || !Array.isArray(file.sites)) fail(['trusted-image-sites.json must be an object with a "sites" array.']);
  return file.sites.map((site, index) => {
    if (!isPlainObject(site) || typeof site.host !== 'string' || normalise(site.host) === '') {
      fail([`trusted-image-sites.json entry ${index + 1} needs a "host" string.`]);
    }
    return {host: normalise(site.host), subdomains: site.subdomains === true};
  });
}

const sites = trustedSites(readJson(sitesPath));
const hosts = sites.map((site) => site.host);

// A public suffix with "subdomains": true would trust everyone's sites under it. This needs
// no tracker list, so it runs before the download.
const publicSuffixes = sites.filter((site) => site.subdomains && getDomain(site.host, {allowPrivateDomains: true}) === null);
if (publicSuffixes.length > 0) {
  fail(publicSuffixes.map((site) => `${site.host} is a public suffix. "subdomains": true would trust everyone's sites under it.`));
}

let listText;
let listLabel;
if (listOverride) {
  if (!fs.existsSync(listOverride)) fail([`${shown(listOverride)} is missing.`]);
  listText = fs.readFileSync(listOverride, 'utf8');
  listLabel = shown(listOverride);
} else {
  const pin = readPin(pinPath);
  const loaded = loadPinnedList(pin);
  if (loaded.fatal) fail([loaded.fatal]);
  if (loaded.error) {
    const message = `Could not download the tracker list (${pin.repository} at ${pin.commit.slice(0, 7)}): ${loaded.error}`;
    if (inCi) fail([`${message}. CI must check the trusted sites.`]);
    console.warn(`Warning: trusted image sites NOT checked. ${message}.`);
    console.warn('Run npm run check:trusted-sites again with network. CI (CI=true) treats this as an error.');
    process.exit(0);
  }
  listText = loaded.text;
  listLabel = `${pin.name ?? 'tracker list'} at ${pin.commit.slice(0, 7)}, ${loaded.source}, SHA-256 verified`;
}

const domains = trackerDomains(parseJson(listText, 'The tracker list'));
if (domains.size === 0) fail(['The tracker list holds no domains. Is the file complete?']);

const describe = (domain) => {
  const {category, entity} = domains.get(domain);
  return `"${domain}" (category ${category}, entity ${entity})`;
};

const errors = [];
for (const host of hosts) {
  const registrable = getDomain(host, {allowPrivateDomains: true}) ?? host;
  const matches = new Set();
  // The host and every parent name: a listed domain blocks all names under it.
  const labels = host.split('.');
  for (let start = 0; start < labels.length; start++) {
    const name = labels.slice(start).join('.');
    if (domains.has(name)) matches.add(name);
  }
  // The registrable domain and every name under it: the same site runs trackers.
  for (const domain of domains.keys()) {
    if (domain === registrable || domain.endsWith(`.${registrable}`)) matches.add(domain);
  }
  for (const domain of matches) {
    errors.push(`${host} (registrable domain ${registrable}) matches the tracker list entry ${describe(domain)}. Remove the site from trusted-image-sites.json.`);
  }
}

if (errors.length > 0) fail(errors);

console.log(`Trusted image sites OK: ${hosts.length} site(s) checked against ${domains.size} tracker domains (${listLabel}).`);
