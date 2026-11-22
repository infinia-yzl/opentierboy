import {z} from '@/lib/zod';
import {SNAPSHOT_PNG_LIMITS} from '@/lib/snapshot/png';
import {SNAPSHOT_PAYLOAD_LIMITS} from '@/lib/snapshot/payload';
import {checkTemplateAddress} from './address';
import {TEMPLATE_HOSTS, type TemplateHost} from './hosts';
import {cleanTemplateText} from './text';

export const TEMPLATE_INDEX_FORMAT = 1;

export const TEMPLATE_INDEX_LIMITS = Object.freeze({
  maxIndexBytes: 256 * 1024,
  maxJsonValues: 20_000,
  maxTemplates: 500,
  maxFileBytes: SNAPSHOT_PNG_LIMITS.maxFileBytes,
  maxImages: SNAPSHOT_PAYLOAD_LIMITS.maxImages,
  maxNameCharacters: 80,
  maxTitleCharacters: 100,
  maxGameCharacters: 60,
  maxAuthorCharacters: 60,
  maxContactCharacters: 200,
});

export interface TemplateEntry {
  id: string;
  title: string;
  game: string | null;
  author: string | null;
  file: string;
  bytes: number;
  sha256: string;
  images: number | null;
  updated: string | null;
}

export interface TemplateIndex {
  name: string;
  maintainer: string | null;
  contact: string | null;
  updated: string | null;
  templates: TemplateEntry[];
}

export type TemplateIndexRefusal = 'too-large' | 'bad-text' | 'too-many-values' | 'bad-json' | 'unsupported-format' | 'invalid';

export type ParseTemplateIndexResult =
  | {ok: true; index: TemplateIndex; skipped: number}
  | {ok: false; reason: TemplateIndexRefusal};

const limits = TEMPLATE_INDEX_LIMITS;
const ENTRY_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const SHA_256 = /^[0-9a-fA-F]{64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const text = (maxCharacters: number) =>
  z.unknown().transform((value, context) => {
    const cleaned = cleanTemplateText(value, maxCharacters);
    if (cleaned === null) {
      context.addIssue({code: 'custom', message: `must be 1 to ${maxCharacters} characters of plain text`});
      return z.NEVER;
    }
    return cleaned;
  });

const optionalText = (maxCharacters: number) =>
  z.unknown().optional().transform((value, context) => {
    if (value === undefined || value === null) return null;
    const cleaned = cleanTemplateText(value, maxCharacters);
    if (cleaned === null) {
      context.addIssue({code: 'custom', message: `must be 1 to ${maxCharacters} characters of plain text`});
      return z.NEVER;
    }
    return cleaned;
  });

const optionalDay = z.unknown().optional().transform((value, context) => {
  if (value === undefined || value === null) return null;
  const time = typeof value === 'string' && DAY.test(value) ? Date.parse(`${value}T00:00:00Z`) : Number.NaN;
  if (typeof value !== 'string' || Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value) {
    context.addIssue({code: 'custom', message: 'must be a day such as 2026-11-22'});
    return z.NEVER;
  }
  return value;
});

const entrySchema = (hosts: readonly TemplateHost[]) =>
  z.object({
    id: z.string().regex(ENTRY_ID),
    title: text(limits.maxTitleCharacters),
    game: optionalText(limits.maxGameCharacters),
    author: optionalText(limits.maxAuthorCharacters),
    file: z.unknown().transform((value, context) => {
      const check = checkTemplateAddress(value, 'file', hosts);
      if (!check.ok) {
        context.addIssue({code: 'custom', message: 'must be the https address of a .png file on an allowed host'});
        return z.NEVER;
      }
      return check.url;
    }),
    bytes: z.number().int().min(1).max(limits.maxFileBytes),
    sha256: z.string().regex(SHA_256).transform((value) => value.toLowerCase()),
    images: z.number().int().min(1).max(limits.maxImages).nullish().transform((value) => value ?? null),
    updated: optionalDay,
  });

const headSchema = z.object({
  format: z.literal(TEMPLATE_INDEX_FORMAT),
  name: text(limits.maxNameCharacters),
  maintainer: optionalText(limits.maxAuthorCharacters),
  contact: optionalText(limits.maxContactCharacters),
  updated: optionalDay,
});

function countJsonValues(json: string, stopAfter: number): number {
  let count = 0;
  let inString = false;
  for (let index = 0; index < json.length; index++) {
    const code = json.charCodeAt(index);
    if (inString) {
      if (code === 0x5c) index++;
      else if (code === 0x22) inString = false;
    } else if (code === 0x22) {
      inString = true;
    } else if (code === 0x7b || code === 0x5b || code === 0x2c) {
      if (++count > stopAfter) return count;
    }
  }
  return count;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseTemplateIndex(bytes: Uint8Array, hosts: readonly TemplateHost[] = TEMPLATE_HOSTS): ParseTemplateIndexResult {
  try {
    if (bytes.byteLength > limits.maxIndexBytes) return {ok: false, reason: 'too-large'};
    let json: string;
    try {
      json = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
    } catch {
      return {ok: false, reason: 'bad-text'};
    }
    if (countJsonValues(json, limits.maxJsonValues) > limits.maxJsonValues) return {ok: false, reason: 'too-many-values'};
    let data: unknown;
    try {
      data = JSON.parse(json);
    } catch {
      return {ok: false, reason: 'bad-json'};
    }
    if (!isPlainObject(data)) return {ok: false, reason: 'invalid'};
    const {format, templates} = data;
    if (typeof format === 'number' && Number.isInteger(format) && format > TEMPLATE_INDEX_FORMAT) {
      return {ok: false, reason: 'unsupported-format'};
    }
    if (!Array.isArray(templates) || templates.length > limits.maxTemplates) return {ok: false, reason: 'invalid'};
    const head = headSchema.safeParse(data);
    if (!head.success) return {ok: false, reason: 'invalid'};

    const schema = entrySchema(hosts);
    const seen = new Set<string>();
    const entries: TemplateEntry[] = [];
    let skipped = 0;
    for (const candidate of templates) {
      const entry = schema.safeParse(candidate);
      if (!entry.success || seen.has(entry.data.id)) {
        skipped++;
        continue;
      }
      seen.add(entry.data.id);
      entries.push(entry.data);
    }
    const {name, maintainer, contact, updated} = head.data;
    return {ok: true, index: {name, maintainer, contact, updated, templates: entries}, skipped};
  } catch {
    return {ok: false, reason: 'invalid'};
  }
}
