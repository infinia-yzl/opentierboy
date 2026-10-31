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
 *
 * The Clean layout (owner decisions, 2026-10-28 and 2026-10-31): the ranked rows sit flush, each
 * with its tier letter in a column on its gradient, its tiles flush, and its handle at the end.
 * Unranked, the last row, is a fixed tray under them, with the hints and an "Add images" tile;
 * rows never move into its place (lib/dnd/moves.ts, reorderRows).
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
      className={`select-none [-webkit-touch-callout:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${isDragging ? 'shadow-md ring-2 ring-ring' : ''}`}
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
  /** After the items, inside the drop area: the tray's "Add images" tile. */
  trailing?: React.ReactNode;
}>(({tier, showLabels, onDeleteItem, trailing}) => {
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
        className={`flex-1 min-w-0 min-h-16 md:min-h-20 flex flex-wrap content-start ${isDropTarget ? 'ring-2 ring-inset ring-ring/60' : ''}`}
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
        {trailing}
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

/** The tier letter's size: big for a letter or two, smaller for longer names, which wrap. */
function rowLabelClass(name: string, labelPosition: LabelPosition): string {
  const length = Array.from(name.trim()).length;
  const size = labelPosition === 'top' ? 'text-lg'
    : length <= 2 ? 'text-[1.625rem] sm:text-3xl'
      : length <= 5 ? 'text-lg sm:text-xl'
        : 'text-sm';
  return `font-heading font-black leading-tight break-words ${size}`;
}

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
  // Accessible name for the row. A row whose label was cleared is named after its position.
  const tierLabel = tier.name.trim() || `Tier ${listIndex + 1}`;
  const label = (
    <EditableLabel
      text={tier.name}
      onSave={(newText) => onSaveLabel(listIndex, newText)}
      className={labelPosition === 'top'
        ? 'px-2 pt-1'
        : 'w-14 sm:w-24 shrink-0 self-stretch flex items-center justify-center p-1 text-center'}
      contentClassName={rowLabelClass(tier.name, labelPosition)}
      as="h2"
      emptyLabel={tierLabel}
    />
  );

  return (
    <div
      ref={ref}
      role="group"
      aria-label={tierLabel}
      className={`w-full min-h-16 md:min-h-20 flex border-b border-black/10 dark:border-white/10 ${isDragging ? 'relative z-10 shadow-lg ring-2 ring-ring' : ''}`}
      style={{background: tierGradient}}
    >
      {labelPosition === 'top' ? (
        <div className="flex-1 min-w-0 flex flex-col">
          {label}
          <TierItems tier={tier} showLabels={showLabels} onDeleteItem={onDeleteItem}/>
        </div>
      ) : (
        <div className={`flex-1 min-w-0 flex ${labelPosition === 'right' ? 'flex-row-reverse' : 'flex-row'}`}>
          {label}
          <TierItems tier={tier} showLabels={showLabels} onDeleteItem={onDeleteItem}/>
        </div>
      )}
      <RowHandle handleRef={handleRef} describedBy={describedBy} label={tierLabel}/>
    </div>
  );
});
TierRow.displayName = 'TierRow';

/**
 * Unranked, the last row: a fixed tray under the rows, with no handle (owner decision,
 * 2026-10-31). Its heading reads "Unranked" until someone names it. The hints sit beside the
 * heading, and the "Add images" tile ends the items; both hide in Zen.
 */
const UnrankedTray = memo<{
  tier: Tier;
  listIndex: number;
  showLabels: boolean;
  onSaveLabel: (index: number, newText: string) => void;
  onDeleteItem: (itemId: string) => void;
  addImagesTile?: React.ReactNode;
  /** In place of the items and the hints when the whole list is empty: the drop area. */
  emptyListArea?: React.ReactNode;
}>(({tier, listIndex, showLabels, onSaveLabel, onDeleteItem, addImagesTile, emptyListArea}) => {
  const tierLabel = tier.name.trim() || 'Unranked';
  return (
    <section role="group" aria-label={tierLabel} className="mt-4 w-full rounded-xl bg-muted p-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <EditableLabel
          text={tier.name}
          onSave={(newText) => onSaveLabel(listIndex, newText)}
          contentClassName="text-sm font-semibold"
          as="h2"
          emptyText="Unranked"
        />
        {/* A wrapping row: the mouse and touch classes set display: block (app/globals.css). */}
        {!emptyListArea && <p className="hide-in-zen flex flex-wrap gap-x-1 text-sm text-muted-foreground" data-html2canvas-ignore>
          <span>Drag to reorder.</span>
          <span className="tooltip-mouse">Right-click on any item to delete.</span>
          <span className="tooltip-touch">Long-press on any item to delete.</span>
          <span className="tooltip-mouse">Paste an image to add it as an item.</span>
        </p>}
      </div>
      {emptyListArea ? (
        <div className="hide-in-zen" data-html2canvas-ignore>{emptyListArea}</div>
      ) : (
        <TierItems
          tier={tier}
          showLabels={showLabels}
          onDeleteItem={onDeleteItem}
          trailing={addImagesTile && <div className="hide-in-zen" data-html2canvas-ignore>{addImagesTile}</div>}
        />
      )}
    </section>
  );
});
UnrankedTray.displayName = 'UnrankedTray';

const RowList: React.FC<{children: React.ReactNode}> = ({children}) => {
  const {rowDrag, dragging} = useTierDragState();
  return (
    // data-dragging turns off the tile label blur during a drag and its drop animation
    // (app/globals.css), as scrolling does: hundreds of blurred layers made every frame of a
    // drag slow. The blur comes back once the item has landed: at the release, the labels'
    // transitions back to the blur made the drop animation slow.
    <div className="w-full" data-dragging={dragging || undefined}>
      <div className={`w-full border-t border-black/10 dark:border-white/10 ${rowDrag ? 'ring-2 ring-ring' : ''}`}>
        {children}
      </div>
    </div>
  );
};

interface DragDropTierListProps {
  /** Between the rows and the Unranked tray: Add row and Row options (RowControls). */
  belowRows?: React.ReactNode;
  /** The tray's "Add images" tile (ItemManager with the tile trigger). */
  addImagesTile?: React.ReactNode;
  /**
   * An empty list's drop area (EmptyListDropArea, owner decision 2026-10-31). It takes the place
   * of the tray's items, hints and tile while no row holds an item.
   */
  emptyListArea?: React.ReactNode;
}

const DragDropTierList: React.FC<DragDropTierListProps> = ({belowRows, addImagesTile, emptyListArea}) => {
  const {tiers, labelPosition, showLabels, moveItem, moveTier, renameTier, deleteItem, restoreItem} = useTierContext();

  const listIsEmpty = tiers.every((tier) => tier.items.length === 0);

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
      {(shownTiers) => {
        // Unranked is always the last row, also in a preview: rows never move into its place.
        const ranked = shownTiers.slice(0, -1);
        const unranked = shownTiers[shownTiers.length - 1];
        return (
          <>
            <RowList>
              {ranked.map((tier, index) => (
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
            {belowRows}
            {unranked && (
              <UnrankedTray
                key={unranked.id}
                tier={unranked}
                listIndex={shownTiers.length - 1}
                showLabels={showLabels}
                onSaveLabel={renameTier}
                onDeleteItem={handleDeleteItem}
                addImagesTile={addImagesTile}
                emptyListArea={listIsEmpty ? emptyListArea : undefined}
              />
            )}
          </>
        );
      }}
    </TierDragDrop>
  );
};

export default DragDropTierList;
