'use client';

import {useCallback, useSyncExternalStore} from 'react';
import {
  CLASSIC_FONT_CLASS,
  FONT_STORAGE_KEY,
  GAME_COLOURS_STORAGE_KEY,
  NO_GAME_COLOURS_CLASS,
  type FontChoice,
} from '@/lib/appearance';

/**
 * The font and game colours choices. The classes on <html> are the source of truth (the head
 * script in app/layout.tsx sets them before the page paints); localStorage keeps them for the
 * next visit. Writing to localStorage can fail (private windows, full storage): the choice then
 * lasts for this page only.
 */
function subscribeToHtmlClass(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {attributes: true, attributeFilter: ['class']});
  return () => observer.disconnect();
}

const hasHtmlClass = (name: string) => () => document.documentElement.classList.contains(name);

function remember(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // The choice still applies to this page.
  }
}

export function useFontChoice(): [FontChoice, (choice: FontChoice) => void] {
  const classic = useSyncExternalStore(subscribeToHtmlClass, hasHtmlClass(CLASSIC_FONT_CLASS), () => false);
  const setFont = useCallback((choice: FontChoice) => {
    document.documentElement.classList.toggle(CLASSIC_FONT_CLASS, choice === 'classic');
    remember(FONT_STORAGE_KEY, choice === 'classic' ? 'classic' : null);
  }, []);
  return [classic ? 'classic' : 'modern', setFont];
}

export function useGameColours(): [boolean, (on: boolean) => void] {
  const off = useSyncExternalStore(subscribeToHtmlClass, hasHtmlClass(NO_GAME_COLOURS_CLASS), () => false);
  const setOn = useCallback((on: boolean) => {
    document.documentElement.classList.toggle(NO_GAME_COLOURS_CLASS, !on);
    remember(GAME_COLOURS_STORAGE_KEY, on ? null : 'off');
  }, []);
  return [!off, setOn];
}
