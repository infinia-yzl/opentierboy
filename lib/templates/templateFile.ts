import {checkTemplateAddress} from './address';
import {isBlockedFile, isBlockedSource, TEMPLATE_BLOCK_LIST, type TemplateBlockList} from './blockList';
import {sha256Hex} from './checksum';
import {fetchBytes, type FetchBytesFailure} from './fetchBytes';
import {TEMPLATE_HOSTS, type TemplateHost} from './hosts';
import {TEMPLATE_INDEX_LIMITS, type TemplateEntry} from './indexFormat';

export const TEMPLATE_FILE_IDLE_MS = 30_000;
export const TEMPLATE_FILE_TOTAL_MS = 10 * 60_000;

export type TemplateFileFailure = 'blocked' | 'address' | 'size' | 'checksum' | 'unchecked' | Exclude<FetchBytesFailure, 'too-large'>;

export type TemplateFileResult =
  | {ok: true; bytes: Uint8Array}
  | {ok: false; reason: TemplateFileFailure};

export interface TemplateFileOptions {
  signal?: AbortSignal;
  fetchFn?: typeof fetch;
  idleMs?: number;
  totalMs?: number;
  hosts?: readonly TemplateHost[];
  blockList?: TemplateBlockList;
}

export async function fetchTemplateFile(
  entry: Pick<TemplateEntry, 'file' | 'bytes' | 'sha256'>,
  options: TemplateFileOptions = {},
): Promise<TemplateFileResult> {
  const {signal, fetchFn, idleMs = TEMPLATE_FILE_IDLE_MS, totalMs = TEMPLATE_FILE_TOTAL_MS, hosts = TEMPLATE_HOSTS, blockList = TEMPLATE_BLOCK_LIST} = options;
  if (isBlockedFile(entry.sha256, blockList)) return {ok: false, reason: 'blocked'};
  const check = checkTemplateAddress(entry.file, 'file', hosts);
  if (!check.ok) return {ok: false, reason: 'address'};
  if (isBlockedSource(check.source, blockList)) return {ok: false, reason: 'blocked'};
  if (!Number.isInteger(entry.bytes) || entry.bytes < 1 || entry.bytes > TEMPLATE_INDEX_LIMITS.maxFileBytes) return {ok: false, reason: 'size'};
  const fetched = await fetchBytes(check.url, {maxBytes: entry.bytes, idleMs, totalMs, signal, fetchFn, cache: 'no-store'});
  if (!fetched.ok) return {ok: false, reason: fetched.reason === 'too-large' ? 'size' : fetched.reason};
  if (fetched.bytes.byteLength !== entry.bytes) return {ok: false, reason: 'size'};
  let checksum: string;
  try {
    checksum = await sha256Hex(fetched.bytes);
  } catch {
    return {ok: false, reason: 'unchecked'};
  }
  if (checksum !== entry.sha256.toLowerCase()) return {ok: false, reason: 'checksum'};
  return {ok: true, bytes: fetched.bytes};
}
