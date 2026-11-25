import React from 'react';
import {DragHandleDots2Icon} from '@radix-ui/react-icons';
import {useTierStack} from '@/lib/dnd/react';
import {rowGripName, rowStackName} from '@/lib/dnd/labels';


const HANDLE_CLASSES = 'select-none [-webkit-touch-callout:none] focus-visible:outline-none';

interface RowGripProps {
  /** The drag handle ref from useTierRow (lib/dnd/react.tsx). */
  handleRef?: (element: Element | null) => void;
  /** aria-describedby: the keyboard instructions for dragging. */
  describedBy?: string;
  name: string;
  index: number;
}

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

const StackIcon: React.FC<{className?: string}> = ({className}) => (
  <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M5.25 3.5V1.75h9v9H12.5"/>
    <path d="M3.5 5.25V3.5h9v9h-1.75"/>
    <rect x="1.75" y="5.25" width="9" height="9" rx="1.5"/>
  </svg>
);

interface RowStackProps {
  tierId: string;
  describedBy?: string;
  name: string;
  index: number;
  count: number;
}

export const RowStack: React.FC<RowStackProps> = ({tierId, describedBy, name, index, count}) => {
  const empty = count === 0;
  const {ref, isDragging} = useTierStack({tierId, disabled: empty});
  if (empty) {
    return <div ref={ref} aria-hidden="true" data-row-stack="" data-empty="" className="invisible w-10 stage:w-(--stage-handle) shrink-0 self-stretch"/>;
  }
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-describedby={describedBy || undefined}
      aria-label={rowStackName(name, index, count)}
      data-row-stack=""
      data-lifted={isDragging || undefined}
      className={`relative w-10 stage:w-(--stage-handle) shrink-0 self-stretch flex items-center justify-center text-foreground cursor-grab ${HANDLE_CLASSES}`}
    >
      <span
        data-stack-pill=""
        className="flex flex-col items-center justify-center gap-[3px] w-8 h-11 compact:h-10 rounded-md stage:w-[calc(var(--stage-handle)*0.8)] stage:h-[calc(var(--stage-handle)*1.1)]"
      >
        <StackIcon className="size-4 stage:size-(--stage-handle-icon)"/>
        <span aria-hidden="true" className="text-[11px] font-semibold leading-none tabular-nums stage:text-[length:calc(var(--stage-handle-icon)*0.6)]">{count}</span>
      </span>
      {isDragging && (
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
