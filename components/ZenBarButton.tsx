'use client';

import React from 'react';
import {Button} from '@/components/ui/button';
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip';
import {cn} from '@/lib/utils';

export const BAR_BUTTON_SIZE = 'h-8 w-8 stage:size-(--stage-bar-button)';
export const BAR_ICON_SIZE = 'h-4 w-4 stage:size-(--stage-bar-icon)';
export const BAR_CHEVRON_SIZE = 'h-3 w-3 stage:size-[calc(var(--stage-bar-icon)*0.75)]';
export const BAR_MENU_BUTTON = 'h-8 gap-1 px-2 stage:h-(--stage-bar-button)';
export const BAR_SEPARATOR = 'mx-1 h-5 w-px bg-border stage:h-[calc(var(--stage-bar)*0.57)]';
export const BAR_BOX = 'flex h-11 items-center gap-0.5 rounded-lg border bg-background px-1.5 text-sm font-medium shadow-md stage:h-(--stage-bar) stage:text-(length:--stage-bar-text)';

export function BarButton({label, tip, disabled, pressed, className, onClick, children}: {
  label: string;
  tip: string;
  disabled?: boolean;
  pressed?: boolean;
  className?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex" tabIndex={-1}>
          <Button
            variant="ghost"
            size="icon"
            className={cn(BAR_BUTTON_SIZE, pressed && 'bg-accent text-primary', className)}
            aria-label={label}
            aria-pressed={pressed}
            disabled={disabled}
            onClick={onClick}
          >
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}
