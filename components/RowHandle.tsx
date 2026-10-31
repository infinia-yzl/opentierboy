import React from 'react';
import {DragHandleDots2Icon} from '@radix-ui/react-icons';

interface RowHandleProps {
  /** The drag handle ref from useTierRow (lib/dnd/react.tsx). */
  handleRef?: (element: Element | null) => void;
  /** aria-describedby: the keyboard instructions for dragging. */
  describedBy?: string;
  label?: string;
}

/**
 * The handle that moves a whole row. A button for assistive technology ("Move tier <label>"),
 * focusable for keyboard drags. A long press must not select text or open the touch callout.
 */
const RowHandle: React.FC<RowHandleProps> = ({handleRef, describedBy, label}) => {
  return (
    <div
      ref={handleRef}
      role="button"
      tabIndex={0}
      aria-describedby={describedBy || undefined}
      aria-label={label ? `Move tier ${label}` : 'Move tier'}
      className="w-10 shrink-0 self-stretch flex items-center justify-center border-l border-black/10 dark:border-white/10 cursor-grab select-none [-webkit-touch-callout:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <DragHandleDots2Icon aria-hidden="true" className="h-4 w-4"/>
    </div>
  );
};

export default RowHandle;
