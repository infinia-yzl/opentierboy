'use client';

import React, {useEffect, useRef} from 'react';
import {ReaderIcon} from "@radix-ui/react-icons";
import {Toggle} from "@/components/ui/toggle";
import {useZenMode} from "@/components/usePageState";
import {setZenMode} from "@/components/zenMode";

/**
 * The editor toolbar's Zen button (owner decision, 2026-10-28: between Add images and Share).
 * It turns Zen on. In Zen the title row's tools hide with it, and the Zen bar's "Exit Zen" (or
 * Escape) turns Zen off (components/ZenBar.tsx). Focus moves with it: to the Zen bar when Zen
 * turns on with this toggle, and back here when Zen turns off from the bar.
 */
export function ZenToggle() {
  const isZenMode = useZenMode();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const wasZenMode = useRef(isZenMode);

  // Leaving Zen removes the Zen bar: focus that was in it comes back to this toggle.
  useEffect(() => {
    const left = wasZenMode.current && !isZenMode;
    wasZenMode.current = isZenMode;
    if (left && (document.activeElement === null || document.activeElement === document.body)) toggleRef.current?.focus();
  }, [isZenMode]);

  return (
    <Toggle
      ref={toggleRef}
      variant="outline"
      className="gap-2 px-4"
      pressed={isZenMode}
      onPressedChange={setZenMode}
    >
      <ReaderIcon className="h-4 w-4"/>
      Zen
    </Toggle>
  );
}
