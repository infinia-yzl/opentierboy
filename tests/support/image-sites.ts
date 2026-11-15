import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type {BrowserContext, Page} from '@playwright/test';

const IMAGES = path.join(__dirname, '..', 'fixtures', 'images');
export const RED_SQUARE = fs.readFileSync(path.join(IMAGES, 'red-square.png'));
export const BLUE_SQUARE = fs.readFileSync(path.join(IMAGES, 'blue-square.png'));

export interface ImageSiteOptions {
  /** Send Access-Control-Allow-Origin: *, as most image hosts do. */
  cors?: boolean;
  body?: Buffer;
  contentType?: string;
  status?: number;
}

export interface HeldImageSite {
  readonly isHolding: () => boolean;
  readonly release: (answer?: ImageSiteOptions) => Promise<void>;
}

export interface ImageSite {
  readonly requests: string[];
  readonly hold: (addresses?: readonly string[]) => HeldImageSite;
}

export const NOT_A_PICTURE: ImageSiteOptions = {contentType: 'text/html', body: Buffer.from('<!doctype html><title>Not found</title>')};

interface Hold {
  readonly takes: (url: string) => boolean;
  readonly answerLater: (answer: (released: ImageSiteOptions) => Promise<void>) => Promise<void>;
  readonly held: HeldImageSite;
}

function createHold(addresses?: readonly string[]): Hold {
  let open!: (answer: ImageSiteOptions) => void;
  const released = new Promise<ImageSiteOptions>((resolve) => {
    open = resolve;
  });
  let isReleased = false;
  let waiting = 0;
  const answered: Promise<void>[] = [];
  return {
    takes: (url) => !isReleased && (addresses === undefined || addresses.includes(url)),
    answerLater: (answer) => {
      waiting += 1;
      const done = released.then(async (answerInPlace) => {
        await answer(answerInPlace);
        waiting -= 1;
      });
      answered.push(done);
      return done;
    },
    held: {
      isHolding: () => !isReleased && waiting > 0,
      release: async (answer = {}) => {
        isReleased = true;
        open(answer);
        await Promise.all(answered);
      },
    },
  };
}

export async function serveImageSite(target: Page | BrowserContext, host: string, options: ImageSiteOptions = {}): Promise<ImageSite> {
  const fulfilment = ({cors = true, body = RED_SQUARE, contentType = 'image/png', status = 200}: ImageSiteOptions) => {
    const headers: Record<string, string> = cors ? {'access-control-allow-origin': '*'} : {};
    return {status, contentType, body, headers};
  };
  const requests: string[] = [];
  let current: Hold | null = null;
  await target.route(`https://${host}/**`, async (route) => {
    const url = route.request().url();
    requests.push(url);
    const hold = current?.takes(url) ? current : null;
    if (!hold) {
      await route.fulfill(fulfilment(options));
      return;
    }
    await hold.answerLater((answer) => route.fulfill(fulfilment({...options, ...answer})).catch(() => undefined));
  });
  return {
    requests,
    hold: (addresses) => {
      const hold = createHold(addresses);
      current = hold;
      return hold.held;
    },
  };
}

/** A file to upload or paste, made from bytes. */
/**
 * A PNG of random-looking RGB pixels, which does not compress: about width x height x 3 bytes.
 * Different seeds give different images.
 */
export function noisePng(width: number, height: number, seed: number): Buffer {
  const rowLength = width * 3 + 1;
  const raw = Buffer.alloc(rowLength * height);
  let state = seed >>> 0 || 1;
  for (let index = 0; index < raw.length; index++) {
    if (index % rowLength === 0) continue; // filter byte 0: none
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    raw[index] = state & 255;
  }
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits per channel
  header[9] = 2; // RGB
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw, {level: 1})), chunk('IEND', Buffer.alloc(0))]);
}

export function imageFile(name: string, buffer: Buffer = RED_SQUARE, mimeType = 'image/png') {
  return {name, mimeType, buffer};
}
