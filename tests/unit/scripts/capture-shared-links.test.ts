import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import TierCortex from '@/lib/TierCortex';
import sharedLinks from '../../fixtures/shared-links.json';

/**
 * scripts/capture-shared-links.mjs records what a visitor must see for a link. It runs here on
 * a copy of the repository files it reads, so the real fixture file stays untouched. What it
 * records must match what the app shows (TierCortex), for every link format.
 */
const repoRoot = path.resolve(__dirname, '../../..');

describe('scripts/capture-shared-links.mjs', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-links-'));
    fs.mkdirSync(path.join(root, 'scripts'));
    fs.mkdirSync(path.join(root, 'tests/fixtures'), {recursive: true});
    fs.copyFileSync(path.join(repoRoot, 'scripts/capture-shared-links.mjs'), path.join(root, 'scripts/capture-shared-links.mjs'));
    fs.copyFileSync(path.join(repoRoot, 'imageset.config.json'), path.join(root, 'imageset.config.json'));
    fs.symlinkSync(path.join(repoRoot, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  });

  afterEach(() => {
    fs.rmSync(root, {recursive: true, force: true});
  });

  const capture = (...links: string[]) => {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/capture-shared-links.mjs'), '--source', 'test', ...links], {encoding: 'utf8'});
    expect(result.status, result.stderr).toBe(0);
    return JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/shared-links.json'), 'utf8')) as typeof sharedLinks;
  };

  /** What the app shows for a link: tier names (an unnamed one is Unranked) and item labels. */
  const shown = (state: string) => new TierCortex().decodeTierStateFromURL(state)!.tiers.map(tier => ({
    name: tier.name.trim() || 'Unranked',
    items: tier.items.map(item => item.content),
  }));

  it('records the golden legacy links as they were captured', () => {
    const links = sharedLinks.slice(0, 3);
    const captured = capture(...links.map(link => `https://opentierboy.com${link.path}?state=${link.state.replace(/ /g, '+')}`));
    expect(captured.map(({format, path: linkPath, expected}) => ({format, path: linkPath, expected})))
      .toEqual(links.map(({format, path: linkPath, expected}) => ({format, path: linkPath, expected})));
  });

  it('reads v3 links, and records what the app shows for them', () => {
    const cortex = new TierCortex();
    const legacy = sharedLinks.find(link => link.id === 'link-002')!;
    const tiers = cortex.decodeTierStateFromURL(legacy.state)!.tiers;
    tiers[0] = {...tiers[0], items: [
      ...tiers[0].items,
      {id: 'https://i.imgur.com/abc123.png', content: 'From a link', source: 'link', url: 'https://i.imgur.com/abc123.png'},
      {id: 'k3j9x0a1b', content: 'An upload', source: 'device'},
    ]};
    tiers[1] = {...tiers[1], id: 'tier-moved'};
    const titled = cortex.encodeListForURL('A v3 list', tiers, {labelPosition: 'top', showLabels: false});
    const untitled = cortex.encodeListForURL('', tiers);

    const [first, second] = capture(`/rank/the-finals/light?state=${titled}`, `/rank/the-finals/light?state=${untitled}`);
    // The script stores the state as URLSearchParams reads it, with spaces for '+', like every entry.
    expect(first).toMatchObject({format: 'v3', path: '/rank/the-finals/light', state: titled.replace(/\+/g, ' '), expected: {title: 'A v3 list'}});
    expect(first.expected.tiers).toEqual(shown(titled));
    expect(first.expected.tiers[0].items.slice(-2)).toEqual(['From a link', 'An upload']);
    expect(second.expected.title).toBe('THE FINALS - Light Build');
    expect(second.expected.tiers).toEqual(shown(untitled));
  });
});
