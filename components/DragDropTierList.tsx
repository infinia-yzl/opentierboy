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
  labelPosition?: 'top' | 'left' | 'right';
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
        {tiers.map(tier => {
          const labelPosition = tier.labelPosition || 'left';
          return (
            <div key={tier.id} className="bg-gray-800 p-4 rounded-md min-w-full sm:min-w-[500px] md:min-w-[600px] lg:min-w-[800px]">
              {labelPosition === 'top' && (
                <h3 className="text-center text-xl font-bold mb-2 text-white">{tier.name}</h3>
              )}
              <div className={`flex ${labelPosition === 'left' ? 'flex-row' : labelPosition === 'right' ? 'flex-row-reverse' : 'flex-col'} items-center`}>
                {(labelPosition === 'left' || labelPosition === 'right') && (
                  <h3 className="text-xl font-bold text-white m-4">{tier.name}</h3>
                )}
                <Droppable droppableId={tier.id} direction="horizontal">
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 flex p-2 rounded-md ${snapshot.isDraggingOver ? 'bg-gray-700' : 'bg-gray-600'}`}
                    >
                      {tier.items.map((item, index) => (
                        <Draggable key={item.id} draggableId={item.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`p-4 m-1 rounded-md bg-gray-500 text-white ${snapshot.isDragging ? 'bg-gray-400' : ''}`}
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
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
};

export default DragDropTierList;
