import {checkTemplateAddress, type TemplateAddressRefusal} from './address';
import {isBlockedFile, isBlockedSource, TEMPLATE_BLOCK_LIST, type TemplateBlockList} from './blockList';
import {fetchBytes, type FetchBytesFailure} from './fetchBytes';
import {TEMPLATE_HOSTS, type TemplateHost} from './hosts';
import {parseTemplateIndex, TEMPLATE_INDEX_LIMITS, type TemplateIndex, type TemplateIndexRefusal} from './indexFormat';

export const INDEX_IDLE_MS = 15_000;
export const INDEX_TOTAL_MS = 30_000;

export type LoadIndexFailure = `address-${TemplateAddressRefusal}` | 'blocked' | FetchBytesFailure | TemplateIndexRefusal;

export interface LoadedTemplateIndex {
  ok: true;
  url: string;
  source: string;
  index: TemplateIndex;
  skipped: number;
}

export interface FailedTemplateIndex {
  ok: false;
  url: string;
  reason: LoadIndexFailure;
}

export type LoadIndexResult = LoadedTemplateIndex | FailedTemplateIndex;

export interface LoadIndexOptions {
  signal?: AbortSignal;
  fetchFn?: typeof fetch;
  idleMs?: number;
  totalMs?: number;
  hosts?: readonly TemplateHost[];
  blockList?: TemplateBlockList;
}

export async function loadTemplateIndex(address: string, options: LoadIndexOptions = {}): Promise<LoadIndexResult> {
  const {signal, fetchFn, idleMs = INDEX_IDLE_MS, totalMs = INDEX_TOTAL_MS, hosts = TEMPLATE_HOSTS, blockList = TEMPLATE_BLOCK_LIST} = options;
  const check = checkTemplateAddress(address, 'index', hosts);
  if (!check.ok) return {ok: false, url: address, reason: `address-${check.reason}`};
  const {url, source} = check;
  if (isBlockedSource(source, blockList)) return {ok: false, url, reason: 'blocked'};
  const fetched = await fetchBytes(url, {maxBytes: TEMPLATE_INDEX_LIMITS.maxIndexBytes, idleMs, totalMs, signal, fetchFn, cache: 'no-store'});
  if (!fetched.ok) return {ok: false, url, reason: fetched.reason};
  const parsed = parseTemplateIndex(fetched.bytes, hosts);
  if (!parsed.ok) return {ok: false, url, reason: parsed.reason};
  const templates = parsed.index.templates.filter((entry) => {
    const file = checkTemplateAddress(entry.file, 'file', hosts);
    return file.ok && !isBlockedSource(file.source, blockList) && !isBlockedFile(entry.sha256, blockList);
  });
  return {ok: true, url, source, index: {...parsed.index, templates}, skipped: parsed.skipped};
}
