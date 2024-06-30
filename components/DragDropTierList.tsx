"use client";

import React, {useState, useCallback} from 'react';
import {DragDropContext, Droppable, Draggable, DropResult} from '@hello-pangea/dnd';
import RowHandle from '../components/RowHandle';
import EditableLabel from '../components/EditableLabel';
import Item, {ItemProps} from "@/components/Item";

interface Tier {
  id: string;
  name: string;
  items: ItemProps[];
  labelPosition?: 'top' | 'left' | 'right';
}

interface DragDropTierListProps {
  initialTiers: Tier[];
}

const DragDropTierList: React.FC<DragDropTierListProps> = ({initialTiers}) => {
  const [tiers, setTiers] = useState(initialTiers);
  const [draggedTierIndex, setDraggedTierIndex] = useState<number | null>(null);
  const [dragOverTierIndex, setDragOverTierIndex] = useState<number | null>(null);

  const onDragStart = useCallback((start: any) => {
    if (start.type === 'TIER') {
      setDraggedTierIndex(start.source.index);
    }
  }, []);

  const onDragUpdate = useCallback((update: any) => {
    if (update.destination && update.type === 'TIER') {
      setDragOverTierIndex(update.destination.index);
    }
  }, []);

  const reorder = <T, >(list: T[], startIndex: number, endIndex: number): T[] => {
    const result = Array.from(list);
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);
    return result;
  };

  const onDragEnd = (result: DropResult) => {
    const {source, destination, type} = result;

    if (!destination) {
      setDraggedTierIndex(null);
      setDragOverTierIndex(null);
      return;
    }

    if (type === 'TIER') {
      const newTiers = reorder(tiers, source.index, destination.index);
      const updatedTiers = newTiers.map((tier, index) => ({
        ...tier,
        name: tiers[index].name // Preserve original names in new positions
      }));
      setTiers(updatedTiers);
    } else {
      const newTiers = [...tiers];
      const sourceTier = newTiers[newTiers.findIndex(t => t.id === source.droppableId)];
      const destTier = newTiers[newTiers.findIndex(t => t.id === destination.droppableId)];

      if (sourceTier.id === destTier.id) {
        // Reordering within the same tier
        sourceTier.items = reorder(sourceTier.items, source.index, destination.index);
      } else {
        // Moving between tiers
        const [movedItem] = sourceTier.items.splice(source.index, 1);
        destTier.items.splice(destination.index, 0, movedItem);
      }

      setTiers(newTiers);
    }

    setDraggedTierIndex(null);
    setDragOverTierIndex(null);
  };

  const handleSaveLabel = (index: number, newText: string) => {
    const newTiers = tiers.map((tier, i) => (i === index ? {...tier, name: newText} : tier));
    setTiers(newTiers);
  };

  const getPreviewLabel = (index: number) => {
    if (draggedTierIndex === null || dragOverTierIndex === null) return tiers[index].name;

    if (index === draggedTierIndex) return tiers[dragOverTierIndex].name;
    if (draggedTierIndex < dragOverTierIndex && index > draggedTierIndex && index <= dragOverTierIndex) {
      return tiers[index - 1].name;
    }
    if (draggedTierIndex > dragOverTierIndex && index >= dragOverTierIndex && index < draggedTierIndex) {
      return tiers[index + 1].name;
    }
    return tiers[index].name;
  };
  return (
    <DragDropContext onDragStart={onDragStart} onDragUpdate={onDragUpdate} onDragEnd={onDragEnd}>
      <Droppable droppableId="all-tiers" direction="vertical" type="TIER">
        {(provided, snapshot) => (
          <div
            className={`space-y-4 p-4 ${snapshot.isDraggingOver && 'ring-2 ring-accent-foreground rounded'}`}
            {...provided.droppableProps}
            ref={provided.innerRef}
          >
            {tiers.map((tier, index) => {
              const labelPosition = tier.labelPosition || 'left';
              const previewLabel = getPreviewLabel(index);
              return (
                <Draggable draggableId={tier.id} index={index} key={tier.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={`
                        border
                        p-4 rounded-md min-w-full sm:min-w-[500px] md:min-w-[600px] lg:min-w-[800px] 
                        flex items-center
                        ${snapshot.isDragging && 'shadow-lg ring-2'}
                      `}
                      style={{
                        ...provided.draggableProps.style,
                        transition: snapshot.isDropAnimating
                          ? 'all 0.3s cubic-bezier(0.2, 0, 0, 1)'
                          : provided.draggableProps.style?.transition,
                      }}
                    >
                      <div className="flex-1">
                        {labelPosition === 'top' && (
                          <EditableLabel
                            text={previewLabel}
                            onSave={(newText) => handleSaveLabel(index, newText)}
                          />
                        )}
                        <div
                          className={`flex ${labelPosition === 'left' ? 'flex-row' : labelPosition === 'right' ? 'flex-row-reverse' : 'flex-col'} items-center`}>
                          {(labelPosition === 'left' || labelPosition === 'right') && (
                            <EditableLabel
                              text={previewLabel}
                              onSave={(newText) => handleSaveLabel(index, newText)}
                              className="m-4"
                            />
                          )}
                          <Droppable droppableId={tier.id} direction="horizontal">
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.droppableProps}
                                className={`w-full flex p-2 rounded-md bg-secondary ${snapshot.isDraggingOver && 'ring-1 ring-accent-foreground'}`}
                              >
                                {tier.items.map((item, itemIndex) => (
                                  <Draggable key={item.id} draggableId={item.id} index={itemIndex}>
                                    {(provided, snapshot) => (
                                      <div
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        {...provided.dragHandleProps}
                                        className={`
                                          p-4 m-1 rounded-md bg-card
                                          ${snapshot.isDragging ? 'shadow-md ring-2' : ''}
                                        `}
                                        style={{
                                          ...provided.draggableProps.style,
                                          transition: snapshot.isDropAnimating
                                            ? 'all 0.3s cubic-bezier(0.2, 0, 0, 1)'
                                            : provided.draggableProps.style?.transition,
                                        }}
                                      >
                                        <Item {...item} />
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
                      <RowHandle dragHandleProps={provided.dragHandleProps}/>
                    </div>
                  )}
                </Draggable>
              );
            })}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
};

export default DragDropTierList;
