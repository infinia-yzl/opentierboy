import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

const script = path.resolve(__dirname, '../../../scripts/check-fixtures-append-only.mjs');

const LINKS = [
  {id: 'link-001', format: 'v0', state: 'NobwRAlmBcYC', expected: {title: 'One', tiers: [{name: 'S', items: ['Ana']}]}},
  {id: 'link-002', format: 'v2', state: 'N4IgLglgpgTg', expected: {title: 'Two', tiers: [{name: 'A', items: []}]}},
];
const LOCK = {
  'image-a-one.webp': {package: 'image-a', filename: 'one.webp', label: 'One'},
  'image-a-two.webp': {package: 'image-a', filename: 'two.webp', label: 'Two'},
};

describe('scripts/check-fixtures-append-only.mjs', () => {
  let repo: string;

  const git = (...args: string[]) => execFileSync('git', [
    '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args,
  ], {cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
  const write = (file: string, value: unknown, indent = 2) => {
    fs.mkdirSync(path.dirname(path.join(repo, file)), {recursive: true});
    fs.writeFileSync(path.join(repo, file), JSON.stringify(value, null, indent) + '\n');
  };
  const commitAll = (message: string) => {
    git('add', '-A');
    git('commit', '-q', '-m', message);
  };
  const check = (...args: string[]) => {
    const env = {...process.env};
    delete env.FIXTURES_BASE_REF;
    const result = spawnSync(process.execPath, [script, ...args], {cwd: repo, encoding: 'utf8', env});
    return {status: result.status, output: `${result.stdout}${result.stderr}`};
  };

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'otb-append-only-'));
    git('init', '-q', '-b', 'main');
    write('tests/fixtures/shared-links.json', LINKS);
    write('tests/fixtures/state/generated.json', [{id: 'v0-a', state: 'x', expected: {version: 0, tiers: []}}]);
    write('image-registry.lock.json', LOCK);
    write('image-aliases.json', {'image-a-old.webp': 'image-a-one.webp'});
    write('package.json', {name: 'not-a-fixture'});
    commitAll('base');
    git('checkout', '-q', '-b', 'feature');
  });

  afterEach(() => {
    fs.rmSync(repo, {recursive: true, force: true});
  });

  it('passes when nothing changed', () => {
    const result = check('--base', 'main');
    expect(result.status).toBe(0);
    expect(result.output).toContain('tests/fixtures/shared-links.json: 2 kept, 0 added');
  });

  it('allows appended entries, new keys and new fixture files, committed or not', () => {
    write('tests/fixtures/shared-links.json', [...LINKS, {id: 'link-003', state: 'N3', expected: {}}]);
    write('image-registry.lock.json', {...LOCK, 'image-b-new.webp': {package: 'image-b', filename: 'new.webp', label: 'New'}});
    write('tests/fixtures/state/v3.json', [{id: 'v3-a', state: '3.x'}]);
    expect(check('--base', 'main').status).toBe(0);

    commitAll('append');
    const result = check('--base', 'main');
    expect(result.status).toBe(0);
    expect(result.output).toContain('tests/fixtures/shared-links.json: 2 kept, 1 added');
    expect(result.output).toContain('+ tests/fixtures/state/v3.json: new file');
  });

  it('allows formatting and key order changes', () => {
    write('tests/fixtures/shared-links.json', LINKS.map(({expected, state, format, id}) => ({expected, state, format, id})), 4);
    expect(check('--base', 'main').status).toBe(0);
  });

  it('ignores files outside the fixtures and the item registry', () => {
    write('package.json', {name: 'changed'});
    expect(check('--base', 'main').status).toBe(0);
  });

  it.each([
    ['an edited entry', () => write('tests/fixtures/shared-links.json', [LINKS[0], {...LINKS[1], state: 'N4Ig-edited'}]), 'entry link-002 (#2) was changed or removed'],
    ['an edited nested value', () => write('tests/fixtures/shared-links.json', [{...LINKS[0], expected: {...LINKS[0].expected, title: 'Fixed'}}, LINKS[1]]), 'entry link-001 (#1) was changed or removed'],
    ['a removed entry', () => write('tests/fixtures/shared-links.json', [LINKS[0]]), 'entry link-002 (#2) was removed'],
    ['reordered entries', () => write('tests/fixtures/shared-links.json', [LINKS[1], LINKS[0]]), 'entry link-001 (#1) moved to another position'],
    ['an entry inserted before others', () => write('tests/fixtures/shared-links.json', [{id: 'link-000'}, ...LINKS]), 'moved to another position'],
    ['a deleted fixture file', () => fs.rmSync(path.join(repo, 'tests/fixtures/state/generated.json')), 'generated.json: the file was deleted or moved'],
    ['a fixture file that is no longer a list', () => write('tests/fixtures/shared-links.json', {links: LINKS}), 'no longer a JSON array'],
    ['invalid JSON', () => fs.writeFileSync(path.join(repo, 'tests/fixtures/shared-links.json'), '[{'), 'not valid JSON'],
    ['a removed item id', () => write('image-registry.lock.json', {'image-a-one.webp': LOCK['image-a-one.webp']}), 'key "image-a-two.webp" was removed'],
    ['a changed item id entry', () => write('image-registry.lock.json', {...LOCK, 'image-a-one.webp': {...LOCK['image-a-one.webp'], filename: 'x.webp'}}), 'key "image-a-one.webp" was changed'],
    ['a removed alias', () => write('image-aliases.json', {}), 'key "image-a-old.webp" was removed'],
  ])('fails on %s', (_name, change, message) => {
    change();
    const uncommitted = check('--base', 'main');
    expect(uncommitted.status).toBe(1);
    expect(uncommitted.output).toContain(message);

    commitAll('change');
    const committed = check('--base', 'main');
    expect(committed.status).toBe(1);
    expect(committed.output).toContain(message);
  });

  it('compares with the merge base, so a branch behind its base passes', () => {
    git('checkout', '-q', 'main');
    write('tests/fixtures/shared-links.json', [...LINKS, {id: 'link-003'}]);
    commitAll('append on main');
    git('checkout', '-q', 'feature');
    expect(check('--base', 'main').status).toBe(0);
  });

  it('uses the first default base that exists when no --base is given', () => {
    write('tests/fixtures/shared-links.json', [LINKS[0]]);
    const result = check();
    expect(result.output).toContain('compared with main');
    expect(result.status).toBe(1);
  });

  it('exits with 2 when the base ref is missing, as in a shallow CI checkout', () => {
    const result = check('--base', 'origin/does-not-exist');
    expect(result.status).toBe(2);
    expect(result.output).toContain('fetch-depth: 0');
  });
});
