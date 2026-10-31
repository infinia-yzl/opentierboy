import {spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

const repoRoot = path.resolve(__dirname, '../../..');
const script = path.join(repoRoot, 'scripts/check-trusted-sites.mjs');

/** Runs the check. CI is unset unless the test sets it, so a CI runner does not change the result. */
function run(args: string[], env: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {encoding: 'utf8', env: {...process.env, CI: '', ...env}});
  return {status: result.status, output: `${result.stdout}${result.stderr}`};
}

function git(cwd: string, ...args: string[]) {
  const result = spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], {cwd, encoding: 'utf8'});
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

/** A tracker list in the Disconnect services.json shape. */
function trackerList(categories: Record<string, Record<string, string[]>>) {
  return {
    license: 'test',
    categories: Object.fromEntries(Object.entries(categories).map(([category, entities]) => [
      category,
      Object.entries(entities).map(([entity, domains]) => ({[entity]: {[`https://${entity}.example/`]: domains, dnt: 'eff'}})),
    ])),
  };
}

const sha256 = (text: string) => crypto.createHash('sha256').update(text).digest('hex');

describe('scripts/tracker-list.pin.json', () => {
  const pin = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scripts/tracker-list.pin.json'), 'utf8'));

  it('returns the Disconnect repository, commit, path and SHA-256 when tracker-list.pin.json is read', () => {
    expect(pin).toMatchObject({
      repository: 'https://github.com/disconnectme/disconnect-tracking-protection.git',
      commit: 'a277cd6e9d47f71837a45dace832da73ca261e48',
      path: 'services.json',
      sha256: 'dbaa85efd07c769c2b53bda72bd60c34c0532fd88b02dac98aae328fe1765746',
      commitDate: '2026-10-13',
      licence: 'CC BY-NC-SA 4.0',
    });
  });

  it('returns no tracked services.json and an ignored download path when git ls-files and check-ignore run', () => {
    const tracked = git(repoRoot, 'ls-files').split('\n');
    expect(tracked.filter(file => file.startsWith('vendor/disconnect') || file.endsWith('services.json'))).toEqual([]);
    expect(git(repoRoot, 'check-ignore', '.cache/tracker-list/a277cd6e9d47f71837a45dace832da73ca261e48-services.json')).toBe(
      '.cache/tracker-list/a277cd6e9d47f71837a45dace832da73ca261e48-services.json',
    );
  });
});

describe('scripts/check-trusted-sites.mjs', () => {
  let root: string;

  const writeSites = (hosts: string[]) =>
    fs.writeFileSync(path.join(root, 'trusted-image-sites.json'), JSON.stringify({sites: hosts.map(host => ({host, reason: 'test'}))}));

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'otb-trusted-'));
    writeSites(['i.imgur.com', 'static.wikia.nocookie.net', 'images.example.co.uk']);
  });

  afterEach(() => {
    fs.rmSync(root, {recursive: true, force: true});
  });

  describe('scripts/check-trusted-sites.mjs with --list', () => {
    let listFile: string;
    const writeList = (value: unknown) => fs.writeFileSync(listFile, typeof value === 'string' ? value : JSON.stringify(value));
    const check = () => run(['--root', root, '--list', listFile]);

    beforeEach(() => {
      listFile = path.join(root, 'list.json');
      writeList(trackerList({
        Advertising: {AdCo: ['ads.example.net', 'tracker.example.org'], CoUk: ['tracker.co.uk', 'ads.other.co.uk']},
        Content: {Video: ['youtube-nocookie.com', 'notimgur.com', 'imgur.com.evil.example']},
      }));
    });

    it('returns exit code 0 when only look-alike names of trusted hosts are on the list', () => {
      const result = check();
      expect(result.output).toContain('Trusted image sites OK: 3 site(s) checked against 7 tracker domains');
      expect(result.status).toBe(0);
    });

    it('returns exit code 1 and writes the matching entry when a trusted host is on the list', () => {
      writeList(trackerList({Analytics: {Imgur: ['i.imgur.com']}}));
      const result = check();
      expect(result.status).toBe(1);
      expect(result.output).toContain('i.imgur.com (registrable domain imgur.com) matches the tracker list entry "i.imgur.com" (category Analytics, entity Imgur).');
    });

    it('returns exit code 1 when a parent name of a trusted host is on the list', () => {
      writeList(trackerList({Advertising: {Fandom: ['wikia.nocookie.net']}}));
      const result = check();
      expect(result.status).toBe(1);
      expect(result.output).toContain('static.wikia.nocookie.net (registrable domain nocookie.net) matches the tracker list entry "wikia.nocookie.net"');
    });

    it('returns exit code 1 when the registrable domain of a trusted host or a name under it is on the list', () => {
      writeList(trackerList({Advertising: {Imgur: ['imgur.com']}, Analytics: {ImgurStats: ['stats.imgur.com']}}));
      const result = check();
      expect(result.status).toBe(1);
      expect(result.output).toContain('matches the tracker list entry "imgur.com" (category Advertising, entity Imgur)');
      expect(result.output).toContain('matches the tracker list entry "stats.imgur.com" (category Analytics, entity ImgurStats)');
    });

    it('returns exit code 1 when a list entry shares a Public Suffix List registrable domain with a trusted host', () => {
      writeList(trackerList({Advertising: {Same: ['ads.example.co.uk']}}));
      const result = check();
      expect(result.status).toBe(1);
      expect(result.output).toContain('images.example.co.uk (registrable domain example.co.uk) matches the tracker list entry "ads.example.co.uk"');
    });

    it('returns exit code 1 when the names differ only in letter case or a trailing dot', () => {
      writeList(trackerList({Advertising: {Imgur: ['IMGUR.COM.']}}));
      expect(check().status).toBe(1);
      writeSites(['I.IMGUR.COM.']);
      writeList(trackerList({Advertising: {Imgur: ['i.imgur.com']}}));
      expect(check().status).toBe(1);
    });

    it('returns exit code 1 when the tracker list is missing, malformed or empty', () => {
      fs.rmSync(listFile);
      expect(check()).toMatchObject({status: 1, output: expect.stringContaining('is missing.')});
      writeList('{not json');
      expect(check()).toMatchObject({status: 1, output: expect.stringContaining('is not valid JSON')});
      writeList({sites: []});
      expect(check()).toMatchObject({status: 1, output: expect.stringContaining('must be an object with a "categories" object')});
      writeList({categories: {Advertising: {}}});
      expect(check()).toMatchObject({status: 1, output: expect.stringContaining('category "Advertising" must be an array')});
      writeList({categories: {Advertising: ['ads.example.net']}});
      expect(check()).toMatchObject({status: 1, output: expect.stringContaining('holds an entry that is not an object')});
      writeList({categories: {Advertising: [{AdCo: ['ads.example.net']}]}});
      expect(check()).toMatchObject({status: 1, output: expect.stringContaining('entity "AdCo" must be an object')});
      writeList({categories: {}});
      expect(check()).toMatchObject({status: 1, output: expect.stringContaining('The tracker list holds no domains')});
    });

    it('returns exit code 1 when an entry with "subdomains": true is a public suffix', () => {
      fs.writeFileSync(path.join(root, 'trusted-image-sites.json'), JSON.stringify({sites: [
        {host: 'github.io', subdomains: true, reason: 'test'},
        {host: 'co.uk', subdomains: true, reason: 'test'},
        {host: 'example.co.uk', subdomains: true, reason: 'test'},
        {host: 'pages.dev', reason: 'exact host only'},
      ]}));
      const result = check();
      expect(result.status).toBe(1);
      expect(result.output).toContain('github.io is a public suffix. "subdomains": true would trust everyone\'s sites under it.');
      expect(result.output).toContain('co.uk is a public suffix.');
      expect(result.output).not.toContain('example.co.uk is a public suffix');
      expect(result.output).not.toContain('pages.dev');
      // A registrable domain with subdomains passes.
      fs.writeFileSync(path.join(root, 'trusted-image-sites.json'), JSON.stringify({sites: [{host: 'thefinals.wiki', subdomains: true, reason: 'test'}]}));
      expect(check().status).toBe(0);
    });

    it('returns exit code 1 when trusted-image-sites.json is missing or malformed', () => {
      fs.writeFileSync(path.join(root, 'trusted-image-sites.json'), JSON.stringify({hosts: ['i.imgur.com']}));
      expect(check()).toMatchObject({status: 1, output: expect.stringContaining('must be an object with a "sites" array')});
      fs.writeFileSync(path.join(root, 'trusted-image-sites.json'), JSON.stringify({sites: [{host: 42}]}));
      expect(check()).toMatchObject({status: 1, output: expect.stringContaining('entry 1 needs a "host" string')});
      fs.rmSync(path.join(root, 'trusted-image-sites.json'));
      expect(check()).toMatchObject({status: 1, output: expect.stringContaining('trusted-image-sites.json is missing.')});
    });
  });

  describe('scripts/check-trusted-sites.mjs with --pin', () => {
    // A local git repository stands in for the Disconnect repository on GitHub.
    let source: string;
    let commit: string;
    let listText: string;
    let pinFile: string;
    let cacheDir: string;

    const writePin = (changes: Record<string, unknown> = {}) =>
      fs.writeFileSync(pinFile, JSON.stringify({name: 'Test list', repository: source, commit, path: 'data/services.json', sha256: sha256(listText), licence: 'test', ...changes}));
    const check = (env: Record<string, string> = {}) => run(['--root', root, '--pin', pinFile, '--cache', cacheDir], env);
    const cachedFile = () => path.join(cacheDir, `${commit}-services.json`);

    beforeEach(() => {
      source = path.join(root, 'source');
      fs.mkdirSync(path.join(source, 'data'), {recursive: true});
      git(source, 'init', '--quiet');
      listText = JSON.stringify(trackerList({Advertising: {AdCo: ['ads.example.net']}}));
      fs.writeFileSync(path.join(source, 'data/services.json'), listText);
      git(source, 'add', '.');
      git(source, 'commit', '--quiet', '-m', 'list');
      commit = git(source, 'rev-parse', 'HEAD');
      // A later commit changes the list: the pin must still get the pinned version.
      fs.writeFileSync(path.join(source, 'data/services.json'), JSON.stringify(trackerList({Advertising: {Imgur: ['imgur.com']}})));
      git(source, 'commit', '--quiet', '-am', 'later');
      pinFile = path.join(root, 'pin.json');
      cacheDir = path.join(root, 'cache');
      writePin();
    });

    it('writes the pinned file to the cache, after its SHA-256 check, when the cache is empty', () => {
      const first = check();
      expect(first.output).toContain('Trusted image sites OK: 3 site(s) checked against 1 tracker domains (Test list at');
      expect(first.output).toContain('downloaded, SHA-256 verified');
      expect(first.status).toBe(0);
      expect(fs.readFileSync(cachedFile(), 'utf8')).toBe(listText);
      // Only the cached file is left in the cache folder.
      expect(fs.readdirSync(cacheDir)).toEqual([`${commit}-services.json`]);
    });

    it('returns exit code 0 from the cached copy when the source repository is gone', () => {
      expect(check().status).toBe(0);
      fs.rmSync(source, {recursive: true, force: true});
      const second = check({CI: 'true'});
      expect(second.output).toContain('cached copy, SHA-256 verified');
      expect(second.status).toBe(0);
    });

    it('writes the pinned file to the cache again when the cached copy was changed', () => {
      expect(check().status).toBe(0);
      fs.writeFileSync(cachedFile(), JSON.stringify(trackerList({Advertising: {Imgur: ['i.imgur.com']}})));
      const result = check();
      expect(result.output).toContain('downloaded, SHA-256 verified');
      expect(result.status).toBe(0);
      expect(fs.readFileSync(cachedFile(), 'utf8')).toBe(listText);
    });

    it('returns exit code 1 and writes no cache file when the download fails the pinned SHA-256, in or out of CI', () => {
      writePin({sha256: '0'.repeat(64)});
      for (const env of [{CI: ''}, {CI: 'true'}]) {
        const result = check(env);
        expect(result.status).toBe(1);
        expect(result.output).toContain(`The downloaded data/services.json has SHA-256 ${sha256(listText)}, but the pin says ${'0'.repeat(64)}.`);
      }
      expect(fs.existsSync(cachedFile())).toBe(false);
      expect(fs.readdirSync(cacheDir)).toEqual([]);
    });

    it('returns exit code 1 when the pinned commit has no file at the pinned path', () => {
      writePin({path: 'data/missing.json'});
      expect(check()).toMatchObject({status: 1, output: expect.stringContaining(`The pinned commit ${commit} has no file data/missing.json`)});
    });

    it('returns exit code 1 when a trusted host is on the pinned list', () => {
      writeSites(['ads.example.net']);
      expect(check()).toMatchObject({status: 1, output: expect.stringContaining('matches the tracker list entry "ads.example.net"')});
    });

    it('returns exit code 0 and writes a warning when the download fails outside CI, and 1 in CI', () => {
      writePin({repository: path.join(root, 'no-such-repository')});
      const offline = check();
      expect(offline.status).toBe(0);
      expect(offline.output).toContain('Warning: trusted image sites NOT checked. Could not download the tracker list');
      expect(offline.output).toContain('CI (CI=true) treats this as an error.');
      for (const ci of ['true', '1']) {
        const inCi = check({CI: ci});
        expect(inCi.status).toBe(1);
        expect(inCi.output).toContain('Could not download the tracker list');
        expect(inCi.output).toContain('CI must check the trusted sites.');
      }
    });

    it('returns exit code 1 and an error message when the pin file is missing, malformed or a JSON array', () => {
      const cases: [Record<string, unknown>, string][] = [
        [{commit: commit.slice(0, 7)}, '"commit" must be a full 40-character commit hash'],
        [{sha256: 'ABC'}, '"sha256" must be 64 lowercase hex characters'],
        [{path: '../outside.json'}, '"path" must be a plain relative file path'],
        [{path: '/etc/passwd'}, '"path" must be a plain relative file path'],
        [{repository: 'http://github.com/x/y.git'}, '"repository" must be an https URL'],
        [{repository: '--upload-pack=touch /tmp/x'}, '"repository" must be an https URL'],
      ];
      for (const [changes, message] of cases) {
        writePin(changes);
        expect(check(), JSON.stringify(changes)).toMatchObject({status: 1, output: expect.stringContaining(message)});
      }
      fs.writeFileSync(pinFile, '[]');
      expect(check()).toMatchObject({status: 1, output: expect.stringContaining('must be a JSON object')});
      fs.rmSync(pinFile);
      expect(check()).toMatchObject({status: 1, output: expect.stringContaining('pin.json is missing.')});
    });
  });
});
