import fs from 'node:fs';
import path from 'node:path';
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

/**
 * Plays an image site in the browser: every request to https://<host>/... gets the image.
 * The tests cannot reach the real sites. Returns the list of requested addresses (the
 * network log for that site), which grows as the page requests images.
 */
export async function serveImageSite(target: Page | BrowserContext, host: string, options: ImageSiteOptions = {}) {
  const {cors = true, body = RED_SQUARE, contentType = 'image/png', status = 200} = options;
  const requests: string[] = [];
  await target.route(`https://${host}/**`, async (route) => {
    requests.push(route.request().url());
    await route.fulfill({status, contentType, body, headers: cors ? {'access-control-allow-origin': '*'} : {}});
  });
  return {requests};
}

/** A file to upload or paste, made from bytes. */
export function imageFile(name: string, buffer: Buffer = RED_SQUARE, mimeType = 'image/png') {
  return {name, mimeType, buffer};
}
