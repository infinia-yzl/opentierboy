import {useSyncExternalStore} from 'react';

export const DESKTOP_QUERY = '(pointer: fine) and (min-width: 1024px)';

function subscribe(listener: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

const isDesktop = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(DESKTOP_QUERY).matches);

export function useDesktop(): boolean {
  return useSyncExternalStore(subscribe, isDesktop, () => false);
}
