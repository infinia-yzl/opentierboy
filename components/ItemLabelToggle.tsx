"use client";

import React from 'react';
import {TextIcon} from "@radix-ui/react-icons";
import {Toggle} from "@/components/ui/toggle";
import {useLabelVisibility} from '@/contexts/LabelVisibilityContext';

export function ItemLabelToggle() {
  const {toggleLabels, showLabels} = useLabelVisibility();

  return (
    <Toggle aria-label="Toggle item labels" onPressedChange={toggleLabels} pressed={showLabels}>
      <TextIcon className="mr-2 h-4 w-4"/>
      Labels
    </Toggle>
  )
}
