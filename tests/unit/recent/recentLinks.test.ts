import fs from 'node:fs';
import path from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  browserLocalStorage,
  createRecentLinks,
  RECENT_LINK_LIMITS,
  RECENT_LINKS_STORAGE_KEY,
  RECENT_PIN_LIMIT,
  RECENT_UNPINNED_LIMIT,
  recentLinkHref,
  recentLinkKey,
  type RecentLink,
  type RecentLinksStorage,
} from '@/lib/recent/recentLinks';

class MemoryStorage implements RecentLinksStorage {
  values = new Map<string, string>();
  failGet = false;
  failSet = false;
  failRemove = false;
  getItem(key: string): string | null {
    if (this.failGet) throw new DOMException('blocked', 'SecurityError');
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failSet) throw new DOMException('full', 'QuotaExceededError');
    this.values.set(key, String(value));
  }
  removeItem(key: string): void {
    if (this.failRemove) throw new DOMException('blocked', 'SecurityError');
    this.values.delete(key);
  }
}

function setup(start = 1_000) {
  const storage = new MemoryStorage();
  let clock = start;
  const tick = () => ++clock;
  const recent = createRecentLinks(storage, {now: tick});
  return {storage, recent, tick, stored: () => JSON.parse(storage.values.get(RECENT_LINKS_STORAGE_KEY) ?? 'null')};
}

const link = (n: number) => ({path: '/rank/overwatch/tank', state: `N4Ig${n}`, title: `List ${n}`});
const paths = (links: readonly RecentLink[]) => links.map(l => `${l.path}?${l.state}`);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('recording links', () => {
  it('starts empty', () => {
    expect(setup().recent.list()).toEqual([]);
  });

  it('adds opened links at the top with path, state, title and time', () => {
    const {recent} = setup();
    recent.record(link(1));
    const result = recent.record(link(2));
    expect(result.ok).toBe(true);
    expect(result.links).toEqual([
      {path: '/rank/overwatch/tank', state: 'N4Ig2', title: 'List 2', openedAt: 1_002, pinned: false},
      {path: '/rank/overwatch/tank', state: 'N4Ig1', title: 'List 1', openedAt: 1_001, pinned: false},
    ]);
    expect(recent.list()).toEqual(result.links);
  });

  it('keeps one entry per link and moves it to the top when opened again', () => {
    const {recent} = setup();
    recent.record(link(1));
    recent.record(link(2));
    recent.record({...link(1), title: 'Renamed'});
    expect(recent.list().map(l => [l.state, l.title, l.openedAt])).toEqual([
      ['N4Ig1', 'Renamed', 1_003],
      ['N4Ig2', 'List 2', 1_002],
    ]);
  });

  it('treats a trailing slash and spaces for "+" as the same link', () => {
    const {recent} = setup();
    recent.record({path: '/rank/overwatch/tank/', state: 'N4Ig a+b'});
    recent.record({path: '/rank/overwatch/tank', state: 'N4Ig+a b'});
    expect(recent.list()).toHaveLength(1);
    expect(recent.list()[0]).toMatchObject({path: '/rank/overwatch/tank', state: 'N4Ig+a+b'});
    expect(recentLinkKey({path: '/rank/x/', state: 'a b'})).toBe(recentLinkKey({path: '/rank/x', state: 'a+b'}));
    expect(recentLinkKey({path: '/rank/x', state: 'a'})).not.toBe(recentLinkKey({path: '/rank/y', state: 'a'}));
  });

  it('records a link without state or title', () => {
    const {recent} = setup();
    expect(recent.record({path: '/rank'}).ok).toBe(true);
    expect(recent.record({path: '/rank/overwatch', state: null, title: null}).ok).toBe(true);
    expect(recent.list().map(l => [l.path, l.state, l.title])).toEqual([
      ['/rank/overwatch', '', ''],
      ['/rank', '', ''],
    ]);
  });

  it('records every golden link state, including the 430-item list', () => {
    const fixtures = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../fixtures/state/generated.json'), 'utf8')) as {state: string}[];
    const longest = Math.max(...fixtures.map(f => f.state.length));
    expect(longest).toBeLessThan(RECENT_LINK_LIMITS.maxStateChars);
    const {recent} = setup();
    for (const fixture of fixtures) {
      expect(recent.record({path: '/rank/overwatch/all', state: fixture.state}).ok).toBe(true);
    }
  });

  it('refuses links that are not app paths or have bad state values', () => {
    const {recent, storage} = setup();
    const bad = [
      {path: 'javascript:alert(1)'},
      {path: 'https://evil.example/rank/x'},
      {path: '//evil.example/rank/x'},
      {path: '/\\evil.example'},
      {path: '/rank\\x'},
      {path: '/rank/../../etc'},
      {path: '/rank/..'},
      {path: '/rank/.'},
      {path: '/about'},
      {path: '/'},
      {path: ''},
      {path: '/rankx'},
      {path: '/rank?state=x'},
      {path: '/rank#x'},
      {path: '/rank/a b'},
      {path: '/rank//x'},
      {path: '/rank/ü'},
      {path: `/rank/${'a'.repeat(RECENT_LINK_LIMITS.maxPathChars)}`},
      {path: '/rank/x', state: 'abc\ndef'},
      {path: '/rank/x', state: 'abc\u0000'},
      {path: '/rank/x', state: 'äbc'},
      {path: '/rank/x', state: 'a'.repeat(RECENT_LINK_LIMITS.maxStateChars + 1)},
      {path: 7},
      null,
      undefined,
    ];
    for (const input of bad) {
      expect(recent.record(input as never), JSON.stringify(input)?.slice(0, 60)).toMatchObject({ok: false, reason: 'invalid-link'});
    }
    expect(storage.values.size).toBe(0);
    expect(recent.record({path: '/rank/x', state: 'a'.repeat(RECENT_LINK_LIMITS.maxStateChars)}).ok).toBe(true);
  });

  it('shortens long titles without cutting an emoji in half', () => {
    const {recent} = setup();
    const max = RECENT_LINK_LIMITS.maxTitleChars;
    recent.record({path: '/rank/a', title: 'x'.repeat(max + 50)});
    recent.record({path: '/rank/b', title: `${'x'.repeat(max - 1)}🧪🧪`});
    const [b, a] = recent.list();
    expect(a.title).toBe('x'.repeat(max));
    expect(b.title).toBe('x'.repeat(max - 1));
    // The shortened entries survive a reload.
    expect(createRecentLinks(setupStorageFrom(recent)).list()).toHaveLength(2);
  });

  it(`keeps the ${RECENT_UNPINNED_LIMIT} most recently opened unpinned links`, () => {
    const {recent} = setup();
    for (let n = 1; n <= RECENT_UNPINNED_LIMIT + 5; n++) recent.record(link(n));
    const states = recent.list().map(l => l.state);
    expect(states).toHaveLength(RECENT_UNPINNED_LIMIT);
    expect(states[0]).toBe(`N4Ig${RECENT_UNPINNED_LIMIT + 5}`);
    expect(states.at(-1)).toBe('N4Ig6');
  });
});

describe('pinning', () => {
  it('keeps pinned links when many others are opened', () => {
    const {recent} = setup();
    recent.record(link(1));
    expect(recent.pin(link(1)).ok).toBe(true);
    for (let n = 2; n <= RECENT_UNPINNED_LIMIT + 10; n++) recent.record(link(n));
    const list = recent.list();
    expect(list[0]).toMatchObject({state: 'N4Ig1', pinned: true});
    expect(list.filter(l => !l.pinned)).toHaveLength(RECENT_UNPINNED_LIMIT);
  });

  it(`allows at most ${RECENT_PIN_LIMIT} pinned links`, () => {
    const {recent} = setup();
    for (let n = 1; n <= RECENT_PIN_LIMIT + 1; n++) recent.record(link(n));
    for (let n = 1; n <= RECENT_PIN_LIMIT; n++) expect(recent.pin(link(n)).ok).toBe(true);
    const refused = recent.pin(link(RECENT_PIN_LIMIT + 1));
    expect(refused).toMatchObject({ok: false, reason: 'pin-limit'});
    expect(refused.links.filter(l => l.pinned)).toHaveLength(RECENT_PIN_LIMIT);
    // Unpinning one makes room again.
    recent.unpin(link(1));
    expect(recent.pin(link(RECENT_PIN_LIMIT + 1)).ok).toBe(true);
  });

  it('lists pinned links first, most recently pinned first, then the others by time opened', () => {
    const {recent} = setup();
    for (let n = 1; n <= 4; n++) recent.record(link(n));
    recent.pin(link(1));
    recent.pin(link(3));
    expect(recent.list().map(l => [l.state, l.pinned])).toEqual([
      ['N4Ig3', true],
      ['N4Ig1', true],
      ['N4Ig4', false],
      ['N4Ig2', false],
    ]);
  });

  it('keeps a pinned link pinned when it is opened again', () => {
    const {recent} = setup();
    recent.record(link(1));
    recent.pin(link(1));
    const pinnedAt = recent.list()[0].pinnedAt;
    recent.record({...link(1), title: 'New title'});
    expect(recent.list()[0]).toMatchObject({pinned: true, pinnedAt, title: 'New title', openedAt: 1_003});
  });

  it('does nothing when pinning a pinned link or unpinning an unpinned one', () => {
    const {recent} = setup();
    recent.record(link(1));
    recent.pin(link(1));
    const before = recent.list();
    expect(recent.pin(link(1))).toEqual({ok: true, links: before});
    recent.record(link(2));
    const after = recent.list();
    expect(recent.unpin(link(2))).toEqual({ok: true, links: after});
  });

  it('keeps an unpinned link in the list, even when it is older than all the others', () => {
    const {recent} = setup();
    recent.record(link(0));
    recent.pin(link(0));
    for (let n = 1; n <= RECENT_UNPINNED_LIMIT; n++) recent.record(link(n));
    const result = recent.unpin(link(0));
    expect(result.ok).toBe(true);
    expect(result.links).toHaveLength(RECENT_UNPINNED_LIMIT);
    expect(result.links.at(-1)).toMatchObject({state: 'N4Ig0', pinned: false});
    expect(result.links.at(-1)).not.toHaveProperty('pinnedAt');
    expect(result.links.some(l => l.state === 'N4Ig1')).toBe(false);
  });

  it('reports links that are not in the list', () => {
    const {recent} = setup();
    recent.record(link(1));
    expect(recent.pin(link(2))).toMatchObject({ok: false, reason: 'not-found'});
    expect(recent.unpin(link(2))).toMatchObject({ok: false, reason: 'not-found'});
    expect(recent.remove(link(2))).toMatchObject({ok: false, reason: 'not-found'});
    expect(recent.pin({path: 'javascript:alert(1)'})).toMatchObject({ok: false, reason: 'invalid-link'});
  });
});

describe('removing links', () => {
  it('removes one link, pinned or not', () => {
    const {recent} = setup();
    for (let n = 1; n <= 3; n++) recent.record(link(n));
    recent.pin(link(2));
    expect(paths(recent.remove(link(2)).links)).toEqual(paths(recent.list()));
    expect(recent.list().map(l => l.state)).toEqual(['N4Ig3', 'N4Ig1']);
  });

  it('clears the whole list', () => {
    const {recent, storage} = setup();
    recent.record(link(1));
    recent.pin(link(1));
    expect(recent.clear()).toEqual({ok: true, links: []});
    expect(storage.values.size).toBe(0);
  });
});

describe('storage', () => {
  it('stores a small versioned JSON object under one key', () => {
    const {recent, stored} = setup();
    recent.record(link(1));
    recent.pin(link(1));
    expect(stored()).toEqual({
      version: 1,
      links: [{path: '/rank/overwatch/tank', state: 'N4Ig1', title: 'List 1', openedAt: 1_001, pinned: true, pinnedAt: 1_002}],
    });
  });

  it('returns the same list object until the stored data changes', () => {
    const {recent} = setup();
    recent.record(link(1));
    const first = recent.list();
    expect(recent.list()).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first[0])).toBe(true);
    recent.record(link(2));
    expect(recent.list()).not.toBe(first);
  });

  it('sees changes made through another list on the same storage (another tab)', () => {
    const {recent, storage} = setup();
    const otherTab = createRecentLinks(storage, {now: () => 5_000});
    recent.record(link(1));
    otherTab.record(link(2));
    expect(recent.list().map(l => l.state)).toEqual(['N4Ig2', 'N4Ig1']);
  });

  it('works without storage: the list is empty and changes report storage-unavailable', () => {
    for (const storage of [null, undefined]) {
      const recent = createRecentLinks(storage);
      expect(recent.list()).toEqual([]);
      expect(recent.record(link(1))).toEqual({ok: false, reason: 'storage-unavailable', links: []});
      expect(recent.clear()).toEqual({ok: false, reason: 'storage-unavailable', links: []});
    }
  });

  it('never throws when storage is blocked or full', () => {
    const {recent, storage} = setup();
    recent.record(link(1));
    const before = recent.list();

    storage.failSet = true;
    expect(recent.record(link(2))).toEqual({ok: false, reason: 'storage-unavailable', links: before});
    expect(recent.pin(link(1))).toEqual({ok: false, reason: 'storage-unavailable', links: before});
    storage.failSet = false;

    storage.failRemove = true;
    expect(recent.clear()).toMatchObject({ok: false, reason: 'storage-unavailable'});
    storage.failRemove = false;

    storage.failGet = true;
    expect(recent.list()).toEqual([]);
    expect(() => recent.record(link(3))).not.toThrow();
  });

  it('uses the injected clock, and the real one when the injected clock is broken', () => {
    const storage = new MemoryStorage();
    const recent = createRecentLinks(storage, {now: () => Number.NaN});
    const before = Date.now();
    recent.record(link(1));
    expect(recent.list()[0].openedAt).toBeGreaterThanOrEqual(before);
  });

  it('uses another key when asked', () => {
    const storage = new MemoryStorage();
    createRecentLinks(storage, {key: 'other'}).record(link(1));
    expect(Array.from(storage.values.keys())).toEqual(['other']);
  });
});

describe('untrusted stored data', () => {
  const valid = {path: '/rank/a', state: 'N4Ig', title: 'A', openedAt: 10, pinned: false};

  function load(value: unknown) {
    const storage = new MemoryStorage();
    storage.values.set(RECENT_LINKS_STORAGE_KEY, typeof value === 'string' ? value : JSON.stringify(value));
    return createRecentLinks(storage).list();
  }

  it('treats anything that is not the stored format as an empty list', () => {
    for (const value of ['not json', '', 'null', '[]', '"x"', '{}', {version: 2, links: [valid]}, {version: 1}, {version: 1, links: {}}, {links: [valid]}]) {
      expect(load(value), JSON.stringify(value)).toEqual([]);
    }
  });

  it('drops bad entries and keeps the good ones', () => {
    const bad = [
      null,
      'x',
      [],
      {...valid, path: 'javascript:alert(1)'},
      {...valid, path: '//evil.example/rank'},
      {...valid, path: '/rank/../x'},
      {...valid, state: 'a\nb'},
      {...valid, state: 7},
      {...valid, title: 7},
      {...valid, title: 'x'.repeat(RECENT_LINK_LIMITS.maxTitleChars + 1)},
      {...valid, openedAt: -1},
      {...valid, openedAt: 1.5},
      {...valid, openedAt: 1e300},
      {...valid, openedAt: '10'},
      {...valid, pinned: 'yes'},
      {...valid, pinnedAt: -5, pinned: true},
      {path: '/rank/a'},
    ];
    const good = {...valid, path: '/rank/good'};
    expect(load({version: 1, links: [...bad, good]})).toEqual([good]);
  });

  it('ignores unknown fields and prototype keys', () => {
    const text = `{"version":1,"__proto__":{"polluted":true},"links":[{"path":"/rank/a","state":"N4Ig","title":"A","openedAt":10,"pinned":false,"extra":1,"__proto__":{"polluted":true}}]}`;
    const [entry] = load(text);
    expect(entry).toEqual(valid);
    expect(Object.getPrototypeOf(entry)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('merges duplicate entries, keeping the newer one and its pin', () => {
    const list = load({
      version: 1,
      links: [
        {...valid, title: 'Old', openedAt: 5, pinned: true, pinnedAt: 6},
        {...valid, title: 'New', openedAt: 20},
        {...valid, path: '/rank/a/', state: 'N4Ig', openedAt: 1},
      ],
    });
    expect(list).toEqual([{...valid, title: 'New', openedAt: 20, pinned: true, pinnedAt: 6}]);
  });

  it('gives a pinned entry without pin time its open time', () => {
    expect(load({version: 1, links: [{...valid, pinned: true}]})).toEqual([{...valid, pinned: true, pinnedAt: 10}]);
  });

  it('applies both caps to stored data; pins beyond the limit become ordinary links', () => {
    const pins = Array.from({length: RECENT_PIN_LIMIT + 3}, (_, i) => ({...valid, path: `/rank/pin${i}`, openedAt: 100 + i, pinned: true, pinnedAt: 200 + i}));
    const others = Array.from({length: RECENT_UNPINNED_LIMIT + 5}, (_, i) => ({...valid, path: `/rank/other${i}`, openedAt: 1_000 + i}));
    const list = load({version: 1, links: [...pins, ...others]});
    const pinned = list.filter(l => l.pinned);
    expect(pinned).toHaveLength(RECENT_PIN_LIMIT);
    expect(pinned.map(l => l.path)).not.toContain('/rank/pin0');
    expect(list.filter(l => !l.pinned)).toHaveLength(RECENT_UNPINNED_LIMIT);
  });
});

describe('helpers', () => {
  it('builds an href with the state value URL-encoded', () => {
    expect(recentLinkHref({path: '/rank/overwatch/tank', state: 'N4Ig+a$b-c'})).toBe('/rank/overwatch/tank?state=N4Ig%2Ba%24b-c');
    expect(recentLinkHref({path: '/rank/overwatch/tank', state: '3.abc)'})).toBe('/rank/overwatch/tank?state=3.abc)');
    expect(recentLinkHref({path: '/rank/overwatch', state: ''})).toBe('/rank/overwatch');
    expect(new URL(recentLinkHref({path: '/rank/x', state: 'a+b&c=#d'}), 'https://opentierboy.com').searchParams.get('state')).toBe('a+b&c=#d');
  });

  it('returns the browser storage, or null when it is missing or blocked', () => {
    expect(browserLocalStorage()).toBeNull();
    const storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    expect(browserLocalStorage()).toBe(storage);
    vi.unstubAllGlobals();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    try {
      expect(browserLocalStorage()).toBeNull();
    } finally {
      delete (globalThis as {localStorage?: unknown}).localStorage;
    }
  });
});

function setupStorageFrom(recent: ReturnType<typeof createRecentLinks>): RecentLinksStorage {
  const storage = new MemoryStorage();
  storage.setItem(RECENT_LINKS_STORAGE_KEY, JSON.stringify({version: 1, links: recent.list()}));
  return storage;
}
