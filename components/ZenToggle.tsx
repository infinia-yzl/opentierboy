'use client';

import React, {useCallback, useEffect, useState} from 'react';
import {ReaderIcon} from "@radix-ui/react-icons";
import {Toggle} from "@/components/ui/toggle";
import {toast} from "sonner";

export function ZenToggle() {
  const [isZenMode, setIsZenMode] = useState(false);

  useEffect(() => {
    // Check initial state
    setIsZenMode(document.documentElement.classList.contains('zen-mode'));
  }, []);

  const toggleZenMode = useCallback(() => {
    document.documentElement.classList.toggle('zen-mode');
    const isZenMode = document.documentElement.classList.contains('zen-mode');
    setIsZenMode(isZenMode);
    const zenModeMessage = isZenMode ? 'Entered Zen Mode' : 'Exited Zen Mode';
    const zenModeData = isZenMode ? {
      description: 'While active, buttons are hidden and adding or removing items is disabled.',
    } : {
      description: 'Buttons are now visible and you may add or remove items.',
    };

    toast(zenModeMessage, zenModeData);
  }, []);

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
