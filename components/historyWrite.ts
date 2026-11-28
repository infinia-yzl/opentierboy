'use client';

import {toast} from 'sonner';

const SAVE_PAUSED_TOAST_ID = 'save-paused';

function tellRouterTheAddress() {
  try {
    window.history.replaceState(null, '', window.location.href);
  } catch {
    return;
  }
}

function refused(): false {
  tellRouterTheAddress();
  toast.error('Your browser paused saving', {id: SAVE_PAUSED_TOAST_ID, description: 'Try again in a moment.'});
  return false;
}

export function writeHistory(mode: 'push' | 'replace', href: string, landed: () => boolean): boolean {
  try {
    if (mode === 'replace') window.history.replaceState(null, '', href);
    else window.history.pushState(null, '', href);
  } catch {
    return refused();
  }
  return landed() || refused();
}
