'use client';

import {useCallback, useSyncExternalStore} from 'react';
import {
  CLASSIC_FONT_CLASS,
  COMPACT_TILES_CLASS,
  FONT_STORAGE_KEY,
  GAME_COLOURS_STORAGE_KEY,
  NO_GAME_COLOURS_CLASS,
  TILE_SIZE_STORAGE_KEY,
  type FontChoice,
  type TileSizeChoice,
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

/**
 * The dense editor's tile size (owner decision, 2026-10-31): Comfortable (the tiles the editor
 * always had) or Compact (48 px), for big lists. A view setting of this browser, like the font:
 * never part of the list's link. Chosen in the Row options menu. Compact tiles follow Show Labels
 * (names under the tiles, or in a tag on hover), and choosing Compact turns Show Labels off (owner
 * decision, 2026-11-01; components/TierTemplateSelector.tsx).
 */
export function useTileSizeChoice(): [TileSizeChoice, (choice: TileSizeChoice) => void] {
  const compact = useSyncExternalStore(subscribeToHtmlClass, hasHtmlClass(COMPACT_TILES_CLASS), () => false);
  const setTileSize = useCallback((choice: TileSizeChoice) => {
    document.documentElement.classList.toggle(COMPACT_TILES_CLASS, choice === 'compact');
    remember(TILE_SIZE_STORAGE_KEY, choice === 'compact' ? 'compact' : null);
  }, []);
  return [compact ? 'compact' : 'comfortable', setTileSize];
}
