import {describe, expect, it} from 'vitest';
import {isDeviceImageId} from '@/lib/state/deviceId';
import {
  buildSnapshotPayload,
  isAvifOrHeicDataUrl,
  parseSnapshotPayload,
  rasterDataUrlType,
  SNAPSHOT_PAYLOAD_LIMITS,
  type SnapshotImage,
} from '@/lib/snapshot/payload';
import {SNAPSHOT_PNG_LIMITS} from '@/lib/snapshot/png';
import {gifHeader, jpegHeader, pngHeader, webpHeader} from '../../support/imageHeaders';
import {makePng} from '../../support/pngHelpers';

const limits = SNAPSHOT_PAYLOAD_LIMITS;
const STATE = '3.N4IgLgFgpgTg4mAdgVw';

/** Image headers of 2 x 2 pictures: the payload reads only the type and the declared size. */
const MAGIC = {
  png: pngHeader(2, 2),
  jpeg: jpegHeader(2, 2),
  gif: gifHeader(2, 2),
  webp: webpHeader(2, 2),
};

function dataUrl(type: keyof typeof MAGIC, padTo = 0, mime = `image/${type}`): string {
  const bytes = new Uint8Array(Math.max(MAGIC[type].length, padTo));
  bytes.set(MAGIC[type]);
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

/** The start of an AVIF or HEIC file: an ISO base media "ftyp" box with that brand. */
function isoMedia(brand: string, padTo = 0): Buffer {
  const head = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from(`ftyp${brand}\0\0\0\0mif1${brand}`, 'latin1')]);
  return Buffer.concat([head, Buffer.alloc(Math.max(0, padTo - head.length))]);
}

/** A device image id in the device store's format (8 to 64 URL-safe characters). */
function deviceId(name: string): string {
  return `dev_${name}_00`;
}

function image(name: string, overrides: Partial<SnapshotImage> = {}): SnapshotImage {
  return {id: deviceId(name), label: `Label ${name}`, dataUrl: dataUrl('png'), ...overrides};
}

function parseJson(value: unknown) {
  return parseSnapshotPayload(JSON.stringify(value));
}

describe('buildSnapshotPayload and parseSnapshotPayload', () => {
  it('returns the same payload from parseSnapshotPayload when given the text buildSnapshotPayload wrote with every image type', () => {
    const images = [
      image('a-real-png', {dataUrl: `data:image/png;base64,${Buffer.from(makePng()).toString('base64')}`}),
      image('jpeg_1', {dataUrl: dataUrl('jpeg'), label: 'Ünïcödé ✨ 🧪'}),
      image('gif', {dataUrl: dataUrl('gif'), label: ''}),
      image('webp', {id: 'h3Kx9_Tq2LmZ-a8B', dataUrl: dataUrl('webp')}),
    ];
    const built = buildSnapshotPayload({state: STATE, images});
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.payload).toEqual({version: 1, state: STATE, images});
    expect(parseSnapshotPayload(built.text)).toEqual({ok: true, payload: built.payload});
  });

  it('returns identical text, with keys in a fixed order, when buildSnapshotPayload gets equal input twice', () => {
    const shuffled = {dataUrl: dataUrl('gif'), label: 'x', id: 'image-one'} as SnapshotImage;
    const built = buildSnapshotPayload({images: [shuffled], state: STATE});
    expect(built.ok && built.text).toBe(`{"version":1,"state":"${STATE}","images":[{"id":"image-one","label":"x","dataUrl":"${dataUrl('gif')}"}]}`);
    const again = buildSnapshotPayload({state: STATE, images: [{...shuffled}]});
    expect(again.ok && again.text).toBe(built.ok && built.text);
  });

  it('returns the normalised /rank path when the path is an editor path, and reason \'invalid-payload\' otherwise', () => {
    const built = buildSnapshotPayload({state: STATE, path: '/rank/overwatch/tank/'});
    expect(built.ok && built.text).toBe(`{"version":1,"state":"${STATE}","path":"/rank/overwatch/tank","images":[]}`);
    expect(parseJson({version: 1, state: STATE, path: '/rank'})).toEqual({ok: true, payload: {version: 1, state: STATE, path: '/rank', images: []}});
    for (const path of ['', '/', '/about', 'https://evil.example/rank', '//evil.example/rank', '/rank/../api/og', '/rank/%2e%2e/api', '/rank?x=1', '/rank/a b', 7, null]) {
      expect(parseJson({version: 1, state: STATE, path}), String(path)).toMatchObject({ok: false, reason: 'invalid-payload'});
      expect(buildSnapshotPayload({state: STATE, path: path as string}).ok, String(path)).toBe(false);
    }
  });

  it('returns images: [] when the input has no images', () => {
    const built = buildSnapshotPayload({state: STATE});
    expect(built.ok && built.payload.images).toEqual([]);
    expect(parseJson({version: 1, state: STATE})).toEqual({ok: true, payload: {version: 1, state: STATE, images: []}});
  });

  it('returns only the known fields, with no prototype pollution, when the JSON has unknown or prototype keys', () => {
    const text = `{"version":1,"state":"${STATE}","future":{"a":1},"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"images":[{"id":"abcdefgh","label":"b","dataUrl":"${dataUrl('png')}","extra":1,"__proto__":{"polluted":true}}]}`;
    const result = parseSnapshotPayload(text);
    expect(result).toEqual({ok: true, payload: {version: 1, state: STATE, images: [{id: 'abcdefgh', label: 'b', dataUrl: dataUrl('png')}]}});
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    if (result.ok) expect(Object.getPrototypeOf(result.payload)).toBe(Object.prototype);
  });
});

describe('parseSnapshotPayload with bad payloads', () => {
  it('returns reason \'bad-json\' when the text is not JSON', () => {
    for (const text of ['', 'not json', '{"version":1,', '\u0000', "{'version':1}"]) {
      expect(parseSnapshotPayload(text), text).toEqual({ok: false, reason: 'bad-json'});
    }
  });

  it('returns reason \'invalid-payload\' when the JSON is not a payload object', () => {
    for (const value of [null, 1, 'text', true, [], [{version: 1, state: STATE}]]) {
      expect(parseJson(value).ok, JSON.stringify(value)).toBe(false);
      expect(parseJson(value)).toMatchObject({reason: 'invalid-payload'});
    }
  });

  it('returns reason \'unsupported-version\' when the version is above 1', () => {
    for (const version of [2, 3, 999, 2e9]) {
      expect(parseJson({version, state: STATE})).toEqual({ok: false, reason: 'unsupported-version'});
    }
  });

  it('returns reason \'invalid-payload\' when the version is missing or not a positive integer', () => {
    for (const version of [undefined, 0, -1, 1.5, '1', null, true, [1], {}]) {
      expect(parseJson({version, state: STATE}), String(version)).toMatchObject({ok: false, reason: 'invalid-payload'});
    }
  });

  it('returns ok only when the state is a versioned link value (<n>.<lz-string>)', () => {
    const bad = [undefined, null, 3, {}, [], '', 'N4IgLgFgpgTg', '3.', '.abc', '03.abc', '3.ab cd', '3.ab<cd', '3.ab"cd', '3.abc\n', '3.ab/cd', '3.ab.cd', '12345.abc'];
    for (const state of bad) {
      expect(parseJson({version: 1, state}), JSON.stringify(state)).toMatchObject({ok: false, reason: 'invalid-payload'});
    }
    for (const state of ['3.a', '3.Ab09+-$', '4.abc', '10.abc']) {
      expect(parseJson({version: 1, state}).ok, state).toBe(true);
    }
  });

  it('returns reason \'invalid-payload\' when the state is over maxStateChars', () => {
    const atCap = `3.${'A'.repeat(limits.maxStateChars - 2)}`;
    expect(parseJson({version: 1, state: atCap}).ok).toBe(true);
    expect(parseJson({version: 1, state: `${atCap}A`})).toMatchObject({ok: false, reason: 'invalid-payload'});
  });

  it('returns reason \'invalid-payload\' when images is not a list of image objects', () => {
    for (const images of [null, 'x', {}, [null], ['data:image/png;base64,AAAA'], [[]], [1]]) {
      expect(parseJson({version: 1, state: STATE, images}), JSON.stringify(images)).toMatchObject({ok: false, reason: 'invalid-payload'});
    }
  });

  it("returns reason 'invalid-payload' when an id fails isDeviceImageId (8 to 64 URL-safe characters, no prototype name)", () => {
    const badIds: unknown[] = [
      '',
      'k3J9x',
      'a'.repeat(7),
      'a'.repeat(65),
      'abcd efgh',
      '../abcdef',
      'abcdefgé',
      'abcdefg.',
      'abcdefg/',
      '__proto__',
      'constructor',
      'toString',
      'hasOwnProperty',
      'propertyIsEnumerable',
      '__defineGetter__',
      '__lookupSetter__',
      7,
      null,
    ];
    for (const id of badIds) {
      expect(isDeviceImageId(id), String(id)).toBe(false);
      const images = [{id, label: 'x', dataUrl: dataUrl('png')}];
      expect(parseJson({version: 1, state: STATE, images}), String(id)).toMatchObject({ok: false, reason: 'invalid-payload'});
    }
    for (const id of ['a'.repeat(8), 'a'.repeat(64), 'h3Kx9_Tq2LmZ-a8B', '0b8f6a62-6a0e-4c43-a3a8-3c2e7f0b1d9e', 'valueOfX', 'legacy-abc12']) {
      expect(isDeviceImageId(id), id).toBe(true);
      expect(parseJson({version: 1, state: STATE, images: [image('ok', {id})]}).ok, id).toBe(true);
    }
  });

  it('returns reason \'invalid-payload\' when an image lacks id or label, or the label is over maxLabelChars', () => {
    const bad: unknown[] = [
      {label: 'x'},
      {id: 'abcdefgh', label: 7},
      {id: 'abcdefgh'},
      {id: 'abcdefgh', label: 'x'.repeat(limits.maxLabelChars + 1)},
    ];
    for (const fields of bad) {
      const images = [{dataUrl: dataUrl('png'), ...(fields as object)}];
      expect(parseJson({version: 1, state: STATE, images}), JSON.stringify(fields).slice(0, 60)).toMatchObject({ok: false, reason: 'invalid-payload'});
    }
    const atCap = image('caps', {label: 'x'.repeat(limits.maxLabelChars)});
    expect(parseJson({version: 1, state: STATE, images: [atCap]}).ok).toBe(true);
  });

  it('returns reason \'invalid-payload\' when two images have the same id', () => {
    expect(parseJson({version: 1, state: STATE, images: [image('a'), image('b'), image('a')]})).toMatchObject({
      ok: false,
      reason: 'invalid-payload',
      detail: expect.stringContaining('duplicate'),
    });
  });

  it('returns reason \'invalid-payload\' when a data URL is not base64 raster data whose bytes match its type', () => {
    const png = dataUrl('png');
    const base64 = png.slice('data:image/png;base64,'.length);
    const bad = [
      `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64')}`,
      'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
      `data:text/html;base64,${base64}`,
      `data:image/bmp;base64,${base64}`,
      `data:image/x-icon;base64,${base64}`,
      `data:IMAGE/PNG;base64,${base64}`,
      `data:image/png;charset=utf-8;base64,${base64}`,
      `data:image/png,${base64}`,
      `data:image/png;base64, ${base64}`,
      `data:image/png;base64,${base64}\n`,
      `data:image/png;base64,${base64.slice(0, -1)}`,
      `data:image/png;base64,${base64.replace('A', '-')}`,
      'data:image/png;base64,iVBORw0KGgo=',
      `https://example.com/a.png`,
      `blob:https://opentierboy.com/0b8f6a62`,
      `javascript:alert(1)`,
      // Declared type does not match the bytes.
      dataUrl('jpeg', 0, 'image/png'),
      dataUrl('png', 0, 'image/jpeg'),
      dataUrl('gif', 0, 'image/webp'),
      dataUrl('webp', 0, 'image/gif'),
      `data:image/png;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')}`,
    ];
    for (const value of bad) {
      expect(rasterDataUrlType(value), value.slice(0, 50)).toBeNull();
      expect(parseJson({version: 1, state: STATE, images: [image('a', {dataUrl: value})]}), value.slice(0, 50)).toMatchObject({
        ok: false,
        reason: 'invalid-payload',
      });
    }
    expect(rasterDataUrlType(dataUrl('png'))).toBe('image/png');
    expect(rasterDataUrlType(dataUrl('jpeg'))).toBe('image/jpeg');
    expect(rasterDataUrlType(dataUrl('gif'))).toBe('image/gif');
    expect(rasterDataUrlType(dataUrl('webp'))).toBe('image/webp');
    const gif87a = Buffer.from(gifHeader(1, 1));
    gif87a.write('GIF87a', 0, 'latin1');
    expect(rasterDataUrlType(`data:image/gif;base64,${gif87a.toString('base64')}`)).toBe('image/gif');
  });

  it('returns the image unchanged when its data URL is AVIF or HEIC by declared type or by bytes', () => {
    const kept = [
      `data:image/avif;base64,${isoMedia('avif', 64).toString('base64')}`,
      `data:image/heic;base64,${isoMedia('heic', 64).toString('base64')}`,
      `data:image/heif;base64,${isoMedia('mif1', 64).toString('base64')}`,
      // AVIF and HEIC bytes that claim another type: the bytes decide.
      `data:image/png;base64,${isoMedia('avif', 64).toString('base64')}`,
      `data:image/jpeg;base64,${isoMedia('heic', 64).toString('base64')}`,
      // A declared AVIF type with other bytes: the type decides, as for "From your device".
      dataUrl('png', 0, 'image/avif'),
    ];
    for (const value of kept) {
      expect(isAvifOrHeicDataUrl(value), value.slice(0, 40)).toBe(true);
      // Never read as a picture: nothing checks its size or decodes it.
      expect(rasterDataUrlType(value), value.slice(0, 40)).toBeNull();
      const parsed = parseJson({version: 1, state: STATE, images: [image('a', {dataUrl: value})]});
      expect(parsed, value.slice(0, 40)).toMatchObject({ok: true, payload: {images: [{dataUrl: value}]}});
    }
    for (const value of [dataUrl('png'), dataUrl('jpeg'), dataUrl('gif'), dataUrl('webp')]) expect(isAvifOrHeicDataUrl(value)).toBe(false);
  });

  it('returns reason \'invalid-payload\' when an AVIF or HEIC data URL breaks the data URL rules or caps', () => {
    const avif = isoMedia('avif', 64).toString('base64');
    const bad = [
      `data:image/avif;base64,${avif.slice(0, 12)}`,
      `data:image/avif;base64,${avif.slice(0, -1)}`,
      `data:image/avif,${avif}`,
      `data:IMAGE/AVIF;base64,${avif}`,
      `data:image/heic;charset=utf-8;base64,${avif}`,
      `data:image/avif;base64,${'A'.repeat(limits.maxImageDataUrlChars)}`,
    ];
    for (const value of bad) {
      expect(isAvifOrHeicDataUrl(value), value.slice(0, 40)).toBe(false);
      expect(parseJson({version: 1, state: STATE, images: [image('a', {dataUrl: value})]}), value.slice(0, 40)).toMatchObject({ok: false, reason: 'invalid-payload'});
    }
    // AVIF images count toward the cap on all images together.
    const each = `data:image/avif;base64,${Buffer.alloc(Math.floor(limits.maxImageDataUrlChars * 0.9 / 4) * 3, isoMedia('avif', 64)).toString('base64')}`;
    const count = Math.ceil(limits.maxTotalImageDataUrlChars / each.length);
    const over = Array.from({length: count}, (_, i) => image(`img${i}`, {dataUrl: each}));
    expect(parseJson({version: 1, state: STATE, images: over})).toMatchObject({ok: false, reason: 'invalid-payload'});
  });

  it('returns reason \'invalid-payload\' when one data URL is over maxImageDataUrlChars', () => {
    const prefix = 'data:image/png;base64,'.length;
    // Largest base64 length (a multiple of 4) that fits the cap together with the prefix.
    const fits = Math.floor((limits.maxImageDataUrlChars - prefix) / 4) * 3;
    const atCap = dataUrl('png', fits);
    expect(atCap.length).toBeLessThanOrEqual(limits.maxImageDataUrlChars);
    expect(atCap.length).toBeGreaterThan(limits.maxImageDataUrlChars - 4);
    expect(parseJson({version: 1, state: STATE, images: [image('a', {dataUrl: atCap})]}).ok).toBe(true);
    const over = dataUrl('png', fits + 3);
    expect(parseJson({version: 1, state: STATE, images: [image('a', {dataUrl: over})]})).toMatchObject({ok: false, reason: 'invalid-payload'});
  });

  it('returns reason \'invalid-payload\' when there are more than maxImages images', () => {
    const many = (n: number) => Array.from({length: n}, (_, i) => image(`img${i}`));
    expect(parseJson({version: 1, state: STATE, images: many(limits.maxImages)}).ok).toBe(true);
    expect(parseJson({version: 1, state: STATE, images: many(limits.maxImages + 1)})).toMatchObject({ok: false, reason: 'invalid-payload'});
  });

  it('returns reason \'invalid-payload\' when all data URLs together are over maxTotalImageDataUrlChars', () => {
    const each = Math.floor(limits.maxImageDataUrlChars * 0.9);
    const count = Math.ceil(limits.maxTotalImageDataUrlChars / each);
    const big = (i: number) => image(`img${i}`, {dataUrl: dataUrl('png', Math.floor(each / 4) * 3)});
    const under = Array.from({length: count - 1}, (_, i) => big(i));
    expect(parseJson({version: 1, state: STATE, images: under}).ok).toBe(true);
    const over = Array.from({length: count}, (_, i) => big(i));
    expect(parseJson({version: 1, state: STATE, images: over})).toMatchObject({ok: false, reason: 'invalid-payload'});
  });

  it('returns reason \'invalid-payload\' within 250 ms when the text has millions of tiny JSON values', () => {
    const flood = (key: string, item: string, n = 3_000_000) => `{"version":1,"state":"${STATE}","${key}":[${`${item},`.repeat(n - 1)}${item}]}`;
    for (const text of [flood('images', '{}'), flood('future', '[]'), flood('future', '1'), flood('images', '{"id":"abcdefgh"}', 400_000)]) {
      expect(text.length).toBeLessThanOrEqual(limits.maxPayloadBytes);
      const started = performance.now();
      expect(parseSnapshotPayload(text)).toMatchObject({ok: false, reason: 'invalid-payload', detail: 'payload: too many JSON values'});
      // Measured at about 10 ms; JSON.parse alone takes seconds on these texts.
      expect(performance.now() - started).toBeLessThan(250);
    }
  });

  it('returns ok when brackets and commas are inside a JSON string', () => {
    // 600 commas and brackets inside a string do not count.
    const label = '{[,'.repeat(200);
    expect(parseJson({version: 1, state: STATE, images: [image('a', {label})]}).ok).toBe(true);
  });

  it('returns the image count error before any image error when there are more than maxImages images', () => {
    const tooMany = `{"version":1,"state":"${STATE}","images":[${Array(limits.maxImages + 1).fill('{}').join(',')}]}`;
    expect(parseSnapshotPayload(tooMany)).toEqual({ok: false, reason: 'invalid-payload', detail: `images: must be a list of at most ${limits.maxImages} images`});
  });

  it('returns reason \'payload-too-large\' when the text is over maxPayloadBytes', () => {
    const text = ' '.repeat(limits.maxPayloadBytes + 1);
    expect(parseSnapshotPayload(text)).toEqual({ok: false, reason: 'payload-too-large'});
  });

  it('returns a result without throwing when the JSON is 100,000 levels deep or has huge numbers', () => {
    const deep = (depth: number) => `${'['.repeat(depth)}${']'.repeat(depth)}`;
    for (const text of [
      `{"version":1,"state":"${STATE}","extra":${deep(100_000)}}`,
      `{"version":1,"state":"${STATE}","images":${deep(100_000)}}`,
      `{"version":1e400,"state":"${STATE}"}`,
      `{"version":-1e400,"state":"${STATE}"}`,
      `{"version":1,"state":"${STATE}","images":[{"id":"a","label":"b","dataUrl":1e999}]}`,
    ]) {
      const result = parseSnapshotPayload(text);
      expect(typeof result.ok).toBe('boolean');
    }
    expect(parseSnapshotPayload(`{"version":1,"state":"${STATE}","images":${deep(100_000)}}`).ok).toBe(false);
  });

  it('returns ok: false when the input is not a string', () => {
    for (const value of [undefined, null, 1, {}, [], Symbol('x')]) {
      expect(parseSnapshotPayload(value as unknown as string).ok).toBe(false);
    }
  });
});

describe('buildSnapshotPayload with bad input', () => {
  it('returns reason \'invalid-payload\' when an image is AVIF or HEIC', () => {
    for (const value of [`data:image/avif;base64,${isoMedia('avif', 64).toString('base64')}`, `data:image/png;base64,${isoMedia('heic', 64).toString('base64')}`]) {
      expect(buildSnapshotPayload({state: STATE, images: [image('a', {dataUrl: value})]}), value.slice(0, 40)).toEqual({
        ok: false,
        reason: 'invalid-payload',
        detail: 'images.0.dataUrl: AVIF and HEIC images are never written',
      });
    }
  });

  it('returns reason \'invalid-payload\' when parseSnapshotPayload would refuse the input', () => {
    expect(buildSnapshotPayload({state: 'N4IgLgFgpgTg'})).toMatchObject({ok: false, reason: 'invalid-payload'});
    expect(buildSnapshotPayload({state: STATE, images: [image('a'), image('a')]})).toMatchObject({ok: false, reason: 'invalid-payload'});
    expect(buildSnapshotPayload({state: STATE, images: [image('a', {dataUrl: 'data:image/svg+xml;base64,PHN2Zz4='})]})).toMatchObject({
      ok: false,
      reason: 'invalid-payload',
      detail: expect.stringContaining('images.0.dataUrl'),
    });
    expect(buildSnapshotPayload(undefined as unknown as {state: string})).toMatchObject({ok: false, reason: 'invalid-payload'});
  });

  it('returns reason \'payload-too-large\' when the JSON text would be over maxPayloadBytes', () => {
    // Every field within its own cap, but control characters in labels take 6 bytes each in JSON.
    const perImage = Math.floor(limits.maxTotalImageDataUrlChars / limits.maxImages);
    const images = Array.from({length: limits.maxImages}, (_, i) =>
      image(`img${i}`, {label: '\u0001'.repeat(limits.maxLabelChars), dataUrl: dataUrl('png', Math.floor((perImage - 30) / 4) * 3)}),
    );
    const state = `3.${'A'.repeat(limits.maxStateChars - 2)}`;
    expect(buildSnapshotPayload({state, images})).toEqual({ok: false, reason: 'payload-too-large'});
  });

  it('returns a maxPayloadBytes of at most SNAPSHOT_PNG_LIMITS.maxTextBytes when the limits are read', () => {
    expect(limits.maxPayloadBytes).toBeLessThanOrEqual(SNAPSHOT_PNG_LIMITS.maxTextBytes);
  });
});
