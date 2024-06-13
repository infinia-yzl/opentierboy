"use client";

import { useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

interface Item {
  id: string;
  content: string;
}

interface Tier {
  id: string;
  name: string;
  items: Item[];
}

interface DragDropTierListProps {
  initialTiers: Tier[];
}

const reorder = (list: Item[], startIndex: number, endIndex: number): Item[] => {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
};

const move = (source: Item[], destination: Item[], sourceIndex: number, destIndex: number): { sourceItems: Item[], destItems: Item[] } => {
  const sourceClone = Array.from(source);
  const destClone = Array.from(destination);
  const [removed] = sourceClone.splice(sourceIndex, 1);
  destClone.splice(destIndex, 0, removed);

  return {
    sourceItems: sourceClone,
    destItems: destClone,
  };
};

const DragDropTierList: React.FC<DragDropTierListProps> = ({ initialTiers }) => {
  const [tiers, setTiers] = useState(initialTiers);

  const onDragEnd = (result: DropResult) => {
    const { source, destination } = result;

    if (!destination) {
      return;
    }

    const sourceTier = tiers.find(tier => tier.id === source.droppableId);
    const destTier = tiers.find(tier => tier.id === destination.droppableId);

    if (sourceTier && destTier) {
      if (source.droppableId === destination.droppableId) {
        const items = reorder(sourceTier.items, source.index, destination.index);
        const newTiers = tiers.map(tier => tier.id === source.droppableId ? { ...tier, items } : tier);
        setTiers(newTiers);
      } else {
        const { sourceItems, destItems } = move(sourceTier.items, destTier.items, source.index, destination.index);
        const newTiers = tiers.map(tier => {
          if (tier.id === source.droppableId) {
            return { ...tier, items: sourceItems };
          }
          if (tier.id === destination.droppableId) {
            return { ...tier, items: destItems };
          }
          return tier;
        });
        setTiers(newTiers);
      }
    }
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="space-y-4">
        {tiers.map(tier => (
          <div key={tier.id} className="bg-gray-200 p-4 rounded-md">
            <h3 className="text-center text-xl font-bold mb-2">{tier.name}</h3>
            <Droppable droppableId={tier.id} direction="horizontal">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`flex space-x-2 p-2 rounded-md ${snapshot.isDraggingOver ? 'bg-gray-300' : 'bg-gray-100'}`}
                >
                  {tier.items.map((item, index) => (
                    <Draggable key={item.id} draggableId={item.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={`p-4 rounded-md bg-gray-400 text-white ${snapshot.isDragging ? 'bg-gray-500' : ''}`}
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
          </div>
        ))}
      </div>
    </DragDropContext>
  );
};

export default DragDropTierList;
