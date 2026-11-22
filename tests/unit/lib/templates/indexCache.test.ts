import {describe, expect, it} from 'vitest';
import {createTemplateIndexCache} from '@/lib/templates/indexCache';
import type {LoadIndexResult} from '@/lib/templates/loadIndex';

const INDEX = 'https://raw.githubusercontent.com/alice/otb-templates/main/index.json';
const loaded = (name: string): LoadIndexResult => ({ok: true, url: INDEX, source: 'github.com/alice/otb-templates', skipped: 0, index: {name, maintainer: null, contact: null, updated: null, templates: []}});

function countingLoader(results: LoadIndexResult[]) {
  let calls = 0;
  const loader = async () => results[Math.min(calls++, results.length - 1)];
  return {loader, calls: () => calls};
}

describe('createTemplateIndexCache', () => {
  it('returns the first result without a second request when the index is asked for again soon', async () => {
    const {loader, calls} = countingLoader([loaded('first'), loaded('second')]);
    const cache = createTemplateIndexCache({loader});
    expect(await cache.load(INDEX)).toEqual(loaded('first'));
    expect(await cache.load(INDEX)).toEqual(loaded('first'));
    expect(calls()).toBe(1);
  });

  it('returns a new result when the caller asks for a fresh one or forgets the index', async () => {
    const {loader, calls} = countingLoader([loaded('first'), loaded('second'), loaded('third')]);
    const cache = createTemplateIndexCache({loader});
    await cache.load(INDEX);
    expect(await cache.load(INDEX, {fresh: true})).toEqual(loaded('second'));
    cache.forget(INDEX);
    expect(await cache.load(INDEX)).toEqual(loaded('third'));
    expect(calls()).toBe(3);
  });

  it('returns a new result when the first one is older than the maximum age', async () => {
    const {loader, calls} = countingLoader([loaded('first'), loaded('second')]);
    const cache = createTemplateIndexCache({loader, maxAgeMs: 0});
    await cache.load(INDEX);
    expect(await cache.load(INDEX)).toEqual(loaded('second'));
    expect(calls()).toBe(2);
  });

  it('returns the earlier index when a fresh load fails and the index is asked for again', async () => {
    const failed: LoadIndexResult = {ok: false, url: INDEX, reason: 'cancelled'};
    const {loader, calls} = countingLoader([loaded('first'), failed, loaded('third')]);
    const cache = createTemplateIndexCache({loader});
    await cache.load(INDEX);
    expect(await cache.load(INDEX, {fresh: true})).toEqual(failed);
    expect(await cache.load(INDEX)).toEqual(loaded('first'));
    expect(calls()).toBe(2);
  });

  it('returns a remembered index without a request when the caller hands one over', async () => {
    const {loader, calls} = countingLoader([loaded('from the host')]);
    const cache = createTemplateIndexCache({loader});
    cache.remember(loaded('checked before'));
    cache.remember({ok: false, url: INDEX, reason: 'network'});
    expect(await cache.load(INDEX)).toEqual(loaded('checked before'));
    expect(calls()).toBe(0);
  });

  it('returns a new result after a failure when the index is asked for again', async () => {
    const failed: LoadIndexResult = {ok: false, url: INDEX, reason: 'network'};
    const {loader, calls} = countingLoader([failed, loaded('second')]);
    const cache = createTemplateIndexCache({loader});
    expect(await cache.load(INDEX)).toEqual(failed);
    expect(await cache.load(INDEX)).toEqual(loaded('second'));
    expect(calls()).toBe(2);
  });
});
