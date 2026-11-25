import {describe, expect, it} from 'vitest';
import {fetchBytes} from '@/lib/templates/fetchBytes';

const ADDRESS = 'https://raw.githubusercontent.com/alice/otb-templates/main/index.json';
const LIMITS = {maxBytes: 5, idleMs: 5_000, totalMs: 5_000};
const bytes = (...values: number[]) => new Uint8Array(values);

function streamOf(chunks: Uint8Array[], {then = 'close'}: {then?: 'close' | 'repeat' | 'stall'} = {}): {stream: ReadableStream<Uint8Array>; cancelled: () => boolean} {
  let next = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (next < chunks.length) controller.enqueue(chunks[next++]);
      else if (then === 'repeat') controller.enqueue(new Uint8Array(1024));
      else if (then === 'close') controller.close();
      else return new Promise<void>(() => undefined);
    },
    cancel() {
      cancelled = true;
    },
  });
  return {stream, cancelled: () => cancelled};
}

const answering = (body: ReadableStream<Uint8Array> | null, init: ResponseInit = {}): typeof fetch =>
  async () => new Response(body, init);

const untilAborted: typeof fetch = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });

describe('fetchBytes', () => {
  it('returns the bytes of every chunk in order when the answer arrives in pieces', async () => {
    const fetchFn = answering(streamOf([bytes(1, 2), bytes(3), bytes(4, 5)]).stream);
    expect(await fetchBytes(ADDRESS, {...LIMITS, fetchFn})).toEqual({ok: true, bytes: bytes(1, 2, 3, 4, 5)});
  });

  it('writes one GET request without cookies, referrer, redirects or custom headers when it asks a host', async () => {
    const calls: [unknown, RequestInit | undefined][] = [];
    const fetchFn: typeof fetch = async (input, init) => {
      calls.push([input, init]);
      return new Response(streamOf([bytes(1)]).stream);
    };
    await fetchBytes(ADDRESS, {...LIMITS, fetchFn});
    expect(calls).toHaveLength(1);
    const [input, init] = calls[0];
    expect(input).toBe(ADDRESS);
    const {signal, ...settings} = init ?? {};
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(settings).toEqual({method: 'GET', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store'});
  });

  it('returns the failure "too-large" and cancels the answer when it is one byte over the limit', async () => {
    const body = streamOf([bytes(1, 2, 3), bytes(4, 5, 6), bytes(7)]);
    expect(await fetchBytes(ADDRESS, {...LIMITS, fetchFn: answering(body.stream)})).toEqual({ok: false, reason: 'too-large'});
    expect(body.cancelled()).toBe(true);
  });

  it('returns the failure "too-large" when the answer does not end', async () => {
    const fetchFn = answering(streamOf([], {then: 'repeat'}).stream);
    expect(await fetchBytes(ADDRESS, {...LIMITS, maxBytes: 10_000, fetchFn})).toEqual({ok: false, reason: 'too-large'});
  });

  it('returns "not-found", "limited" or "status" with the code when the host answers 404, 429 or another error code', async () => {
    const cases: [number, string][] = [[404, 'not-found'], [410, 'not-found'], [403, 'limited'], [429, 'limited'], [500, 'status'], [503, 'status'], [400, 'status']];
    for (const [status, reason] of cases) {
      const fetchFn = answering(streamOf([bytes(1)]).stream, {status});
      expect(await fetchBytes(ADDRESS, {...LIMITS, fetchFn}), String(status)).toEqual({ok: false, reason, status});
    }
  });

  it('returns the failure "network" when the request fails, as a refused redirect does', async () => {
    const fetchFn: typeof fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect(await fetchBytes(ADDRESS, {...LIMITS, fetchFn})).toEqual({ok: false, reason: 'network'});
  });

  it('returns the failure "network" when the answer has no body to read in pieces', async () => {
    expect(await fetchBytes(ADDRESS, {...LIMITS, fetchFn: answering(null)})).toEqual({ok: false, reason: 'network'});
  });

  it('returns the failure "timeout" when the host does not answer within the idle limit', async () => {
    expect(await fetchBytes(ADDRESS, {...LIMITS, idleMs: 20, fetchFn: untilAborted})).toEqual({ok: false, reason: 'timeout'});
  });

  it('returns the failure "timeout" and cancels the answer when the bytes stop arriving after the first piece', async () => {
    const body = streamOf([bytes(1, 2)], {then: 'stall'});
    expect(await fetchBytes(ADDRESS, {...LIMITS, idleMs: 20, fetchFn: answering(body.stream)})).toEqual({ok: false, reason: 'timeout'});
    expect(body.cancelled()).toBe(true);
  });

  it('returns the failure "timeout" when pieces arrive in time but the whole answer passes the total limit', async () => {
    let sent = 0;
    const slow = new ReadableStream<Uint8Array>({
      async pull(controller) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        controller.enqueue(bytes(sent++ % 256));
      },
    });
    expect(await fetchBytes(ADDRESS, {maxBytes: 10_000, idleMs: 5_000, totalMs: 60, fetchFn: answering(slow)})).toEqual({ok: false, reason: 'timeout'});
  });

  it('returns the failure "cancelled" when the caller cancels before the request, during it, or during the answer', async () => {
    const before = new AbortController();
    before.abort();
    expect(await fetchBytes(ADDRESS, {...LIMITS, fetchFn: untilAborted, signal: before.signal})).toEqual({ok: false, reason: 'cancelled'});

    const during = new AbortController();
    const pending = fetchBytes(ADDRESS, {...LIMITS, fetchFn: untilAborted, signal: during.signal});
    during.abort();
    expect(await pending).toEqual({ok: false, reason: 'cancelled'});

    const midway = new AbortController();
    const body = streamOf([bytes(1)], {then: 'stall'});
    const reading = fetchBytes(ADDRESS, {...LIMITS, fetchFn: answering(body.stream), signal: midway.signal});
    await new Promise((resolve) => setTimeout(resolve, 10));
    midway.abort();
    expect(await reading).toEqual({ok: false, reason: 'cancelled'});
    expect(body.cancelled()).toBe(true);
  });
});
