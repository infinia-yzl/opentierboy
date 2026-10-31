import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  ALLOWED_IMAGE_SITES_KEY,
  allowedSitesAsTrusted,
  browserLocalStorage,
  EVICTED_DEVICE_IMAGES_KEY,
  MAX_ALLOWED_IMAGE_SITES,
  MAX_EVICTED_DEVICE_IMAGES,
  readAllowedImageSites,
  readEvictedDeviceImages,
  rememberAllowedImageSites,
  type StringStorage,
  updateEvictedDeviceImages,
} from '@/lib/images/localLists';
import {isTrustedHost} from '@/lib/images/trustedSites';

function memoryStorage(initial: Record<string, string> = {}): StringStorage & {data: Map<string, string>} {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const throwing: StringStorage = {
  getItem: () => {
    throw new DOMException('denied', 'SecurityError');
  },
  setItem: () => {
    throw new DOMException('full', 'QuotaExceededError');
  },
  removeItem: () => {
    throw new DOMException('denied', 'SecurityError');
  },
};

afterEach(() => vi.unstubAllGlobals());

describe('always-allowed image sites', () => {
  it('remembers sites, each once, newest last', () => {
    const storage = memoryStorage();
    expect(rememberAllowedImageSites(['images.example.org', 'cdn.example.net'], storage)).toEqual(['images.example.org', 'cdn.example.net']);
    expect(rememberAllowedImageSites(['images.example.org'], storage)).toEqual(['cdn.example.net', 'images.example.org']);
    expect(readAllowedImageSites(storage)).toEqual(['cdn.example.net', 'images.example.org']);
    expect(JSON.parse(storage.data.get(ALLOWED_IMAGE_SITES_KEY)!)).toEqual(['cdn.example.net', 'images.example.org']);
  });

  it('keeps only hosts in their normal form that pass the link image rules', () => {
    const storage = memoryStorage({[ALLOWED_IMAGE_SITES_KEY]: JSON.stringify(['ok.example.org', 'localhost', '127.0.0.1', 'UPPER.example.org', 'x', 42, null, 'printer.local', 'ok.example.org'])});
    expect(readAllowedImageSites(storage)).toEqual(['ok.example.org']);
    expect(rememberAllowedImageSites(['10.0.0.1', 'a.example.org'], storage)).toEqual(['ok.example.org', 'a.example.org']);
  });

  it('caps the list, dropping the oldest', () => {
    const storage = memoryStorage();
    const hosts = Array.from({length: MAX_ALLOWED_IMAGE_SITES + 5}, (_, index) => `s${index}.example.org`);
    const stored = rememberAllowedImageSites(hosts, storage);
    expect(stored).toHaveLength(MAX_ALLOWED_IMAGE_SITES);
    expect(stored[0]).toBe('s5.example.org');
  });

  it('reads damaged or foreign values as an empty list', () => {
    for (const value of ['not json', '{"a":1}', '"x"', '[', 'x'.repeat(300_000)]) {
      expect(readAllowedImageSites(memoryStorage({[ALLOWED_IMAGE_SITES_KEY]: value})), value.slice(0, 20)).toEqual([]);
    }
  });

  it('never throws when storage is missing or blocked', () => {
    expect(readAllowedImageSites(null)).toEqual([]);
    expect(readAllowedImageSites(throwing)).toEqual([]);
    expect(rememberAllowedImageSites(['a.example.org'], throwing)).toEqual(['a.example.org']);
    vi.stubGlobal('localStorage', undefined);
    expect(browserLocalStorage()).toBeNull();
    Object.defineProperty(globalThis, 'localStorage', {configurable: true, get: () => {
      throw new DOMException('denied', 'SecurityError');
    }});
    try {
      expect(browserLocalStorage()).toBeNull();
      expect(readAllowedImageSites()).toEqual([]);
    } finally {
      delete (globalThis as {localStorage?: unknown}).localStorage;
    }
  });

  it('turns allowed sites into exact-host trusted site entries', () => {
    const sites = allowedSitesAsTrusted(['images.example.org']);
    expect(isTrustedHost('images.example.org', sites)).toBe(true);
    expect(isTrustedHost('cdn.images.example.org', sites)).toBe(false);
  });
});

describe('device images removed to make room', () => {
  it('adds removed ids and drops ids that were stored again', () => {
    const storage = memoryStorage();
    expect(updateEvictedDeviceImages({evicted: ['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb']}, storage)).toEqual(['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb']);
    expect(updateEvictedDeviceImages({stored: ['aaaaaaaaaaaaaaaa']}, storage)).toEqual(['bbbbbbbbbbbbbbbb']);
    expect(readEvictedDeviceImages(storage)).toEqual(['bbbbbbbbbbbbbbbb']);
    expect(updateEvictedDeviceImages({stored: ['bbbbbbbbbbbbbbbb']}, storage)).toEqual([]);
    expect(storage.data.has(EVICTED_DEVICE_IMAGES_KEY)).toBe(false);
  });

  it('keeps only valid device ids, and caps the list', () => {
    const storage = memoryStorage({[EVICTED_DEVICE_IMAGES_KEY]: JSON.stringify(['short', '__proto__', 'legacy-ab3c9', 'has space here'])});
    expect(readEvictedDeviceImages(storage)).toEqual(['legacy-ab3c9']);
    const many = Array.from({length: MAX_EVICTED_DEVICE_IMAGES + 3}, (_, index) => `image-${String(index).padStart(6, '0')}`);
    expect(updateEvictedDeviceImages({evicted: many}, storage)).toHaveLength(MAX_EVICTED_DEVICE_IMAGES);
  });

  it('writes nothing when nothing changes, and never throws', () => {
    const storage = memoryStorage();
    const setItem = vi.spyOn(storage, 'setItem');
    updateEvictedDeviceImages({stored: ['aaaaaaaaaaaaaaaa']}, storage);
    expect(setItem).not.toHaveBeenCalled();
    expect(updateEvictedDeviceImages({evicted: ['aaaaaaaaaaaaaaaa']}, throwing)).toEqual(['aaaaaaaaaaaaaaaa']);
  });
});
