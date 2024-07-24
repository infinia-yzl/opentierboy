import React, {useCallback, useEffect, useRef, memo} from 'react';
import {DragDropContext, Droppable, Draggable, DropResult} from '@hello-pangea/dnd';
import {toast} from "sonner";
import {v4 as uuidv4} from 'uuid';
import {useTierContext} from "@/contexts/TierContext";
import Item from "@/models/Item";
import Tier from "@/models/Tier";
import EditableLabel from '../components/EditableLabel';
import RowHandle from '../components/RowHandle';
import ItemTile from "@/components/ItemTile";
import {getTierGradient} from "@/lib/utils";

interface DragDropTierListProps {
  tiers: Tier[];
  onTiersUpdate: (updatedTiers: Tier[]) => void;
}

interface DeletedItemInfo {
  item: Item;
  tierId: string;
  id: string;
}

const reorder = <T, >(list: T[], startIndex: number, endIndex: number): T[] => {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
};

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
          className={`w-full flex flex-wrap p-0 rounded-md ${snapshot.isDraggingOver ? 'ring-1 ring-accent-foreground' : ''}`}
        >
          {tier.items.map((item, itemIndex) => (
            <Draggable key={item.id} draggableId={item.id} index={itemIndex}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.draggableProps}
                  {...provided.dragHandleProps}
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
  showLabels: boolean;
  onSaveLabel: (index: number, newText: string) => void;
  onDeleteItem: (itemId: string) => void;
}>(({tier, index, tiersLength, showLabels, onSaveLabel, onDeleteItem}) => {
  const labelPosition = tier.labelPosition || 'left';
  const tierGradient = getTierGradient(index, tiersLength);

  return (
    <Draggable draggableId={tier.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
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
          <div className="flex-1">
            {labelPosition === 'top' && index !== tiersLength - 1 && (
              <EditableLabel
                text={tier.name}
                onSave={(newText) => onSaveLabel(index, newText)}
                as="h3"
              />
            )}
            <div
              className={`flex ${labelPosition === 'left' ? 'flex-row' : labelPosition === 'right' ? 'flex-row-reverse' : 'flex-col'} items-center`}>
              {(labelPosition === 'left' || labelPosition === 'right') && (
                <div className="w-18 md:w-40">
                  <EditableLabel
                    text={tier.name}
                    onSave={(newText) => onSaveLabel(index, newText)}
                    className="p-1 flex flex-1 min-w-16 justify-center text-center"
                    as="h3"
                  />
                </div>
              )}
              <TierItems tier={tier} showLabels={showLabels} onDeleteItem={onDeleteItem}/>
            </div>
          </div>
          <RowHandle dragHandleProps={provided.dragHandleProps}/>
        </div>
      )}
    </Draggable>
  );
});
TierRow.displayName = 'TierRow';

const DragDropTierList: React.FC<DragDropTierListProps> = ({tiers, onTiersUpdate}) => {
  const {showLabels} = useTierContext();
  const tiersRef = useRef(tiers);
  const deletedItemsRef = useRef<DeletedItemInfo[]>([]);

  useEffect(() => {
    tiersRef.current = tiers;
  }, [tiers]);

  const onDragEnd = useCallback((result: DropResult) => {
    const {source, destination, type} = result;

    if (!destination) return;

    let newTiers: Tier[];

    if (type === 'TIER') {
      newTiers = reorder(tiers, source.index, destination.index);
      newTiers = newTiers.map((tier, index) => ({
        ...tier,
        name: tiers[index].name
      }));
    } else {
      newTiers = [...tiers];
      const sourceTier = newTiers.find(t => t.id === source.droppableId)!;
      const destTier = newTiers.find(t => t.id === destination.droppableId)!;

      if (sourceTier.id === destTier.id) {
        sourceTier.items = reorder(sourceTier.items, source.index, destination.index);
      } else {
        const [movedItem] = sourceTier.items.splice(source.index, 1);
        destTier.items.splice(destination.index, 0, movedItem);
      }
    }

    onTiersUpdate(newTiers);
  }, [tiers, onTiersUpdate]);

  const handleUndoDelete = useCallback((uniqueId: string) => {
    const deletedItemIndex = deletedItemsRef.current.findIndex((item) => item.id === uniqueId);
    if (deletedItemIndex === -1) return;

    const [deletedItem] = deletedItemsRef.current.splice(deletedItemIndex, 1);

    const newTiers = tiersRef.current.map((tier) => {
      if (tier.id === deletedItem.tierId) {
        return {...tier, items: [...tier.items, deletedItem.item]};
      }
      return tier;
    });

    onTiersUpdate(newTiers);

    toast('Item restored', {
      description: `${deletedItem.item.content} has been restored.`,
    });
  }, [onTiersUpdate]);

  const handleDeleteItem = useCallback((itemId: string) => {
    let deletedItemInfo: DeletedItemInfo | undefined;

    const newTiers = tiers.map(tier => {
      const itemIndex = tier.items.findIndex(item => item.id === itemId);
      if (itemIndex !== -1) {
        const [deletedItem] = tier.items.splice(itemIndex, 1);
        deletedItemInfo = {
          item: deletedItem,
          tierId: tier.id,
          id: uuidv4()
        };
        return {...tier, items: [...tier.items]};
      }
      return tier;
    });

    if (deletedItemInfo) {
      deletedItemsRef.current.push(deletedItemInfo);
      onTiersUpdate(newTiers);

      toast('Item deleted', {
        description: `${deletedItemInfo.item.content} was removed.`,
        action: {
          label: 'Undo',
          onClick: () => handleUndoDelete(deletedItemInfo!.id),
        },
      });
    }
  }, [tiers, onTiersUpdate, handleUndoDelete]);

  const handleSaveLabel = useCallback((index: number, newText: string) => {
    const newTiers = tiers.map((tier, i) => (i === index ? {...tier, name: newText} : tier));
    onTiersUpdate(newTiers);
  }, [tiers, onTiersUpdate]);

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
                showLabels={showLabels}
                onSaveLabel={handleSaveLabel}
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
