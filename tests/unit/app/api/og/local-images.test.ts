import {afterEach, describe, expect, it, vi} from 'vitest';
import {BLANK_IMAGE, DEFAULT_LIMITS, inlineLocalImages, isLocalUrl} from '@/app/api/og/local-images';

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

  it('caps each image at 2 MB and 5 seconds by default', () => {
    expect(DEFAULT_LIMITS).toEqual({maxBytes: 2 * 1024 * 1024, timeoutMs: 5_000});
  });

  it('draws nothing for a response that is not an image', async () => {
    const urls = {
      html: 'http://localhost:3000/',
      untyped: 'http://localhost:3000/untyped.png',
      binary: 'http://localhost:3000/binary.png',
    };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === urls.html) return new Response('<html></html>', {headers: {'content-type': 'text/html; charset=utf-8'}});
      if (url === urls.untyped) return new Response(PNG_BYTES);
      return new Response(PNG_BYTES, {headers: {'content-type': 'application/octet-stream'}});
    }));

    const imageSrc = await inlineLocalImages(Object.values(urls));

    for (const url of Object.values(urls)) expect(imageSrc(url), url).toBe(BLANK_IMAGE);
  });

  it('draws nothing for an image larger than the cap', async () => {
    const declared = 'http://localhost:3000/declared.png';
    const streamed = 'http://localhost:3000/streamed.png';
    const small = 'http://localhost:3000/small.png';
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === declared) {
        return new Response(PNG_BYTES, {headers: {'content-type': 'image/png', 'content-length': '64'}});
      }
      if (url === streamed) {
        // No content-length: the body itself grows past the cap.
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            for (let index = 0; index < 4; index++) controller.enqueue(new Uint8Array(10));
            controller.close();
          },
        });
        return new Response(body, {headers: {'content-type': 'image/png'}});
      }
      return new Response(PNG_BYTES, {headers: {'content-type': 'image/png'}});
    }));

    const imageSrc = await inlineLocalImages([declared, streamed, small], {maxBytes: 32, timeoutMs: 1_000});

    expect(imageSrc(declared)).toBe(BLANK_IMAGE);
    expect(imageSrc(streamed)).toBe(BLANK_IMAGE);
    expect(imageSrc(small)).toMatch(/^data:image\/png;base64,/);
  });

  it('gives up on an image that does not arrive in time', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    }));
    vi.stubGlobal('fetch', fetchMock);

    const imageSrc = await inlineLocalImages(['http://localhost:3000/slow.png'], {maxBytes: 1_000, timeoutMs: 20});

    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    expect(imageSrc('http://localhost:3000/slow.png')).toBe(BLANK_IMAGE);
  });
});
