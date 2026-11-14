import React from 'react';
import {DragHandleDots2Icon} from '@radix-ui/react-icons';
import {useTierStack} from '@/lib/dnd/react';
import {rowGripName, rowStackName} from '@/lib/dnd/labels';

/**
 * The two handles of a ranked row (owner decision, 2026-11-14; the design "Row handles: move
 * items or move the whole row"). Both are buttons for assistive technology, focusable for
 * keyboard drags, and a long press on them selects no text and opens no touch callout.
 *
 * - RowGrip, a six-dot grip beside the row, outside the list: it moves the whole row, its name
 *   and its items together ("Move row S").
 * - RowStack, a pile of squares with the item count at the row's end: it moves only the items,
 *   and the names stay in place ("Move the 3 items of row S"). An empty row's stack is off
 *   ("Row C has 0 items to move").
 *
 * What lifts when the pointer is over a handle, or the handle has focus, is plain CSS
 * (app/globals.css, "The row handles"), so pointing at a handle renders nothing again.
 */

const HANDLE_CLASSES = 'select-none [-webkit-touch-callout:none] focus-visible:outline-none';

interface RowGripProps {
  /** The drag handle ref from useTierRow (lib/dnd/react.tsx). */
  handleRef?: (element: Element | null) => void;
  /** aria-describedby: the keyboard instructions for dragging. */
  describedBy?: string;
  /** The row's name ('' when it has none) and its position on screen, for the button's name. */
  name: string;
  index: number;
}

/**
 * The grip that moves a whole row. It hangs off the row's left edge, in the page space beside the
 * list (DragDropTierList's RowList makes room for it on narrow screens): hidden at rest, grey
 * while the pointer is over the row, in the row's colour on itself. On touch screens it is a
 * 44 px column, always faintly there. Zen's 16:9 and 9:16 frames have no space beside the list,
 * so there it is a narrow column at the row's left edge, inside the frame.
 */
export const RowGrip: React.FC<RowGripProps> = ({handleRef, describedBy, name, index}) => (
  <div
    ref={handleRef}
    role="button"
    tabIndex={0}
    aria-describedby={describedBy || undefined}
    aria-label={rowGripName(name, index)}
    data-row-grip=""
    className={`absolute right-full inset-y-0 w-6 pointer-coarse:w-11 flex items-center justify-center rounded-l-md text-muted-foreground cursor-grab stage:static stage:shrink-0 stage:self-stretch stage:w-[calc(var(--stage-handle)*0.6)] stage:rounded-none ${HANDLE_CLASSES}`}
  >
    <DragHandleDots2Icon aria-hidden="true" className="h-4 w-4 stage:size-(--stage-handle-icon)"/>
  </div>
);

/** A pile of three squares: the items of a row, moved together. */
const StackIcon: React.FC<{className?: string}> = ({className}) => (
  <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M5.25 3.5V1.75h9v9H12.5"/>
    <path d="M3.5 5.25V3.5h9v9h-1.75"/>
    <rect x="1.75" y="5.25" width="9" height="9" rx="1.5"/>
  </svg>
);

interface RowStackProps {
  tierId: string;
  /** aria-describedby: the keyboard instructions for dragging. */
  describedBy?: string;
  name: string;
  index: number;
  /** How many items the row holds: the count on the stack. With none, the stack is off. */
  count: number;
}

/**
 * The stack that moves only a row's items, at the row's end. Lifted, it shows the items gathered
 * into a pile with their count, like several files dragged at once.
 */
export const RowStack: React.FC<RowStackProps> = ({tierId, describedBy, name, index, count}) => {
  const empty = count === 0;
  const {ref, isDragging} = useTierStack({tierId, disabled: empty});
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-describedby={describedBy || undefined}
      aria-label={rowStackName(name, index, count)}
      aria-disabled={empty || undefined}
      data-row-stack=""
      data-lifted={isDragging || undefined}
      className={`relative w-10 stage:w-(--stage-handle) shrink-0 self-stretch flex items-center justify-center text-foreground ${empty ? 'cursor-default' : 'cursor-grab'} ${HANDLE_CLASSES}`}
    >
      <span
        data-stack-pill=""
        className="flex flex-col items-center justify-center gap-[3px] w-8 h-11 compact:h-10 rounded-md stage:w-[calc(var(--stage-handle)*0.8)] stage:h-[calc(var(--stage-handle)*1.1)]"
      >
        <StackIcon className="size-4 stage:size-(--stage-handle-icon)"/>
        <span aria-hidden="true" className="text-[11px] font-semibold leading-none tabular-nums stage:text-[length:calc(var(--stage-handle-icon)*0.6)]">{count}</span>
      </span>
      {isDragging && (
        // The items gathered: a pile of cards with the count, under the pointer.
        <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 size-14 -translate-x-1/2 -translate-y-1/2 drop-shadow-lg">
          <span className="absolute left-0 top-3 size-11 rounded-md bg-muted-foreground/70 ring-2 ring-background"/>
          <span className="absolute left-1.5 top-1.5 size-11 rounded-md bg-muted-foreground/80 ring-2 ring-background"/>
          <span className="absolute left-3 top-0 size-11 rounded-md bg-muted-foreground ring-2 ring-background"/>
          <span className="absolute -right-2 -top-2.5 min-w-[22px] h-[22px] px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center ring-2 ring-background">
            {count}
          </span>
        </span>
      )}
    </div>
  );
};
