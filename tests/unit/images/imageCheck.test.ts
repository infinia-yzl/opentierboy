import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  checkImage,
  DEFAULT_IMAGE_CHECK_LIMITS,
  type ImageLike,
  labelFallback,
  MAX_FALLBACK_TEXT_LENGTH,
} from '@/lib/images/imageCheck';

/** An Image stand-in. It records what was set before `src`, and the test decides how loading ends. */
class FakeImage implements ImageLike {
  referrerPolicy = '';
  decoding = '';
  crossOrigin: string | null = null;
  onload: (() => unknown) | null = null;
  onerror: (() => unknown) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  sources: {src: string; referrerPolicy: string; crossOrigin: string | null}[] = [];
  private current = '';

  get src() {
    return this.current;
  }

  set src(value: string) {
    this.current = value;
    this.sources.push({src: value, referrerPolicy: this.referrerPolicy, crossOrigin: this.crossOrigin});
  }

  load(width: number, height: number) {
    this.naturalWidth = width;
    this.naturalHeight = height;
    this.onload?.();
  }

  fail() {
    this.onerror?.();
  }
}

function setup() {
  const images: FakeImage[] = [];
  const createImage = vi.fn(() => {
    const image = new FakeImage();
    images.push(image);
    return image;
  });
  return {images, createImage};
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('checkImage', () => {
  it('loads a link image without a referrer and reports its size', async () => {
    const {images, createImage} = setup();
    const result = checkImage('https://i.imgur.com/abc.png', {createImage});
    expect(images).toHaveLength(1);
    images[0].load(256, 128);
    expect(await result).toEqual({ok: true, src: 'https://i.imgur.com/abc.png', width: 256, height: 128});
    // referrerPolicy was already set when src started the download.
    expect(images[0].sources).toEqual([{src: 'https://i.imgur.com/abc.png', referrerPolicy: 'no-referrer', crossOrigin: null}]);
    expect(images[0].decoding).toBe('async');
  });

  it('loads the normalised address', async () => {
    const {images, createImage} = setup();
    const result = checkImage(' HTTPS://I.IMGUR.COM.:443/abc.png ', {createImage});
    images[0].load(10, 10);
    expect(await result).toMatchObject({ok: true, src: 'https://i.imgur.com/abc.png'});
  });

  it('asks for CORS only when told to', async () => {
    const {images, createImage} = setup();
    const result = checkImage('https://upload.wikimedia.org/a.png', {createImage, crossOrigin: 'anonymous'});
    images[0].load(10, 10);
    await result;
    expect(images[0].sources[0].crossOrigin).toBe('anonymous');
  });

  it('accepts blob: URLs of device images', async () => {
    const {images, createImage} = setup();
    const url = 'blob:https://opentierboy.com/0f8e7c1a-2b3d-4e5f-8a9b-0c1d2e3f4a5b';
    const result = checkImage(url, {createImage, label: 'My cat'});
    images[0].load(64, 64);
    expect(await result).toEqual({ok: true, src: url, width: 64, height: 64});
  });

  it('refuses addresses that break the link image rules, without loading anything', async () => {
    const {createImage} = setup();
    for (const src of [
      'http://i.imgur.com/a.png',
      'https://127.0.0.1/a.png',
      'https://localhost:3000/a.png',
      'data:image/png;base64,AAAA',
      'javascript:alert(1)',
      'blob:null/abc',
      'blob:javascript:alert(1)',
      '',
      42 as unknown as string,
    ]) {
      expect(await checkImage(src, {createImage, label: 'Item'}), String(src)).toEqual({
        ok: false,
        reason: 'invalid-url',
        fallback: {text: 'Item', domain: ''},
      });
    }
    expect(createImage).not.toHaveBeenCalled();
  });

  it('reports a load error with label-fallback data, and stops the download', async () => {
    const {images, createImage} = setup();
    const result = checkImage('https://cdn.deadlock.wiki/thumb/Abrams_vertical.png/74px-Abrams_vertical.png', {createImage});
    images[0].fail();
    expect(await result).toEqual({ok: false, reason: 'error', fallback: {text: 'Abrams vertical', domain: 'cdn.deadlock.wiki'}});
    expect(images[0].src).toBe('');
    expect(images[0].onload).toBeNull();
    expect(images[0].onerror).toBeNull();
  });

  it('gives up after the timeout, and ignores a late load', async () => {
    vi.useFakeTimers();
    const {images, createImage} = setup();
    const result = checkImage('https://i.imgur.com/slow.png', {createImage, label: 'Slow', limits: {timeoutMs: 1_000}});
    await vi.advanceTimersByTimeAsync(999);
    images[0].load(10, 10);
    expect(await result).toEqual({ok: true, src: 'https://i.imgur.com/slow.png', width: 10, height: 10});

    const slow = checkImage('https://i.imgur.com/slow.png', {createImage, label: 'Slow', limits: {timeoutMs: 1_000}});
    const onload = images[1].onload;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await slow).toEqual({ok: false, reason: 'timeout', fallback: {text: 'Slow', domain: 'i.imgur.com'}});
    expect(images[1].src).toBe('');
    // The old handler no longer changes the result.
    images[1].naturalWidth = 10;
    images[1].naturalHeight = 10;
    onload?.();
    expect(await slow).toMatchObject({reason: 'timeout'});
  });

  it('waits 10 seconds by default', async () => {
    vi.useFakeTimers();
    const {createImage} = setup();
    const result = checkImage('https://i.imgur.com/slow.png', {createImage});
    await vi.advanceTimersByTimeAsync(9_999);
    let settled = false;
    void result.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toMatchObject({ok: false, reason: 'timeout'});
  });

  it('refuses images over the size limits', async () => {
    const limits = {maxWidth: 100, maxHeight: 50, maxPixels: 3_000};
    const cases: [number, number, string][] = [
      [101, 10, 'too-large'],
      [10, 51, 'too-large'],
      [100, 31, 'too-large'],
      [100, 30, 'ok'],
      [0, 0, 'no-size'],
      [10, 0, 'no-size'],
      [Number.NaN, 10, 'no-size'],
    ];
    for (const [width, height, expected] of cases) {
      const {images, createImage} = setup();
      const result = checkImage('https://i.imgur.com/a.png', {createImage, limits});
      images[0].load(width, height);
      const outcome = await result;
      expect(outcome.ok ? 'ok' : outcome.reason, `${width}×${height}`).toBe(expected);
    }
  });

  it('uses generous default limits', () => {
    expect(DEFAULT_IMAGE_CHECK_LIMITS).toEqual({maxWidth: 8192, maxHeight: 8192, maxPixels: 32 * 1024 * 1024, timeoutMs: 10_000});
  });

  it('stops when the signal aborts, before or during loading', async () => {
    const {images, createImage} = setup();
    const before = new AbortController();
    before.abort();
    expect(await checkImage('https://i.imgur.com/a.png', {createImage, signal: before.signal})).toMatchObject({ok: false, reason: 'aborted'});
    expect(createImage).not.toHaveBeenCalled();

    const during = new AbortController();
    const result = checkImage('https://i.imgur.com/a.png', {createImage, signal: during.signal});
    during.abort();
    expect(await result).toMatchObject({ok: false, reason: 'aborted'});
    expect(images[0].src).toBe('');
  });

  it('reports "unsupported" where there is no Image element', async () => {
    vi.stubGlobal('Image', undefined);
    expect(await checkImage('https://i.imgur.com/a.png')).toMatchObject({ok: false, reason: 'unsupported'});
    const throwing = () => {
      throw new Error('no images here');
    };
    expect(await checkImage('https://i.imgur.com/a.png', {createImage: throwing})).toMatchObject({ok: false, reason: 'unsupported'});
  });

  it('uses the global Image by default', async () => {
    const {images} = setup();
    vi.stubGlobal('Image', class extends FakeImage {
      constructor() {
        super();
        images.push(this);
      }
    });
    const result = checkImage('https://i.imgur.com/a.png');
    images[0].load(20, 20);
    expect(await result).toMatchObject({ok: true, width: 20});
  });

  it('reports an error when setting src throws', async () => {
    const createImage = () => {
      const image = new FakeImage();
      Object.defineProperty(image, 'src', {set: () => {
        throw new Error('blocked');
      }, get: () => ''});
      return image;
    };
    expect(await checkImage('https://i.imgur.com/a.png', {createImage})).toMatchObject({ok: false, reason: 'error'});
  });

  it('refuses limits that make no sense', () => {
    expect(() => checkImage('https://i.imgur.com/a.png', {limits: {timeoutMs: 0}})).toThrow(RangeError);
    expect(() => checkImage('https://i.imgur.com/a.png', {limits: {maxPixels: Number.NaN}})).toThrow(RangeError);
  });
});

describe('labelFallback', () => {
  it('uses the label first, with spaces tidied', () => {
    expect(labelFallback('https://i.imgur.com/abc.png', '  Mauga  the\n tank ')).toEqual({text: 'Mauga the tank', domain: 'i.imgur.com'});
  });

  it('makes a name from the file name when there is no label', () => {
    const cases: [string, string][] = [
      ['https://www.thefinals.wiki/w/images/f/f7/Arenas_S2-Icon.png', 'Arenas S2 Icon'],
      ['https://cdn.deadlock.wiki/thumb/Abrams_vertical.png/74px-Abrams_vertical.png', 'Abrams vertical'],
      ['https://i.imgur.com/%C3%A9clair+au+chocolat.webp?x=1#y', 'éclair au chocolat'],
      ['https://i.imgur.com/bad%E0%A4%A.png', 'bad%E0%A4%A'],
      ['https://i.imgur.com/folder/', 'folder'],
      ['https://i.imgur.com/no-extension', 'no extension'],
    ];
    for (const [url, text] of cases) expect(labelFallback(url).text, url).toBe(text);
  });

  it('falls back to the domain, and to empty text for device images', () => {
    expect(labelFallback('https://www.thefinals.wiki/')).toEqual({text: 'thefinals.wiki', domain: 'thefinals.wiki'});
    expect(labelFallback('https://i.imgur.com/.png')).toEqual({text: 'i.imgur.com', domain: 'i.imgur.com'});
    expect(labelFallback('blob:https://opentierboy.com/0f8e7c1a')).toEqual({text: '', domain: ''});
    expect(labelFallback('blob:https://opentierboy.com/0f8e7c1a', 'Cat')).toEqual({text: 'Cat', domain: ''});
  });

  it('never shows a domain for an address that breaks the rules', () => {
    expect(labelFallback('http://192.168.1.1/admin.png', 'x')).toEqual({text: 'x', domain: ''});
    expect(labelFallback('javascript:alert(1)')).toEqual({text: '', domain: ''});
  });

  it('strips bidirectional controls, which could disguise a file name', () => {
    // U+202E (right-to-left override) would show "gnp.exe" as "exe.png".
    expect(labelFallback('https://i.imgur.com/%E2%80%AEgnp.exe')).toEqual({text: 'gnp', domain: 'i.imgur.com'});
    expect(labelFallback('https://i.imgur.com/a.png', 'Cat\u202egnp.exe\u202c and \u2066dog\u2069')).toEqual({text: 'Catgnp.exe and dog', domain: 'i.imgur.com'});
    for (const control of ['\u202a', '\u202b', '\u202c', '\u202d', '\u202e', '\u2066', '\u2067', '\u2068', '\u2069']) {
      expect(labelFallback('blob:https://opentierboy.com/x', `a${control}b`).text).toBe('ab');
    }
    // A label made only of controls falls back to the file name.
    expect(labelFallback('https://i.imgur.com/cat.png', '\u202e\u2066').text).toBe('cat');
  });

  it('caps the text length without splitting characters', () => {
    const long = '😀'.repeat(MAX_FALLBACK_TEXT_LENGTH + 10);
    const {text} = labelFallback('https://i.imgur.com/a.png', long);
    expect(Array.from(text)).toHaveLength(MAX_FALLBACK_TEXT_LENGTH);
    expect(text).toBe('😀'.repeat(MAX_FALLBACK_TEXT_LENGTH));
    expect(Array.from(labelFallback(`https://i.imgur.com/${'a'.repeat(500)}.png`).text)).toHaveLength(MAX_FALLBACK_TEXT_LENGTH);
  });

  it('never throws, whatever the input', () => {
    for (const [src, label] of [[undefined, undefined], [null, 42], [{}, {}], ['%', ['x']], ['https://i.imgur.com/%', null]] as [unknown, unknown][]) {
      expect(() => labelFallback(src, label)).not.toThrow();
    }
    expect(labelFallback({}, {})).toEqual({text: '', domain: ''});
  });
});
