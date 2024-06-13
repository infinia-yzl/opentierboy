"use client";

import { useState } from 'react';
import {DragDropContext, Draggable, Droppable, DropResult} from "@hello-pangea/dnd";

interface Item {
  id: string;
  content: string;
}

interface DragDropProps {
  initialItems: Item[];
}

const reorder = (list: Item[], startIndex: number, endIndex: number): Item[] => {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);

  return result;
};

const grid = 8;

const getItemStyle = (isDragging: boolean, draggableStyle: any) => ({
  userSelect: 'none',
  padding: grid * 2,
  margin: `0 ${grid}px 0 0`,
  background: isDragging ? 'lightgreen' : 'grey',
  ...draggableStyle,
});

const getListStyle = (isDraggingOver: boolean) => ({
  background: isDraggingOver ? 'lightblue' : 'lightgrey',
  display: 'flex',
  padding: grid,
  overflow: 'auto',
});

const DragDrop: React.FC<DragDropProps> = ({ initialItems }) => {
  const [items, setItems] = useState(initialItems);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) {
      return;
    }

    const newItems = reorder(items, result.source.index, result.destination.index);
    setItems(newItems);
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="droppable" direction="horizontal">
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            style={getListStyle(snapshot.isDraggingOver)}
            {...provided.droppableProps}
          >
            {items.map((item, index) => (
              <Draggable key={item.id} draggableId={item.id} index={index}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    style={getItemStyle(snapshot.isDragging, provided.draggableProps.style)}
                  >
                    {item.content}
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
};

export default DragDrop;
