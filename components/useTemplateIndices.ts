'use client';

import {useCallback, useEffect, useState, useSyncExternalStore} from 'react';
import {createTemplateIndexCache} from '@/lib/templates/indexCache';
import {
  addTemplateIndex,
  readTemplateIndices,
  removeTemplateIndex,
  TEMPLATE_INDICES_KEY,
  type AddTemplateIndexResult,
} from '@/lib/templates/indexList';
import {loadTemplateIndex, type LoadedTemplateIndex, type LoadIndexResult} from '@/lib/templates/loadIndex';

const NO_INDICES: readonly string[] = Object.freeze([]);
const listeners = new Set<() => void>();
const cache = createTemplateIndexCache();
let stored: readonly string[] | null = null;

function readStored(): readonly string[] {
  stored = Object.freeze(readTemplateIndices());
  return stored;
}

function changed() {
  readStored();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== TEMPLATE_INDICES_KEY) return;
    readStored();
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

const getSnapshot = () => stored ?? readStored();
const getServerSnapshot = () => NO_INDICES;

export interface UseTemplateIndices {
  urls: readonly string[];
  results: ReadonlyMap<string, LoadIndexResult>;
  refresh: () => void;
  check: (address: string, signal?: AbortSignal) => Promise<LoadIndexResult>;
  add: (index: LoadedTemplateIndex) => AddTemplateIndexResult;
  remove: (url: string) => void;
}

export function useTemplateIndices(active: boolean): UseTemplateIndices {
  const urls = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [results, setResults] = useState<ReadonlyMap<string, LoadIndexResult>>(() => new Map());
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let current = true;
    for (const url of urls) {
      void cache.load(url, {signal: controller.signal}).then((result) => {
        if (current) setResults((previous) => new Map(previous).set(url, result));
      });
    }
    return () => {
      current = false;
      controller.abort();
    };
  }, [active, urls, round]);

  const refresh = useCallback(() => {
    for (const url of urls) cache.forget(url);
    setResults(new Map());
    setRound((value) => value + 1);
  }, [urls]);

  const check = useCallback((address: string, signal?: AbortSignal) => loadTemplateIndex(address, {signal}), []);

  const add = useCallback((index: LoadedTemplateIndex) => {
    const result = addTemplateIndex(index.url);
    if (!result.ok) return result;
    cache.remember(index);
    setResults((previous) => new Map(previous).set(index.url, index));
    changed();
    return result;
  }, []);

  const remove = useCallback((url: string) => {
    removeTemplateIndex(url);
    cache.forget(url);
    setResults((previous) => {
      const next = new Map(previous);
      next.delete(url);
      return next;
    });
    changed();
  }, []);

  return {urls, results, refresh, check, add, remove};
}
