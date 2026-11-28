import {findItemsOfSizeInPrepared, findItemsInPrepared, prepare, type Prepared} from '@/lib/extract/detect';
import type {ExtractorRequest, ExtractorResponse} from '@/components/useItemDetector';

let prepared: {id: number; data: Prepared} | null = null;

const reply = (message: ExtractorResponse) => (self as unknown as {postMessage: (message: ExtractorResponse) => void}).postMessage(message);

self.addEventListener('message', (event: MessageEvent<ExtractorRequest>) => {
  const request = event.data;
  try {
    if (request.kind === 'picture') {
      const started = performance.now();
      prepared = {id: request.id, data: prepare(request.picture)};
      reply({kind: 'boxes', job: request.job, boxes: findItemsInPrepared(prepared.data), ms: performance.now() - started});
      return;
    }
    if (!prepared || prepared.id !== request.id) {
      reply({kind: 'failed', job: request.job});
      return;
    }
    const started = performance.now();
    reply({kind: 'boxes', job: request.job, boxes: findItemsOfSizeInPrepared(prepared.data, request.box), ms: performance.now() - started});
  } catch {
    reply({kind: 'failed', job: request.job});
  }
});
