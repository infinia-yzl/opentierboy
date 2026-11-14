'use client';

import {toast} from "@/lib/toast";

/**
 * Zen mode is the `zen-mode` class on <html> (components/usePageState.ts follows it). It turns
 * on with the Zen toggle in the title row, and off with the Zen bar's "Exit Zen" or Escape.
 * Each change shows the toast it always showed.
 */
export const ZEN_MODE_CLASS = 'zen-mode';

export const isZenModeOn = () => document.documentElement.classList.contains(ZEN_MODE_CLASS);

export function setZenMode(on: boolean, {announce = true}: {announce?: boolean} = {}) {
  if (isZenModeOn() === on) return;
  document.documentElement.classList.toggle(ZEN_MODE_CLASS, on);
  if (!announce) return;
  if (on) {
    toast('Entered Zen Mode', {
      description: 'While active, buttons are hidden and adding or removing items is disabled.',
    });
  } else {
    toast('Exited Zen Mode', {
      description: 'Buttons are now visible and you may add or remove items.',
    });
  }
}
