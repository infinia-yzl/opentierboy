'use client';

import React from 'react';
import {Pencil1Icon} from '@radix-ui/react-icons';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip';
import {useInlineEdit} from '@/components/EditableLabel';
import {cn} from '@/lib/utils';

// The page's h1, the biggest text on the page (owner decision, 2026-10-31). The text box uses
// the same size, so nothing moves while the title is edited.
const TITLE_TEXT = 'font-heading text-3xl sm:text-[2.5rem] font-black tracking-tight leading-tight';

/**
 * The list title: the page's h1, with a pencil button that shows it can be edited (owner
 * decision, 2026-10-31). The title and the pencil are one target: a click on either opens a
 * text box in the same place, as before (Zen too). Keyboard users reach the pencil button ("Edit
 * title"). The pencil hides in Zen. An empty title shows the text box with its placeholder, as before.
 */
export function ListTitle({title, onSave}: {title: string; onSave: (newTitle: string) => void}) {
  const {isEditing, edit, inputProps} = useInlineEdit(title, onSave);

  if (isEditing || !title) {
    return (
      <Input
        {...inputProps}
        aria-label="Title"
        placeholder="Enter title"
        className={cn(TITLE_TEXT, 'h-auto -ml-2 px-2 py-0.5')}
      />
    );
  }

  return (
    <div
      onClick={edit}
      className="group -ml-2 flex min-w-0 max-w-full items-center gap-0.5 self-start sm:self-center rounded-lg py-0.5 pl-2 pr-0.5 cursor-text transition-colors hover:bg-accent"
    >
      <h1 className={cn(TITLE_TEXT, 'min-w-0 break-words')}>{title}</h1>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Edit title"
              className="hide-in-zen shrink-0 text-muted-foreground group-hover:text-foreground hover:bg-transparent"
            >
              <Pencil1Icon className="h-4 w-4"/>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Edit title</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
