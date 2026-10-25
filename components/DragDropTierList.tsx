import React, {useCallback, memo} from 'react';
import {DragDropContext, Droppable, Draggable, DropResult} from '@hello-pangea/dnd';
import {toast} from "sonner";
import {useTierContext} from "@/contexts/TierContext";
import Tier, {LabelPosition} from "@/models/Tier";
import EditableLabel from '../components/EditableLabel';
import RowHandle from '../components/RowHandle';
import ItemTile from "@/components/ItemTile";
import {getTierGradient} from "@/lib/utils";
import {findItemToDelete} from "@/lib/tierListReducer";

const TierItems = memo<{
  tier: Tier;
  showLabels: boolean;
  onDeleteItem: (itemId: string) => void;
}>(({tier, showLabels, onDeleteItem}) => {
  return (
    <Droppable droppableId={tier.id} direction="horizontal">
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={`w-full min-h-17 md:min-h-21 flex flex-wrap p-0 rounded-md ${snapshot.isDraggingOver ? 'ring-1 ring-accent-foreground' : ''}`}
        >
          {tier.items.map((item, itemIndex) => (
            <Draggable key={item.id} draggableId={item.id} index={itemIndex}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.draggableProps}
                  {...provided.dragHandleProps}
                  aria-label={item.content}
                  className={`
                    m-0.5 rounded-md
                    ${snapshot.isDragging ? 'shadow-md ring-2' : ''}
                  `}
                  style={{
                    ...provided.draggableProps.style,
                    transition: snapshot.isDropAnimating
                      ? 'all 0.3s cubic-bezier(0.2, 0, 0, 1)'
                      : provided.draggableProps.style?.transition,
                  }}
                >
                  <ItemTile {...item} onDelete={onDeleteItem} showLabel={showLabels}/>
                </div>
              )}
            </Draggable>
          ))}
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  );
});
TierItems.displayName = 'TierItems';

const TierRow = memo<{
  tier: Tier;
  index: number;
  tiersLength: number;
  labelPosition: LabelPosition;
  showLabels: boolean;
  onSaveLabel: (index: number, newText: string) => void;
  onDeleteItem: (itemId: string) => void;
}>(({tier, index, tiersLength, labelPosition, showLabels, onSaveLabel, onDeleteItem}) => {
  const tierGradient = getTierGradient(index, tiersLength);
  // Accessible name for the row. The unnamed last row holds unranked items; any other
  // row whose label was cleared is named after its position.
  const isLastRow = index === tiersLength - 1;
  const tierLabel = tier.name.trim() || (isLastRow ? 'Unranked' : `Tier ${index + 1}`);

  return (
    <Draggable draggableId={tier.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          role="group"
          aria-label={tierLabel}
          className={`
            border rounded-md min-w-full sm:min-w-[500px] md:min-w-[600px] lg:min-w-[800px] 
            min-h-20
            flex items-center
            ${snapshot.isDragging ? 'shadow-lg ring-2' : ''}
          `}
          style={{
            ...provided.draggableProps.style,
            background: tierGradient,
            transition: snapshot.isDropAnimating
              ? 'all 0.3s cubic-bezier(0.2, 0, 0, 1)'
              : provided.draggableProps.style?.transition,
          }}
        >
          <div className={`flex-1 ${labelPosition === 'top' && 'pl-2'}`}>
            {labelPosition === 'top' && index !== tiersLength - 1 && (
              <EditableLabel
                text={tier.name}
                onSave={(newText) => onSaveLabel(index, newText)}
                className="p-1"
                contentClassName="tracking-wide text-xl font-semibold"
                as="h2"
              />
            )}
            <div
              className={`flex ${labelPosition === 'left' ? 'flex-row' : labelPosition === 'right' ? 'flex-row-reverse' : 'flex-col'} items-center`}>
              {(labelPosition === 'left' || labelPosition === 'right') && (
                <div className="md:w-40">
                  <EditableLabel
                    text={tier.name}
                    onSave={(newText) => onSaveLabel(index, newText)}
                    className="p-1 flex flex-1 min-w-16 max-w-20 sm:max-w-full justify-center text-center"
                    contentClassName="tracking-wide text-xl font-semibold"
                    as="h2"
                  />
                </div>
              )}
              <TierItems tier={tier} showLabels={showLabels} onDeleteItem={onDeleteItem}/>
            </div>
          </div>
          <RowHandle dragHandleProps={provided.dragHandleProps} label={tierLabel}/>
        </div>
      )}
    </Draggable>
  );
});
TierRow.displayName = 'TierRow';

const DragDropTierList: React.FC = () => {
  const {tiers, labelPosition, showLabels, moveItem, moveTier, renameTier, deleteItem, restoreItem} = useTierContext();

  const onDragEnd = useCallback((result: DropResult) => {
    const {source, destination, type} = result;
    if (!destination) return;

    if (type === 'TIER') {
      moveTier(source.index, destination.index);
    } else {
      moveItem(
        {tierId: source.droppableId, index: source.index},
        {tierId: destination.droppableId, index: destination.index},
      );
    }
  }, [moveItem, moveTier]);

  const handleDeleteItem = useCallback((itemId: string) => {
    const deleted = findItemToDelete(tiers, itemId);
    if (!deleted) return;
    deleteItem(itemId);

    let restored = false;
    toast('Item deleted', {
      description: `${deleted.item.content} was removed.`,
      action: {
        label: 'Undo',
        onClick: () => {
          if (restored) return;
          restored = true;
          // Undo is a new change to the list, so it adds a history entry (A6).
          restoreItem(deleted.item, deleted.tierId);
          toast('Item restored', {
            description: `${deleted.item.content} has been restored.`,
          });
        },
      },
    });
  }, [tiers, deleteItem, restoreItem]);

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="all-tiers" direction="vertical" type="TIER">
        {(provided, snapshot) => (
          <div
            className={`pt-4 py-4 ${snapshot.isDraggingOver ? 'ring-2 ring-accent-foreground rounded' : ''}`}
            {...provided.droppableProps}
            ref={provided.innerRef}
          >
            {tiers.map((tier, index) => (
              <TierRow
                key={tier.id}
                tier={tier}
                index={index}
                tiersLength={tiers.length}
                labelPosition={labelPosition}
                showLabels={showLabels}
                onSaveLabel={renameTier}
                onDeleteItem={handleDeleteItem}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
};

export default DragDropTierList;
