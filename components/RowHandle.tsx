import React from 'react';
import { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';

interface RowHandleProps {
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
  label?: string;
}

const RowHandle: React.FC<RowHandleProps> = ({ dragHandleProps, label }) => {
  return (
    <div
      {...(dragHandleProps || {})}
      aria-label={label ? `Move tier ${label}` : 'Move tier'}
      className="w-6 h-full flex items-center justify-center cursor-grab pl-6 pr-6"
    >
      <span aria-hidden="true" className="font-bold text-lg tracking-widest">::</span>
    </div>
  );
};

export default RowHandle;
