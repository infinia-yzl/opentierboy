import React from 'react';
import { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';

interface RowHandleProps {
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
}

const RowHandle: React.FC<RowHandleProps> = ({ dragHandleProps }) => {
  return (
    <div
      {...(dragHandleProps || {})}
      className="w-6 h-full flex items-center justify-center cursor-grab pl-6 pr-6"
    >
      <span className="font-bold text-lg tracking-widest">::</span>
    </div>
  );
};

export default RowHandle;
