import {describe, expect, it} from 'vitest';
import type {StringStorage} from '@/lib/images/localLists';
import {addTemplateIndex, MAX_TEMPLATE_INDICES, readTemplateIndices, removeTemplateIndex, TEMPLATE_INDICES_KEY} from '@/lib/templates/indexList';

const index = (name: string) => `https://raw.githubusercontent.com/alice/${name}/main/index.json`;

function memoryStorage(initial?: string): StringStorage & {value: () => string | null} {
  let stored: string | null = initial ?? null;
  return {
    getItem: (key) => (key === TEMPLATE_INDICES_KEY ? stored : null),
    setItem: (_key, value) => {
      stored = value;
    },
    removeItem: () => {
      stored = null;
    },
    value: () => stored,
  };
}

const failingStorage: StringStorage = {
  getItem: () => null,
  setItem: () => {
    throw new Error('quota');
  },
  removeItem: () => undefined,
};

describe('readTemplateIndices', () => {
  it('returns an empty list when storage is missing, empty, damaged or too long', () => {
    expect(readTemplateIndices(null)).toEqual([]);
    expect(readTemplateIndices(memoryStorage())).toEqual([]);
    for (const raw of ['{', '"text"', '{"a":1}', '7', JSON.stringify([index('a')]).padEnd(60_000, ' ')]) {
      expect(readTemplateIndices(memoryStorage(raw)), raw.slice(0, 20)).toEqual([]);
    }
  });

  it('returns only allowed index addresses, each once, when storage has other values too', () => {
    const raw = JSON.stringify([index('a'), 7, null, 'https://example.org/a/b/c/index.json', 'javascript:alert(1)', index('a'), `${index('b')}?x=1`, index('c')]);
    expect(readTemplateIndices(memoryStorage(raw))).toEqual([index('a'), index('c')]);
  });

  it('returns at most 10 addresses when storage has more', () => {
    const raw = JSON.stringify(Array.from({length: 15}, (_, number) => index(`r${number}`)));
    expect(readTemplateIndices(memoryStorage(raw))).toHaveLength(MAX_TEMPLATE_INDICES);
  });
});

describe('addTemplateIndex', () => {
  it('writes the address after the others when the address is new and allowed', () => {
    const storage = memoryStorage(JSON.stringify([index('a')]));
    expect(addTemplateIndex(index('b'), storage)).toEqual({ok: true, indices: [index('a'), index('b')]});
    expect(storage.value()).toBe(JSON.stringify([index('a'), index('b')]));
  });

  it('returns a failure and writes no change when the address is refused, listed or one too many', () => {
    const storage = memoryStorage(JSON.stringify([index('a')]));
    expect(addTemplateIndex('https://example.org/a/b/c/index.json', storage)).toEqual({ok: false, reason: 'address'});
    expect(addTemplateIndex(index('a'), storage)).toEqual({ok: false, reason: 'listed'});
    expect(storage.value()).toBe(JSON.stringify([index('a')]));
    const full = memoryStorage(JSON.stringify(Array.from({length: MAX_TEMPLATE_INDICES}, (_, number) => index(`r${number}`))));
    expect(addTemplateIndex(index('new'), full)).toEqual({ok: false, reason: 'full'});
  });

  it('returns the failure "storage" when the browser cannot save', () => {
    expect(addTemplateIndex(index('a'), failingStorage)).toEqual({ok: false, reason: 'storage'});
    expect(addTemplateIndex(index('a'), null)).toEqual({ok: false, reason: 'storage'});
  });
});

describe('removeTemplateIndex', () => {
  it('writes the list without the address, and clears the key when the list becomes empty', () => {
    const storage = memoryStorage(JSON.stringify([index('a'), index('b')]));
    expect(removeTemplateIndex(index('a'), storage)).toEqual([index('b')]);
    expect(storage.value()).toBe(JSON.stringify([index('b')]));
    expect(removeTemplateIndex(index('b'), storage)).toEqual([]);
    expect(storage.value()).toBeNull();
  });
});
