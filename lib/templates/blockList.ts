import blockedFile from '@/blocked-templates.json';

export interface TemplateBlockList {
  files: ReadonlySet<string>;
  sources: ReadonlySet<string>;
}

const SHA_256 = /^[0-9a-f]{64}$/;
const SOURCE = /^[a-z0-9.-]{4,253}(?:\/[a-z0-9._-]{1,100}){0,2}$/;

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

export function parseBlockList(data: unknown): TemplateBlockList {
  const source = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  return {
    files: new Set(strings(source.files).filter((entry) => SHA_256.test(entry))),
    sources: new Set(strings(source.sources).filter((entry) => SOURCE.test(entry))),
  };
}

export const TEMPLATE_BLOCK_LIST: TemplateBlockList = parseBlockList(blockedFile);

export function isBlockedFile(sha256: string, list: TemplateBlockList = TEMPLATE_BLOCK_LIST): boolean {
  return list.files.has(sha256.toLowerCase());
}

export function isBlockedSource(source: string, list: TemplateBlockList = TEMPLATE_BLOCK_LIST): boolean {
  return list.sources.has(source.toLowerCase());
}
