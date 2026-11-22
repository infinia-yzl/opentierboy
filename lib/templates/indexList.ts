import {z} from '@/lib/zod';
import {browserLocalStorage, type StringStorage} from '@/lib/images/localLists';
import {checkTemplateAddress} from './address';
import {isBlockedSource} from './blockList';

export const TEMPLATE_INDICES_KEY = 'otb-template-indices';
export const MAX_TEMPLATE_INDICES = 10;
const MAX_STORED_CHARACTERS = 50_000;

export type AddTemplateIndexFailure = 'address' | 'blocked' | 'listed' | 'full' | 'storage';

export type AddTemplateIndexResult =
  | {ok: true; indices: string[]}
  | {ok: false; reason: AddTemplateIndexFailure};

const storedSchema = z.array(z.unknown()).max(1_000);

const usable = (value: unknown): string | null => {
  const check = checkTemplateAddress(value, 'index');
  return check.ok && !isBlockedSource(check.source) ? check.url : null;
};

export function readTemplateIndices(storage: StringStorage | null = browserLocalStorage()): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(TEMPLATE_INDICES_KEY);
    if (raw === null || raw.length > MAX_STORED_CHARACTERS) return [];
    const stored = storedSchema.safeParse(JSON.parse(raw));
    if (!stored.success) return [];
    const urls = stored.data.map(usable).filter((url): url is string => url !== null);
    return Array.from(new Set(urls)).slice(0, MAX_TEMPLATE_INDICES);
  } catch {
    return [];
  }
}

function writeTemplateIndices(storage: StringStorage | null, urls: readonly string[]): boolean {
  if (!storage) return false;
  try {
    if (urls.length === 0) storage.removeItem(TEMPLATE_INDICES_KEY);
    else storage.setItem(TEMPLATE_INDICES_KEY, JSON.stringify(urls));
    return true;
  } catch {
    return false;
  }
}

export function addTemplateIndex(address: string, storage: StringStorage | null = browserLocalStorage()): AddTemplateIndexResult {
  const check = checkTemplateAddress(address, 'index');
  if (!check.ok) return {ok: false, reason: 'address'};
  if (isBlockedSource(check.source)) return {ok: false, reason: 'blocked'};
  const current = readTemplateIndices(storage);
  if (current.includes(check.url)) return {ok: false, reason: 'listed'};
  if (current.length >= MAX_TEMPLATE_INDICES) return {ok: false, reason: 'full'};
  const indices = [...current, check.url];
  return writeTemplateIndices(storage, indices) ? {ok: true, indices} : {ok: false, reason: 'storage'};
}

export function removeTemplateIndex(url: string, storage: StringStorage | null = browserLocalStorage()): string[] {
  const indices = readTemplateIndices(storage).filter((entry) => entry !== url);
  writeTemplateIndices(storage, indices);
  return indices;
}
