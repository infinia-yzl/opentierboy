'use client';

import {useEffect} from 'react';

/**
 * Marks the page as one of an image set's pages, for its game colours (app/globals.css,
 * `html[data-game]`). The mark sits on <html> so dialogs and menus, which render outside the
 * editor, take the colours too. It goes away when the visitor leaves the page.
 */
export function GameColours({gameKey}: {gameKey: string | undefined}) {
  useEffect(() => {
    if (!gameKey) return;
    const html = document.documentElement;
    html.dataset.game = gameKey;
    return () => {
      if (html.dataset.game === gameKey) delete html.dataset.game;
    };
  }, [gameKey]);
  return null;
}
