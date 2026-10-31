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

type MemoryStorage = RecentLinksStorage & {values: Map<string, string>; failGet: boolean; failSet: boolean; failRemove: boolean};

/** An in-memory storage whose methods can be made to throw, like blocked or full local storage. */
function memoryStorage(): MemoryStorage {
  const storage: MemoryStorage = {
    values: new Map<string, string>(),
    failGet: false,
    failSet: false,
    failRemove: false,
    getItem: (key) => {
      if (storage.failGet) throw new DOMException('blocked', 'SecurityError');
      return storage.values.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (storage.failSet) throw new DOMException('full', 'QuotaExceededError');
      storage.values.set(key, String(value));
    },
    removeItem: (key) => {
      if (storage.failRemove) throw new DOMException('blocked', 'SecurityError');
      storage.values.delete(key);
    },
  };
  return storage;
}

function setup(start = 1_000) {
  const storage = memoryStorage();
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

describe('createRecentLinks record', () => {
  it('returns an empty list when nothing was recorded', () => {
    expect(setup().recent.list()).toEqual([]);
  });

  it('returns links newest first with path, state, title and openedAt when two links are recorded', () => {
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

  it('returns one entry, at the top with the new title, when a recorded link is recorded again', () => {
    const {recent} = setup();
    recent.record(link(1));
    recent.record(link(2));
    recent.record({...link(1), title: 'Renamed'});
    expect(recent.list().map(l => [l.state, l.title, l.openedAt])).toEqual([
      ['N4Ig1', 'Renamed', 1_003],
      ['N4Ig2', 'List 2', 1_002],
    ]);
  });

  it('returns one entry with + in the state when the path has a trailing slash or the state has spaces', () => {
    const {recent} = setup();
    recent.record({path: '/rank/overwatch/tank/', state: 'N4Ig a+b'});
    recent.record({path: '/rank/overwatch/tank', state: 'N4Ig+a b'});
    expect(recent.list()).toHaveLength(1);
    expect(recent.list()[0]).toMatchObject({path: '/rank/overwatch/tank', state: 'N4Ig+a+b'});
    expect(recentLinkKey({path: '/rank/x/', state: 'a b'})).toBe(recentLinkKey({path: '/rank/x', state: 'a+b'}));
    expect(recentLinkKey({path: '/rank/x', state: 'a'})).not.toBe(recentLinkKey({path: '/rank/y', state: 'a'}));
  });

  it('returns ok true with an empty state and title when the link has no state or title', () => {
    const {recent} = setup();
    expect(recent.record({path: '/rank'}).ok).toBe(true);
    expect(recent.record({path: '/rank/overwatch', state: null, title: null}).ok).toBe(true);
    expect(recent.list().map(l => [l.path, l.state, l.title])).toEqual([
      ['/rank/overwatch', '', ''],
      ['/rank', '', ''],
    ]);
  });

  it('returns ok true when recording each golden link state, the 430-item list included', () => {
    const fixtures = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../fixtures/state/generated.json'), 'utf8')) as {state: string}[];
    const longest = Math.max(...fixtures.map(f => f.state.length));
    expect(longest).toBeLessThan(RECENT_LINK_LIMITS.maxStateChars);
    const {recent} = setup();
    for (const fixture of fixtures) {
      expect(recent.record({path: '/rank/overwatch/all', state: fixture.state}).ok).toBe(true);
    }
  });

  it('returns reason invalid-link and writes nothing when the path is no /rank path or the state value is bad', () => {
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
      {path: '/rank/%2e%2e/%2e%2e/api/og'},
      {path: '/rank/%2E%2E'},
      {path: '/rank/x/%2e'},
      {path: '/rank/.%2e/x'},
      {path: '/rank/%2e./x'},
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
    // A dot or %2e inside a longer segment is an ordinary name.
    expect(recent.record({path: '/rank/a%2eb/v1.2'}).ok).toBe(true);
  });

  it('returns titles cut to maxTitleChars without half an emoji when the title is longer', () => {
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

  it(`returns the ${RECENT_UNPINNED_LIMIT} newest unpinned links when more are recorded`, () => {
    const {recent} = setup();
    for (let n = 1; n <= RECENT_UNPINNED_LIMIT + 5; n++) recent.record(link(n));
    const states = recent.list().map(l => l.state);
    expect(states).toHaveLength(RECENT_UNPINNED_LIMIT);
    expect(states[0]).toBe(`N4Ig${RECENT_UNPINNED_LIMIT + 5}`);
    expect(states.at(-1)).toBe('N4Ig6');
  });
});

describe('createRecentLinks pin and unpin', () => {
  it('returns the pinned link first when more than RECENT_UNPINNED_LIMIT others are recorded', () => {
    const {recent} = setup();
    recent.record(link(1));
    expect(recent.pin(link(1)).ok).toBe(true);
    for (let n = 2; n <= RECENT_UNPINNED_LIMIT + 10; n++) recent.record(link(n));
    const list = recent.list();
    expect(list[0]).toMatchObject({state: 'N4Ig1', pinned: true});
    expect(list.filter(l => !l.pinned)).toHaveLength(RECENT_UNPINNED_LIMIT);
  });

  it(`returns reason pin-limit when ${RECENT_PIN_LIMIT} links are pinned already`, () => {
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

  it('returns pinned links by pin time first, then the others by openedAt, when some links are pinned', () => {
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

  it('returns the link pinned with its pinnedAt and the new title when a pinned link is recorded again', () => {
    const {recent} = setup();
    recent.record(link(1));
    recent.pin(link(1));
    const pinnedAt = recent.list()[0].pinnedAt;
    recent.record({...link(1), title: 'New title'});
    expect(recent.list()[0]).toMatchObject({pinned: true, pinnedAt, title: 'New title', openedAt: 1_003});
  });

  it('returns ok and the same list when pinning a pinned link or unpinning an unpinned one', () => {
    const {recent} = setup();
    recent.record(link(1));
    recent.pin(link(1));
    const before = recent.list();
    expect(recent.pin(link(1))).toEqual({ok: true, links: before});
    recent.record(link(2));
    const after = recent.list();
    expect(recent.unpin(link(2))).toEqual({ok: true, links: after});
  });

  it('returns the unpinned link last, without pinnedAt, when it is older than all the others', () => {
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

  it('returns reason not-found when pin, unpin or remove gets a link that is not in the list', () => {
    const {recent} = setup();
    recent.record(link(1));
    expect(recent.pin(link(2))).toMatchObject({ok: false, reason: 'not-found'});
    expect(recent.unpin(link(2))).toMatchObject({ok: false, reason: 'not-found'});
    expect(recent.remove(link(2))).toMatchObject({ok: false, reason: 'not-found'});
    expect(recent.pin({path: 'javascript:alert(1)'})).toMatchObject({ok: false, reason: 'invalid-link'});
  });
});

describe('createRecentLinks remove and clear', () => {
  it('returns the list without the link when remove gets a pinned link', () => {
    const {recent} = setup();
    for (let n = 1; n <= 3; n++) recent.record(link(n));
    recent.pin(link(2));
    expect(paths(recent.remove(link(2)).links)).toEqual(paths(recent.list()));
    expect(recent.list().map(l => l.state)).toEqual(['N4Ig3', 'N4Ig1']);
  });

  it('writes no key to storage and returns an empty list when clear runs', () => {
    const {recent, storage} = setup();
    recent.record(link(1));
    recent.pin(link(1));
    expect(recent.clear()).toEqual({ok: true, links: []});
    expect(storage.values.size).toBe(0);
  });
});

describe('createRecentLinks storage', () => {
  it('writes {version: 1, links} under RECENT_LINKS_STORAGE_KEY when a link is recorded and pinned', () => {
    const {recent, stored} = setup();
    recent.record(link(1));
    recent.pin(link(1));
    expect(stored()).toEqual({
      version: 1,
      links: [{path: '/rank/overwatch/tank', state: 'N4Ig1', title: 'List 1', openedAt: 1_001, pinned: true, pinnedAt: 1_002}],
    });
  });

  it('returns the same frozen list object when list runs again without a stored change', () => {
    const {recent} = setup();
    recent.record(link(1));
    const first = recent.list();
    expect(recent.list()).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first[0])).toBe(true);
    recent.record(link(2));
    expect(recent.list()).not.toBe(first);
  });

  it('returns the links of another createRecentLinks when both use the same storage (another tab)', () => {
    const {recent, storage} = setup();
    const otherTab = createRecentLinks(storage, {now: () => 5_000});
    recent.record(link(1));
    otherTab.record(link(2));
    expect(recent.list().map(l => l.state)).toEqual(['N4Ig2', 'N4Ig1']);
  });

  it('returns an empty list and reason storage-unavailable when storage is null or undefined', () => {
    for (const storage of [null, undefined]) {
      const recent = createRecentLinks(storage);
      expect(recent.list()).toEqual([]);
      expect(recent.record(link(1))).toEqual({ok: false, reason: 'storage-unavailable', links: []});
      expect(recent.clear()).toEqual({ok: false, reason: 'storage-unavailable', links: []});
    }
  });

  it('returns reason storage-unavailable and throws no error when storage is blocked or full', () => {
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

  it('returns openedAt from Date.now when the injected clock returns NaN', () => {
    const storage = memoryStorage();
    const recent = createRecentLinks(storage, {now: () => Number.NaN});
    const before = Date.now();
    recent.record(link(1));
    expect(recent.list()[0].openedAt).toBeGreaterThanOrEqual(before);
  });

  it('writes under options.key when called with another key', () => {
    const storage = memoryStorage();
    createRecentLinks(storage, {key: 'other'}).record(link(1));
    expect(Array.from(storage.values.keys())).toEqual(['other']);
  });
});

describe('createRecentLinks with untrusted stored data', () => {
  const valid = {path: '/rank/a', state: 'N4Ig', title: 'A', openedAt: 10, pinned: false};

  function load(value: unknown) {
    const storage = memoryStorage();
    storage.values.set(RECENT_LINKS_STORAGE_KEY, typeof value === 'string' ? value : JSON.stringify(value));
    return createRecentLinks(storage).list();
  }

  it('returns an empty list when the stored value is not version 1 with a links array', () => {
    for (const value of ['not json', '', 'null', '[]', '"x"', '{}', {version: 2, links: [valid]}, {version: 1}, {version: 1, links: {}}, {links: [valid]}]) {
      expect(load(value), JSON.stringify(value)).toEqual([]);
    }
  });

  it('returns only the valid entries when stored entries have bad paths, states, titles or times', () => {
    const bad = [
      null,
      'x',
      [],
      {...valid, path: 'javascript:alert(1)'},
      {...valid, path: '//evil.example/rank'},
      {...valid, path: '/rank/../x'},
      {...valid, path: '/rank/%2e%2e/%2e%2e/api/og'},
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

  it('returns the valid first entry within 3 times the JSON.parse time when 100,000 entries are stored', () => {
    const raw = JSON.stringify({version: 1, links: [valid, ...Array(100_000).fill({})]});
    let started = performance.now();
    JSON.parse(raw);
    const parseTime = performance.now() - started;
    started = performance.now();
    expect(load(raw)).toEqual([valid]);
    // Checking every entry took about 18 times as long as JSON.parse.
    expect(performance.now() - started).toBeLessThan(parseTime * 3 + 300);
  });

  it('returns plain entries without extra fields when stored JSON has unknown fields and __proto__ keys', () => {
    const text = `{"version":1,"__proto__":{"polluted":true},"links":[{"path":"/rank/a","state":"N4Ig","title":"A","openedAt":10,"pinned":false,"extra":1,"__proto__":{"polluted":true}}]}`;
    const [entry] = load(text);
    expect(entry).toEqual(valid);
    expect(Object.getPrototypeOf(entry)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('returns one entry with the newer openedAt and the pin when stored entries repeat a link', () => {
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

  it('returns pinnedAt equal to openedAt when a pinned entry has no pinnedAt', () => {
    expect(load({version: 1, links: [{...valid, pinned: true}]})).toEqual([{...valid, pinned: true, pinnedAt: 10}]);
  });

  it('returns RECENT_PIN_LIMIT pins and RECENT_UNPINNED_LIMIT others when stored data passes both caps', () => {
    const pins = Array.from({length: RECENT_PIN_LIMIT + 3}, (_, i) => ({...valid, path: `/rank/pin${i}`, openedAt: 100 + i, pinned: true, pinnedAt: 200 + i}));
    const others = Array.from({length: RECENT_UNPINNED_LIMIT + 5}, (_, i) => ({...valid, path: `/rank/other${i}`, openedAt: 1_000 + i}));
    const list = load({version: 1, links: [...pins, ...others]});
    const pinned = list.filter(l => l.pinned);
    expect(pinned).toHaveLength(RECENT_PIN_LIMIT);
    expect(pinned.map(l => l.path)).not.toContain('/rank/pin0');
    expect(list.filter(l => !l.pinned)).toHaveLength(RECENT_UNPINNED_LIMIT);
  });
});

describe('recentLinkHref and browserLocalStorage', () => {
  it('returns path?state= with the state URL-encoded when the state is set, and the path alone when empty', () => {
    expect(recentLinkHref({path: '/rank/overwatch/tank', state: 'N4Ig+a$b-c'})).toBe('/rank/overwatch/tank?state=N4Ig%2Ba%24b-c');
    expect(recentLinkHref({path: '/rank/overwatch/tank', state: '3.abc)'})).toBe('/rank/overwatch/tank?state=3.abc)');
    expect(recentLinkHref({path: '/rank/overwatch', state: ''})).toBe('/rank/overwatch');
    expect(new URL(recentLinkHref({path: '/rank/x', state: 'a+b&c=#d'}), 'https://opentierboy.com').searchParams.get('state')).toBe('a+b&c=#d');
  });

  it('returns localStorage when it exists, and null when it is missing or throws on access', () => {
    expect(browserLocalStorage()).toBeNull();
    const storage = memoryStorage();
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
  const storage = memoryStorage();
  storage.setItem(RECENT_LINKS_STORAGE_KEY, JSON.stringify({version: 1, links: recent.list()}));
  return storage;
}
