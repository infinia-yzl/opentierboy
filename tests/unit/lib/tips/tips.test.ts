import {describe, expect, it} from 'vitest';
import {
  endSession,
  finishTip,
  hideTips,
  loadStoredTips,
  openedFromLinkLoad,
  parseStoredTips,
  requestTip,
  startSession,
  storedTipsText,
  TIPS_ON,
  TIPS_STORAGE_KEY,
  type TipsSession,
  type TipsStorage,
  usedBefore,
  withdrawTip,
  writeStoredTips,
} from '@/lib/tips/tips';

type MemoryStorage = TipsStorage & {values: Map<string, string>; failGet: boolean; failSet: boolean};

/** An in-memory storage whose methods can be made to throw, like blocked or full local storage. */
function memoryStorage(entries: Record<string, string> = {}): MemoryStorage {
  const storage: MemoryStorage = {
    values: new Map(Object.entries(entries)),
    failGet: false,
    failSet: false,
    getItem: (key) => {
      if (storage.failGet) throw new DOMException('blocked', 'SecurityError');
      return storage.values.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (storage.failSet) throw new DOMException('full', 'QuotaExceededError');
      storage.values.set(key, String(value));
    },
    removeItem: (key) => {
      storage.values.delete(key);
    },
  };
  return storage;
}

const fresh = (): TipsSession => startSession(TIPS_ON);

describe('parseStoredTips', () => {
  it('returns the seen tips and off when the value is valid', () => {
    expect(parseStoredTips('{"seen":["first-drag","link-save"],"off":false}')).toEqual({seen: ['first-drag', 'link-save'], off: false});
  });

  it('returns the seen tips without unknown ids and repeats when the value has them', () => {
    expect(parseStoredTips('{"seen":["first-drag","later-tip","first-drag"],"off":true}')).toEqual({seen: ['first-drag'], off: true});
  });

  it.each([
    ['missing', null],
    ['not JSON', '{seen'],
    ['an array', '[]'],
    ['without off', '{"seen":[]}'],
    ['off as a string', '{"seen":[],"off":"yes"}'],
    ['over 1,000 characters', JSON.stringify({seen: [], off: false, pad: 'x'.repeat(1_000)})],
  ])('returns null when the value is %s', (_, raw) => {
    expect(parseStoredTips(raw)).toBeNull();
  });
});

describe('storedTipsText', () => {
  it('returns JSON that parseStoredTips reads back when the tips are stored', () => {
    const tips = {seen: ['shared-list' as const], off: true};
    expect(parseStoredTips(storedTipsText(tips))).toEqual(tips);
  });
});

describe('usedBefore', () => {
  it('returns false when the storage is empty', () => {
    expect(usedBefore(memoryStorage())).toBe(false);
  });

  it.each([
    ['theme', 'dark'],
    ['otb-font', 'classic'],
    ['otb-game-colours', 'off'],
  ])('returns true when the storage has the appearance key %s', (key, value) => {
    expect(usedBefore(memoryStorage({[key]: value}))).toBe(true);
  });

  it('returns true when the storage has a Recently viewed entry', () => {
    const recent = JSON.stringify({version: 1, links: [{path: '/rank/overwatch/tank', state: '', title: '', openedAt: 1, pinned: false}]});
    expect(usedBefore(memoryStorage({'otb-recent-links': recent}))).toBe(true);
  });

  it('returns false when the Recently viewed value has no valid entry', () => {
    expect(usedBefore(memoryStorage({'otb-recent-links': '{"version":1,"links":[]}'}))).toBe(false);
  });
});

describe('loadStoredTips', () => {
  it('returns tips on and writes them when a new browser has no stored tips', () => {
    const storage = memoryStorage();
    expect(loadStoredTips(storage)).toEqual({seen: [], off: false});
    expect(storage.values.get(TIPS_STORAGE_KEY)).toBe('{"seen":[],"off":false}');
  });

  it('returns tips off and writes them when the browser has a saved appearance setting', () => {
    const storage = memoryStorage({'otb-font': 'classic'});
    expect(loadStoredTips(storage)).toEqual({seen: [], off: true});
    expect(storage.values.get(TIPS_STORAGE_KEY)).toBe('{"seen":[],"off":true}');
  });

  it('returns the stored tips when the browser has them and a saved appearance setting', () => {
    const storage = memoryStorage({[TIPS_STORAGE_KEY]: '{"seen":["link-save"],"off":false}', 'otb-font': 'classic'});
    expect(loadStoredTips(storage)).toEqual({seen: ['link-save'], off: false});
  });

  it('returns tips on when the storage is missing or throws', () => {
    expect(loadStoredTips(null)).toEqual(TIPS_ON);
    const blocked = memoryStorage();
    blocked.failGet = true;
    blocked.failSet = true;
    expect(loadStoredTips(blocked)).toEqual(TIPS_ON);
  });
});

describe('writeStoredTips', () => {
  it('returns false when the storage is full', () => {
    const full = memoryStorage();
    full.failSet = true;
    expect(writeStoredTips(full, TIPS_ON)).toBe(false);
  });
});

describe('requestTip', () => {
  it('returns a session with the tip on screen and seen when no tip is on screen', () => {
    const session = requestTip(fresh(), 'link-save');
    expect(session.current).toBe('link-save');
    expect(session.stored.seen).toEqual(['link-save']);
  });

  it('returns a session with the first-drag tip on screen and not seen when no tip is on screen', () => {
    const session = requestTip(fresh(), 'first-drag');
    expect(session.current).toBe('first-drag');
    expect(session.stored.seen).toEqual([]);
  });

  it('returns a session where the tip waits when another tip is on screen', () => {
    const session = requestTip(requestTip(fresh(), 'shared-list'), 'first-drag');
    expect(session.current).toBe('shared-list');
    expect(session.waiting).toEqual(['first-drag']);
  });

  it('returns the same session when the tip was seen, tips are off, or the tip already waits', () => {
    const seen = startSession({seen: ['link-save'], off: false});
    expect(requestTip(seen, 'link-save')).toBe(seen);
    const off = startSession({seen: [], off: true});
    expect(requestTip(off, 'first-drag')).toBe(off);
    const waiting = requestTip(requestTip(fresh(), 'shared-list'), 'first-drag');
    expect(requestTip(waiting, 'first-drag')).toBe(waiting);
    expect(requestTip(waiting, 'shared-list')).toBe(waiting);
  });
});

describe('finishTip', () => {
  it('returns a session with the next waiting tip on screen when the tip on screen ends', () => {
    const waiting = requestTip(requestTip(requestTip(fresh(), 'link-save'), 'device-images'), 'first-drag');
    const next = finishTip(waiting, 'link-save');
    expect(next.current).toBe('device-images');
    expect(next.waiting).toEqual(['first-drag']);
    expect(next.stored.seen).toEqual(['link-save', 'device-images']);
  });

  it('returns a session with the first-drag tip seen when the first drop ends it while it waits', () => {
    const waiting = requestTip(requestTip(fresh(), 'shared-list'), 'first-drag');
    const next = finishTip(waiting, 'first-drag');
    expect(next.current).toBe('shared-list');
    expect(next.waiting).toEqual([]);
    expect(next.stored.seen).toEqual(['shared-list', 'first-drag']);
  });

  it('returns a session with the tip seen when the tip never appeared', () => {
    expect(finishTip(fresh(), 'first-drag').stored.seen).toEqual(['first-drag']);
  });

  it('returns the same session when the tip was seen and is neither on screen nor waiting', () => {
    const seen = startSession({seen: ['first-drag'], off: false});
    expect(finishTip(seen, 'first-drag')).toBe(seen);
  });
});

describe('withdrawTip', () => {
  it('returns a session without the tip, not seen, and the next waiting tip on screen when the tip is on screen', () => {
    const waiting = requestTip(requestTip(fresh(), 'first-drag'), 'link-save');
    const next = withdrawTip(waiting, 'first-drag');
    expect(next.current).toBe('link-save');
    expect(next.stored.seen).toEqual(['link-save']);
  });

  it('returns the same session when the tip is neither on screen nor waiting', () => {
    const session = requestTip(fresh(), 'link-save');
    expect(withdrawTip(session, 'first-drag')).toBe(session);
  });
});

describe('hideTips', () => {
  it('returns a session with tips off and no tip on screen or waiting when a tip is on screen', () => {
    const session = hideTips(requestTip(requestTip(fresh(), 'first-drag'), 'link-save'));
    expect(session).toEqual({stored: {seen: [], off: true}, current: null, waiting: []});
    expect(requestTip(session, 'shared-list')).toBe(session);
  });
});

describe('endSession', () => {
  it('returns a session with no tip on screen or waiting and the same stored tips when the editor closes', () => {
    const session = requestTip(requestTip(fresh(), 'link-save'), 'first-drag');
    expect(endSession(session)).toEqual({stored: session.stored, current: null, waiting: []});
  });
});

describe('openedFromLinkLoad', () => {
  const PATH = '/rank/overwatch/tank';
  const STATE = 'N4IgzgxgTg9gtgSwF5wIYBcAWB7A';
  const link = `https://opentierboy.com${PATH}?state=${STATE}`;
  const opening = (navigation: {type: string; url: string} | null, editorOpenedBefore = false) =>
    ({navigation, pathname: PATH, state: STATE, editorOpenedBefore});

  it('returns true when the document was loaded for the editor\'s address and no editor opened before', () => {
    expect(openedFromLinkLoad(opening({type: 'navigate', url: link}))).toBe(true);
  });

  it('returns false when the document was loaded for another address (a router.push from the home page)', () => {
    expect(openedFromLinkLoad(opening({type: 'navigate', url: 'https://opentierboy.com/'}))).toBe(false);
    expect(openedFromLinkLoad(opening({type: 'navigate', url: `https://opentierboy.com${PATH}`}))).toBe(false);
  });

  it('returns false when an editor opened in this document before (Back after an in-app move)', () => {
    expect(openedFromLinkLoad(opening({type: 'navigate', url: link}, true))).toBe(false);
  });

  it('returns false when the page was reloaded or reached with Back or Forward', () => {
    expect(openedFromLinkLoad(opening({type: 'reload', url: link}))).toBe(false);
    expect(openedFromLinkLoad(opening({type: 'back_forward', url: link}))).toBe(false);
  });

  it('returns false when the browser has no navigation entry or its address cannot be read', () => {
    expect(openedFromLinkLoad(opening(null))).toBe(false);
    expect(openedFromLinkLoad(opening({type: 'navigate', url: 'not a url'}))).toBe(false);
  });

  it('returns true when the state parameter is percent-encoded in the document address', () => {
    const encoded = `https://opentierboy.com${PATH}?state=${encodeURIComponent('3.a+b$c')}`;
    expect(openedFromLinkLoad({navigation: {type: 'navigate', url: encoded}, pathname: PATH, state: '3.a+b$c', editorOpenedBefore: false})).toBe(true);
  });
});
