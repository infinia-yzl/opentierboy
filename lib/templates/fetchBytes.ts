export type FetchBytesFailure = 'network' | 'not-found' | 'limited' | 'status' | 'too-large' | 'timeout' | 'cancelled';

export type FetchBytesResult =
  | {ok: true; bytes: Uint8Array}
  | {ok: false; reason: FetchBytesFailure; status?: number};

export interface FetchBytesOptions {
  maxBytes: number;
  idleMs: number;
  totalMs: number;
  signal?: AbortSignal;
  cache?: RequestCache;
  fetchFn?: typeof fetch;
}

function joined(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function statusFailure(status: number): FetchBytesFailure {
  if (status === 404 || status === 410) return 'not-found';
  if (status === 403 || status === 429) return 'limited';
  return 'status';
}

export async function fetchBytes(url: string, options: FetchBytesOptions): Promise<FetchBytesResult> {
  const {maxBytes, idleMs, totalMs, signal, cache = 'no-store', fetchFn = fetch} = options;
  const controller = new AbortController();
  let stopped: FetchBytesFailure | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const stop = (reason: FetchBytesFailure) => {
    stopped ??= reason;
    controller.abort();
    void reader?.cancel().catch(() => undefined);
  };
  const onCancel = () => stop('cancelled');
  const totalTimer = setTimeout(() => stop('timeout'), totalMs);
  let idleTimer = setTimeout(() => stop('timeout'), idleMs);
  const progressed = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => stop('timeout'), idleMs);
  };
  signal?.addEventListener('abort', onCancel, {once: true});
  try {
    if (signal?.aborted) return {ok: false, reason: 'cancelled'};
    const response = await fetchFn(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      cache,
      signal: controller.signal,
    });
    reader = response.body?.getReader();
    if (stopped !== null) {
      void reader?.cancel().catch(() => undefined);
      return {ok: false, reason: stopped};
    }
    if (!response.ok || response.redirected || !reader) {
      void reader?.cancel().catch(() => undefined);
      controller.abort();
      return response.ok ? {ok: false, reason: 'network'} : {ok: false, reason: statusFailure(response.status), status: response.status};
    }
    progressed();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const {done, value} = await reader.read();
      if (stopped !== null) return {ok: false, reason: stopped};
      if (done) break;
      progressed();
      total += value.byteLength;
      if (total > maxBytes) {
        stop('too-large');
        return {ok: false, reason: 'too-large'};
      }
      chunks.push(value);
    }
    return {ok: true, bytes: joined(chunks, total)};
  } catch {
    return {ok: false, reason: stopped ?? 'network'};
  } finally {
    clearTimeout(totalTimer);
    clearTimeout(idleTimer);
    signal?.removeEventListener('abort', onCancel);
  }
}
