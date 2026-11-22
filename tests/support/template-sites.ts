import {createHash} from 'node:crypto';
import type {BrowserContext, Page} from '@playwright/test';

export const TEMPLATE_HOST = 'raw.githubusercontent.com';
export const TEMPLATE_SOURCE = 'github.com/example/otb-templates';
const BASE = `https://${TEMPLATE_HOST}/example/otb-templates/main`;
export const INDEX_ADDRESS = `${BASE}/index.json`;

export const templateFileAddress = (id: string) => `${BASE}/${id}.png`;

export const sha256Of = (file: Buffer) => createHash('sha256').update(file).digest('hex');

export function templateEntry(id: string, title: string, file: Buffer, extra: Record<string, unknown> = {}) {
  return {id, title, file: templateFileAddress(id), bytes: file.length, sha256: sha256Of(file), ...extra};
}

export const templateIndex = (templates: unknown[], extra: Record<string, unknown> = {}) => ({format: 1, name: 'Example templates', templates, ...extra});

export interface TemplateSiteRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
}

export interface TemplateSite {
  requests: TemplateSiteRequest[];
  serve: (address: string, body: Buffer | string | object, status?: number) => void;
  hold: (address: string) => {isHolding: () => boolean; release: () => void};
}

export async function serveTemplateSite(target: Page | BrowserContext, documents: Record<string, Buffer | string | object> = {}): Promise<TemplateSite> {
  const served = new Map<string, {body: Buffer; status: number}>();
  const asBuffer = (body: Buffer | string | object) =>
    Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
  const serve = (address: string, body: Buffer | string | object, status = 200) => void served.set(address, {body: asBuffer(body), status});
  for (const [address, body] of Object.entries(documents)) serve(address, body);
  const requests: TemplateSiteRequest[] = [];
  const held = new Map<string, {waiting: (() => void)[]; released: boolean; holding: boolean}>();
  const hold = (address: string) => {
    const state = {waiting: [] as (() => void)[], released: false, holding: false};
    held.set(address, state);
    return {
      isHolding: () => state.holding,
      release: () => {
        state.released = true;
        state.waiting.forEach((resume) => resume());
      },
    };
  };
  await target.route(`https://${TEMPLATE_HOST}/**`, async (route) => {
    const request = route.request();
    requests.push({url: request.url(), method: request.method(), headers: await request.allHeaders()});
    const holding = held.get(request.url());
    if (holding && !holding.released) {
      holding.holding = true;
      await new Promise<void>((resume) => holding.waiting.push(resume));
    }
    const document = served.get(request.url());
    const headers = {'access-control-allow-origin': '*', 'x-content-type-options': 'nosniff'};
    if (!document) {
      await route.fulfill({status: 404, contentType: 'text/plain; charset=utf-8', body: '404: Not Found', headers}).catch(() => undefined);
      return;
    }
    const contentType = request.url().endsWith('.png') ? 'image/png' : 'text/plain; charset=utf-8';
    await route.fulfill({status: document.status, contentType, body: document.body, headers}).catch(() => undefined);
  });
  return {requests, serve, hold};
}
