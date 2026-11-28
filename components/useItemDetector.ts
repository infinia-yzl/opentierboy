import {useCallback, useEffect, useMemo, useRef} from 'react';
import {findItemsInPrepared, findItemsOfSizeInPrepared, prepare, type Prepared} from '@/lib/extract/detect';
import type {Box, Picture, ScoredBox} from '@/lib/extract/picture';

export type ExtractorRequest =
  | {kind: 'picture'; id: number; job: number; picture: Picture}
  | {kind: 'size'; id: number; job: number; box: Box};

export type ExtractorResponse =
  | {kind: 'boxes'; job: number; boxes: ScoredBox[]; ms: number}
  | {kind: 'failed'; job: number};

type Waiting = (boxes: ScoredBox[] | null) => void;

interface Runner {
  readonly send: (request: ExtractorRequest) => void;
  readonly stop: () => void;
}

function inlineRunner(answer: (response: ExtractorResponse) => void): Runner {
  let prepared: {id: number; data: Prepared} | null = null;
  let stopped = false;
  return {
    send: (request) => {
      setTimeout(() => {
        if (stopped) return;
        try {
          const started = performance.now();
          if (request.kind === 'picture') {
            prepared = {id: request.id, data: prepare(request.picture)};
            answer({kind: 'boxes', job: request.job, boxes: findItemsInPrepared(prepared.data), ms: performance.now() - started});
          } else if (prepared && prepared.id === request.id) {
            answer({kind: 'boxes', job: request.job, boxes: findItemsOfSizeInPrepared(prepared.data, request.box), ms: performance.now() - started});
          } else {
            answer({kind: 'failed', job: request.job});
          }
        } catch {
          answer({kind: 'failed', job: request.job});
        }
      }, 0);
    },
    stop: () => {
      stopped = true;
      prepared = null;
    },
  };
}

function workerRunner(answer: (response: ExtractorResponse) => void, failed: () => void): Runner | null {
  if (typeof Worker === 'undefined') return null;
  try {
    const worker = new Worker(new URL('./extractorWorker.ts', import.meta.url), {type: 'module'});
    worker.addEventListener('message', (event: MessageEvent<ExtractorResponse>) => answer(event.data));
    worker.addEventListener('error', () => {
      worker.terminate();
      failed();
    });
    return {send: (request) => worker.postMessage(request), stop: () => worker.terminate()};
  } catch {
    return null;
  }
}

export interface ItemDetector {
  readonly findItems: (id: number, picture: Picture) => Promise<ScoredBox[] | null>;
  readonly findItemsOfSize: (id: number, box: Box) => Promise<ScoredBox[] | null>;
  readonly stop: () => void;
}

export function useItemDetector(): ItemDetector {
  const runner = useRef<Runner | null>(null);
  const waiting = useRef(new Map<number, Waiting>());
  const requests = useRef(new Map<number, ExtractorRequest>());
  const lastPicture = useRef<ExtractorRequest | null>(null);
  const jobs = useRef(0);

  const stop = useCallback(() => {
    runner.current?.stop();
    runner.current = null;
    waiting.current.forEach((resolve) => resolve(null));
    waiting.current.clear();
    requests.current.clear();
    lastPicture.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const run = useCallback((build: (job: number) => ExtractorRequest): Promise<ScoredBox[] | null> => {
    const answer = (response: ExtractorResponse) => {
      requests.current.delete(response.job);
      const resolve = waiting.current.get(response.job);
      if (!resolve) return;
      waiting.current.delete(response.job);
      resolve(response.kind === 'boxes' ? response.boxes : null);
    };
    const fallBack = () => {
      const inline = inlineRunner(answer);
      runner.current = inline;
      const picture = lastPicture.current;
      const pending = [...requests.current.values()];
      if (picture && !pending.includes(picture)) inline.send({...picture, job: -1});
      pending.forEach((request) => inline.send(request));
    };
    runner.current ??= workerRunner(answer, fallBack) ?? inlineRunner(answer);
    const job = ++jobs.current;
    const request = build(job);
    if (request.kind === 'picture') lastPicture.current = request;
    requests.current.set(job, request);
    const current = runner.current;
    return new Promise((resolve) => {
      waiting.current.set(job, resolve);
      current.send(request);
    });
  }, []);

  const findItems = useCallback((id: number, picture: Picture) => run((job) => ({kind: 'picture', id, job, picture})), [run]);
  const findItemsOfSize = useCallback((id: number, box: Box) => run((job) => ({kind: 'size', id, job, box})), [run]);
  return useMemo(() => ({findItems, findItemsOfSize, stop}), [findItems, findItemsOfSize, stop]);
}
