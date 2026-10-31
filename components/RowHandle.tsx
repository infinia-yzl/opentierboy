import React from 'react';

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
      className="w-6 h-full flex items-center justify-center cursor-grab pl-6 pr-6 select-none [-webkit-touch-callout:none]"
    >
      <span aria-hidden="true" className="font-bold text-lg tracking-widest">::</span>
    </div>
  );
};

export default RowHandle;
