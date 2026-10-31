'use client';

import React, {useCallback, useSyncExternalStore} from 'react';
import {ReaderIcon} from "@radix-ui/react-icons";
import {Toggle} from "@/components/ui/toggle";
import {toast} from "sonner";
import {usePathname} from "next/navigation";

/** Zen mode is the `zen-mode` class on <html>; this follows it. */
function subscribeToZenMode(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {attributes: true, attributeFilter: ['class']});
  return () => observer.disconnect();
}

const isZenModeOn = () => document.documentElement.classList.contains('zen-mode');

export function ZenToggle() {
  const isZenMode = useSyncExternalStore(subscribeToZenMode, isZenModeOn, () => false);
  const pathname = usePathname();

  const toggleZenMode = useCallback(() => {
    document.documentElement.classList.toggle('zen-mode');
    const isZenMode = isZenModeOn();
    const zenModeMessage = isZenMode ? 'Entered Zen Mode' : 'Exited Zen Mode';
    const zenModeData = isZenMode ? {
      description: 'While active, buttons are hidden and adding or removing items is disabled.',
    } : {
      description: 'Buttons are now visible and you may add or remove items.',
    };

    toast(zenModeMessage, zenModeData);
  }, []);

  if (!pathname.includes('rank')) return null;

  return (
    <Toggle
      aria-label="Toggle zen mode"
      pressed={isZenMode}
      onPressedChange={toggleZenMode}
    >
      <ReaderIcon className="mr-2 h-4 w-4"/>
      Zen
    </Toggle>
  );
}
