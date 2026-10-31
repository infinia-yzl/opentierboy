import {describe, expect, it, vi} from 'vitest';
import {DEFAULT_LINK_IMAGE_LIMITS, inlineTrustedLinkImages, trustedPreviewUrl} from '@/app/api/og/link-images';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const WEBP = new Uint8Array([...'RIFF\0\0\0\0WEBPVP8 '].map((c) => c.charCodeAt(0)));
const image = (bytes: Uint8Array, type = 'image/png', status = 200) => new Response(bytes as BodyInit, {status, headers: {'content-type': type}});
const dataUrl = (type: string, bytes: Uint8Array) => `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;

describe('link images in link previews (A8, A36)', () => {
  it('loads images from trusted sites, and gives them as data URLs', async () => {
    const fetchImpl = vi.fn(async () => image(PNG));
    const src = await inlineTrustedLinkImages(['https://i.imgur.com/a.png', 'https://upload.wikimedia.org/b.png'], {fetchImpl});
    expect(src('https://i.imgur.com/a.png')).toBe(dataUrl('image/png', PNG));
    expect(src('https://upload.wikimedia.org/b.png')).toBe(dataUrl('image/png', PNG));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://i.imgur.com/a.png');
    expect(init).toMatchObject({redirect: 'manual', credentials: 'omit'});
    expect((init.headers as Record<string, string>)['User-Agent']).toContain('OpenTierBoy');
  });

  it('never requests an untrusted, local or broken address', async () => {
    const fetchImpl = vi.fn(async () => image(PNG));
    const urls = [
      'https://images.example.org/a.png',
      'http://i.imgur.com/a.png',
      'https://i.imgur.com.evil.example/a.png',
      'https://localhost:3000/a.png',
      'http://localhost:3000/images/image-overwatch/win.png',
      'http://127.0.0.1:3000/a.png',
      'https://user@i.imgur.com/a.png',
      'data:image/png;base64,AAAA',
    ];
    const src = await inlineTrustedLinkImages(urls, {fetchImpl});
    expect(fetchImpl).not.toHaveBeenCalled();
    for (const url of urls) expect(src(url), url).toBeUndefined();
    expect(src(undefined)).toBeUndefined();
    // Sites a visitor allowed in their browser do not count on the server.
    expect(trustedPreviewUrl('https://images.example.org/a.png')).toBeNull();
    expect(trustedPreviewUrl('HTTPS://I.IMGUR.COM./a.png')).toBe('https://i.imgur.com/a.png');
  });

  it('draws a label tile for a redirect, an error, a wrong type or bytes that are not PNG, JPEG or GIF', async () => {
    const replies: Record<string, () => Response> = {
      'https://i.imgur.com/redirect.png': () => new Response(null, {status: 302, headers: {location: 'http://127.0.0.1/'}}),
      'https://i.imgur.com/missing.png': () => image(PNG, 'image/png', 404),
      'https://i.imgur.com/html.png': () => image(new TextEncoder().encode('<html>'), 'text/html'),
      'https://i.imgur.com/svg.png': () => image(new TextEncoder().encode('<svg/>'), 'image/svg+xml'),
      'https://i.imgur.com/webp.png': () => image(WEBP, 'image/webp'),
      'https://i.imgur.com/lying.png': () => image(new TextEncoder().encode('<html>'), 'image/png'),
      'https://i.imgur.com/ok.jpg': () => image(JPEG, 'image/jpeg; charset=binary'),
    };
    const fetchImpl = vi.fn(async (url: string | URL | Request) => replies[String(url)]());
    const src = await inlineTrustedLinkImages(Object.keys(replies), {fetchImpl: fetchImpl as typeof fetch});
    for (const url of Object.keys(replies)) {
      expect(src(url), url).toBe(url.endsWith('ok.jpg') ? dataUrl('image/jpeg', JPEG) : undefined);
    }
  });

  it('caps the size, the time and the number of images', async () => {
    expect(DEFAULT_LINK_IMAGE_LIMITS).toEqual({maxBytes: 1024 * 1024, timeoutMs: 4_000, maxImages: 24});
    const big = new Uint8Array(2048);
    big.set(PNG);
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith('slow.png')) {
        return new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
      }
      return image(big);
    });
    const src = await inlineTrustedLinkImages(['https://i.imgur.com/big.png', 'https://i.imgur.com/slow.png'], {
      fetchImpl: fetchImpl as typeof fetch,
      limits: {maxBytes: 1024, timeoutMs: 50},
    });
    expect(src('https://i.imgur.com/big.png')).toBeUndefined();
    expect(src('https://i.imgur.com/slow.png')).toBeUndefined();

    const many = Array.from({length: 40}, (_, index) => `https://i.imgur.com/${index}.png`);
    const counted = vi.fn(async () => image(PNG));
    const capped = await inlineTrustedLinkImages(many, {fetchImpl: counted, limits: {maxImages: 5}});
    expect(counted).toHaveBeenCalledTimes(5);
    expect(capped(many[4])).toBeDefined();
    expect(capped(many[5])).toBeUndefined();
  });

  it('loads an address once, also when the list writes it in two ways', async () => {
    const fetchImpl = vi.fn(async () => image(PNG));
    const src = await inlineTrustedLinkImages(['https://i.imgur.com/a.png', 'HTTPS://I.IMGUR.COM/a.png', 'https://i.imgur.com/a.png'], {fetchImpl});
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(src('HTTPS://I.IMGUR.COM/a.png')).toBe(dataUrl('image/png', PNG));
  });

  it('never throws, whatever fetch does', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('network down');
    });
    const src = await inlineTrustedLinkImages(['https://i.imgur.com/a.png'], {fetchImpl});
    expect(src('https://i.imgur.com/a.png')).toBeUndefined();
  });
});
