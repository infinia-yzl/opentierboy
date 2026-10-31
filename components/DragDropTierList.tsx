import React, {useCallback, memo, useId, useLayoutEffect, useMemo, useRef} from 'react';
import {toast} from "sonner";
import {useTierContext} from "@/contexts/TierContext";
import Tier, {LabelPosition} from "@/models/Tier";
import Item from "@/models/Item";
import EditableLabel from '../components/EditableLabel';
import RowHandle from '../components/RowHandle';
import ItemTile from "@/components/ItemTile";
import {getTierGradient} from "@/lib/utils";
import {findItemToDelete} from "@/lib/tierListReducer";
import {itemDisplayLabel, linkImageOf} from "@/lib/images/listImages";
import {TierDragDrop, useTierDragDescription, useTierDragState, useTierItem, useTierItems, useTierRow} from "@/lib/dnd/react";
import type {ItemMove, RowMove} from "@/lib/dnd/model";

/**
 * The rows of the editor, with drag and drop from lib/dnd (dnd-kit). Items move inside and
 * between rows, rows move by their handle, with the mouse, by touch (hold, then move) and with
 * the keyboard. The list changes only on drop: one history entry per move (product rule 2).
 */

const TierItem = memo<{
  item: Item;
  tierId: string;
  index: number;
  sourceId?: string;
  showLabels: boolean;
  onDeleteItem: (itemId: string) => void;
}>(({item, tierId, index, sourceId, showLabels, onDeleteItem}) => {
  const {ref, isDragging, describedBy} = useTierItem({itemId: item.id, tierId, index});
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-describedby={[describedBy, sourceId].filter(Boolean).join(' ') || undefined}
      aria-label={itemDisplayLabel(item)}
      // A long press (touch) opens the item menu or starts a drag: no text selection, no callout.
      className={`m-0.5 rounded-md select-none [-webkit-touch-callout:none] ${isDragging ? 'shadow-md ring-2' : ''}`}
    >
      <ItemTile {...item} onDelete={onDeleteItem} showLabel={showLabels}/>
    </div>
  );
});
TierItem.displayName = 'TierItem';

const TierItems = memo<{
  tier: Tier;
  showLabels: boolean;
  onDeleteItem: (itemId: string) => void;
}>(({tier, showLabels, onDeleteItem}) => {
  const descriptionIds = useId();
  const {ref, isDropTarget} = useTierItems({tierId: tier.id});
  // A link image names its site in the item's description, next to the drag instructions. The
  // descriptions sit in a hidden list after the row, so they stay out of the items' text.
  const sources = tier.items.map((item, itemIndex) => {
    const domain = linkImageOf(item)?.domain;
    return domain ? {id: `${descriptionIds}-${itemIndex}`, domain} : null;
  });
  return (
    <>
      <div
        ref={ref}
        className={`w-full min-h-17 md:min-h-21 flex flex-wrap p-0 rounded-md ${isDropTarget ? 'ring-1 ring-accent-foreground' : ''}`}
      >
        {tier.items.map((item, itemIndex) => (
          <TierItem
            key={item.id}
            item={item}
            tierId={tier.id}
            index={itemIndex}
            sourceId={sources[itemIndex]?.id}
            showLabels={showLabels}
            onDeleteItem={onDeleteItem}
          />
        ))}
      </div>
      {sources.some(Boolean) && (
        <div hidden>
          {sources.map((source) => source && <span key={source.id} id={source.id}>Image from {source.domain}</span>)}
        </div>
      )}
    </>
  );
});
TierItems.displayName = 'TierItems';

const TierRow = memo<{
  tier: Tier;
  /** The row's place on screen (during a row drag, in the preview). */
  index: number;
  /** The row's place in the list. During a row drag the row keeps its look and name until the drop. */
  listIndex: number;
  tiersLength: number;
  labelPosition: LabelPosition;
  showLabels: boolean;
  onSaveLabel: (index: number, newText: string) => void;
  onDeleteItem: (itemId: string) => void;
}>(({tier, index, listIndex, tiersLength, labelPosition, showLabels, onSaveLabel, onDeleteItem}) => {
  const {ref, handleRef, isDragging} = useTierRow({tierId: tier.id, index});
  const describedBy = useTierDragDescription();
  const tierGradient = getTierGradient(listIndex, tiersLength);
  // Accessible name for the row. The unnamed last row holds unranked items; any other
  // row whose label was cleared is named after its position.
  const isLastRow = listIndex === tiersLength - 1;
  const tierLabel = tier.name.trim() || (isLastRow ? 'Unranked' : `Tier ${listIndex + 1}`);

  return (
    <div
      ref={ref}
      role="group"
      aria-label={tierLabel}
      className={`
        border rounded-md min-w-full sm:min-w-[500px] md:min-w-[600px] lg:min-w-[800px]
        min-h-20
        flex items-center
        ${isDragging ? 'shadow-lg ring-2' : ''}
      `}
      style={{background: tierGradient}}
    >
      <div className={`flex-1 ${labelPosition === 'top' && 'pl-2'}`}>
        {labelPosition === 'top' && !isLastRow && (
          <EditableLabel
            text={tier.name}
            onSave={(newText) => onSaveLabel(listIndex, newText)}
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
                onSave={(newText) => onSaveLabel(listIndex, newText)}
                className="p-1 flex flex-1 min-w-16 max-w-20 sm:max-w-full justify-center text-center"
                contentClassName="tracking-wide text-xl font-semibold"
                as="h2"
              />
            </div>
          )}
          <TierItems tier={tier} showLabels={showLabels} onDeleteItem={onDeleteItem}/>
        </div>
      </div>
      <RowHandle handleRef={handleRef} describedBy={describedBy} label={tierLabel}/>
    </div>
  );
});
TierRow.displayName = 'TierRow';

const RowList: React.FC<{children: React.ReactNode}> = ({children}) => {
  const {rowDrag, dragging} = useTierDragState();
  return (
    // data-dragging turns off the tile label blur during a drag (app/globals.css), as scrolling
    // does: hundreds of blurred layers made every frame of a drag slow.
    <div
      className={`pt-4 py-4 ${rowDrag ? 'ring-2 ring-accent-foreground rounded' : ''}`}
      data-dragging={dragging || undefined}
    >
      {children}
    </div>
  );
};

const DragDropTierList: React.FC = () => {
  const {tiers, labelPosition, showLabels, moveItem, moveTier, renameTier, deleteItem, restoreItem} = useTierContext();

  const handleItemMove = useCallback((move: ItemMove) => moveItem(move.from, move.to), [moveItem]);
  const listIndexOf = useMemo(() => new Map(tiers.map((tier, index) => [tier.id, index])), [tiers]);
  const handleRowMove = useCallback((move: RowMove) => moveTier(move.from, move.to), [moveTier]);

  // The list as of the last render, for the delete handler. Reading it from a ref keeps the
  // handler the same function across list changes, so a drop or a delete renders only the
  // rows that changed (the tiles are memoised), and every other tile stays as it is.
  const tiersRef = useRef(tiers);
  useLayoutEffect(() => {
    tiersRef.current = tiers;
  }, [tiers]);

  const handleDeleteItem = useCallback((itemId: string) => {
    const deleted = findItemToDelete(tiersRef.current, itemId);
    if (!deleted) return;
    deleteItem(itemId);

    let restored = false;
    toast('Item deleted', {
      description: `${itemDisplayLabel(deleted.item)} was removed.`,
      action: {
        label: 'Undo',
        onClick: () => {
          if (restored) return;
          restored = true;
          // Undo is a new change to the list, so it adds a history entry (A6).
          restoreItem(deleted.item, deleted.tierId);
          toast('Item restored', {
            description: `${itemDisplayLabel(deleted.item)} has been restored.`,
          });
        },
      },
    });
  }, [deleteItem, restoreItem]);

  return (
    // Announcements name rows and items by their labels, never by internal ids.
    <TierDragDrop tiers={tiers} onItemMove={handleItemMove} onRowMove={handleRowMove} itemLabel={itemDisplayLabel}>
      {(shownTiers) => (
        <RowList>
          {shownTiers.map((tier, index) => (
            <TierRow
              key={tier.id}
              tier={tier}
              index={index}
              listIndex={listIndexOf.get(tier.id) ?? index}
              tiersLength={shownTiers.length}
              labelPosition={labelPosition}
              showLabels={showLabels}
              onSaveLabel={renameTier}
              onDeleteItem={handleDeleteItem}
            />
          ))}
        </RowList>
      )}
    </TierDragDrop>
  );
};

export default DragDropTierList;
