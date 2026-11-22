import {loadTemplateIndex, type LoadIndexOptions, type LoadIndexResult} from './loadIndex';

export const INDEX_CACHE_MS = 10 * 60 * 1000;

export interface TemplateIndexCache {
  load: (url: string, options?: {fresh?: boolean; signal?: AbortSignal}) => Promise<LoadIndexResult>;
  remember: (result: LoadIndexResult) => void;
  forget: (url: string) => void;
}

export interface TemplateIndexCacheOptions {
  maxAgeMs?: number;
  loader?: (url: string, options: LoadIndexOptions) => Promise<LoadIndexResult>;
}

export function createTemplateIndexCache(options: TemplateIndexCacheOptions = {}): TemplateIndexCache {
  const {maxAgeMs = INDEX_CACHE_MS, loader = loadTemplateIndex} = options;
  const loaded = new Map<string, {at: number; result: LoadIndexResult}>();
  return {
    async load(url, {fresh = false, signal} = {}) {
      const cached = loaded.get(url);
      if (!fresh && cached && Date.now() - cached.at < maxAgeMs) return cached.result;
      const result = await loader(url, {signal});
      if (result.ok) loaded.set(url, {at: Date.now(), result});
      return result;
    },
    remember(result) {
      if (result.ok) loaded.set(result.url, {at: Date.now(), result});
    },
    forget(url) {
      loaded.delete(url);
    },
  };
}
