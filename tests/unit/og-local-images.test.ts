import {afterEach, describe, expect, it, vi} from 'vitest';
import {BLANK_IMAGE, inlineLocalImages, isLocalUrl} from '@/app/api/og/local-images';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('preview route: images on local addresses', () => {
  it('knows which URLs are local', () => {
    expect(isLocalUrl('http://localhost:3000/images/image-overwatch/ana.png')).toBe(true);
    expect(isLocalUrl('http://127.0.0.1:3000/placeholder-image.png')).toBe(true);
    expect(isLocalUrl('https://opentierboy.com/images/image-overwatch/ana.png')).toBe(false);
    expect(isLocalUrl('')).toBe(false);
  });

  it('loads local images itself and passes them on as data URLs', async () => {
    const fetchMock = vi.fn(async () => new Response(PNG_BYTES, {headers: {'content-type': 'image/png'}}));
    vi.stubGlobal('fetch', fetchMock);
    const local = 'http://localhost:3000/images/image-overwatch/ana.png';

    const imageSrc = await inlineLocalImages([local, local]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(imageSrc(local)).toBe(`data:image/png;base64,${Buffer.from(PNG_BYTES).toString('base64')}`);
  });

  it('leaves public URLs to next/og', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const remote = 'https://opentierboy.com/images/image-overwatch/ana.png';

    const imageSrc = await inlineLocalImages([remote]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(imageSrc(remote)).toBe(remote);
  });

  it('draws nothing for a local image that cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('missing.png')) return new Response('Not found', {status: 404});
      throw new TypeError('fetch failed');
    }));

    const imageSrc = await inlineLocalImages(['http://localhost:3000/missing.png', 'http://localhost:3000/down.png']);

    expect(imageSrc('http://localhost:3000/missing.png')).toBe(BLANK_IMAGE);
    expect(imageSrc('http://localhost:3000/down.png')).toBe(BLANK_IMAGE);
  });
});
