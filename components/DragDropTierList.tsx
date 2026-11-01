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
import {DraggableTierItem, TierDragDrop, useTierDragDescription, useTierDragState, useTierItems, useTierRow} from "@/lib/dnd/react";
import type {ItemMove, RowMove} from "@/lib/dnd/model";
import {useZenMode} from "@/components/usePageState";
import {useRankingOrder} from "@/components/useRankingOrder";
import {itemsLeftText, queueOrder, type RankingOrder} from "@/lib/zen/queue";
import {tileClassName} from "@/lib/tileSize";
import {useActiveStage} from "@/components/useZenLayout";
import {shownQueue} from "@/lib/zen/layouts";
import {cn} from "@/lib/utils";

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
}>(({item, tierId, index, sourceId, showLabels, onDeleteItem}) => (
  // DraggableTierItem keys the tile by its item id: a tile never changes items (lib/dnd/react.tsx).
  <DraggableTierItem itemId={item.id} tierId={tierId} index={index}>
    {({ref, isDragging, describedBy, roleDescription}) => (
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        aria-roledescription={roleDescription}
        aria-describedby={[describedBy, sourceId].filter(Boolean).join(' ') || undefined}
        aria-label={itemDisplayLabel(item)}
        // A long press (touch) opens the item menu or starts a drag: no text selection, no callout.
        className={`select-none [-webkit-touch-callout:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${isDragging ? 'shadow-md ring-2 ring-ring' : ''}`}
      >
        <ItemTile {...item} onDelete={onDeleteItem} showLabel={showLabels}/>
      </div>
    )}
  </DraggableTierItem>
));
TierItem.displayName = 'TierItem';

const TierItems = memo<{
  tier: Tier;
  showLabels: boolean;
  onDeleteItem: (itemId: string) => void;
  /** After the items, inside the drop area: the tray's "Add images" tile. */
  trailing?: React.ReactNode;
  /** More classes for the drop area (the tray's). */
  className?: string;
}>(({tier, showLabels, onDeleteItem, trailing, className = ''}) => {
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
        className={`flex-1 min-w-0 min-h-16 md:min-h-20 compact:min-h-12 stage:min-h-(--stage-tile) flex flex-wrap content-start ${className} ${isDropTarget ? 'ring-2 ring-inset ring-ring/60' : ''}`}
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

/**
 * The tier letter's size: big for a letter or two, smaller for longer names, which wrap. Compact
 * tiles (the dense editor) take smaller letters; the frame layouts take theirs from the frame
 * (`--stage-letter`, lib/zen/layouts.ts).
 */
function rowLabelClass(name: string, labelPosition: LabelPosition): string {
  const length = Array.from(name.trim()).length;
  const size = labelPosition === 'top' ? 'text-lg stage:text-[length:calc(var(--stage-letter)*0.4)]'
    : length <= 2 ? 'text-[1.625rem] sm:text-3xl compact:text-xl stage:text-(length:--stage-letter)'
      : length <= 5 ? 'text-lg sm:text-xl compact:text-[15px] stage:text-[length:calc(var(--stage-letter)*0.5)]'
        : 'text-sm stage:text-[length:calc(var(--stage-letter)*0.3)]';
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
        : 'w-14 sm:w-24 compact:sm:w-22 stage:w-(--stage-letter-column) shrink-0 self-stretch flex items-center justify-center p-1 text-center'}
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
      className={`w-full min-h-16 md:min-h-20 compact:min-h-12 stage:min-h-(--stage-tile) flex border-b border-black/10 dark:border-white/10 ${isDragging ? 'relative z-10 shadow-lg ring-2 ring-ring' : ''}`}
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
 * heading, and the "Add images" tile ends the items; both hide in Zen. In Zen the heading says
 * how many items are left ("Unranked · 6 left"), and with the ranking order In order or Shuffle
 * the tray shows the item that is up next and the queue after it (UpNextTray).
 */
const UnrankedTray = memo<{
  tier: Tier;
  listIndex: number;
  showLabels: boolean;
  onSaveLabel: (index: number, newText: string) => void;
  onDeleteItem: (itemId: string) => void;
  addImagesTile?: React.ReactNode;
}>(({tier, listIndex, showLabels, onSaveLabel, onDeleteItem, addImagesTile}) => {
  const tierLabel = tier.name.trim() || 'Unranked';
  const isZenMode = useZenMode();
  const {order, hideQueue, shuffled} = useRankingOrder();
  if (isZenMode && order !== 'pick') {
    return (
      <UpNextTray
        tier={tier}
        tierLabel={tierLabel}
        order={order}
        shuffled={shuffled}
        hideQueue={hideQueue}
        showLabels={showLabels}
        onDeleteItem={onDeleteItem}
      />
    );
  }
  return (
    // In a frame layout the tray has no box, and its tiles take the frame's tray size; in 9:16 it
    // fills the space under the rows, in the middle (the board "9:16 · Pick freely"). In 16:9 it
    // takes the space under the rows and scrolls, so the frame keeps its size for recording
    // (owner decision, 2026-11-01).
    <section role="group" aria-label={tierLabel} className="mt-4 w-full rounded-xl bg-muted p-3 flex flex-col gap-2 stage:mt-(--stage-gap) stage:rounded-none stage:bg-transparent stage:p-0 stage-tall:grow stage-tall:justify-center stage-wide:flex-1 stage-wide:min-h-0 stage:gap-[calc(var(--u)*10)] stage:[--stage-tile:var(--stage-tray-tile)]">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <EditableLabel
          text={tier.name}
          onSave={(newText) => onSaveLabel(listIndex, newText)}
          contentClassName="text-sm font-semibold stage:text-(length:--stage-tray-heading) stage:font-black"
          as="h2"
          emptyText="Unranked"
        />
        {isZenMode && (
          <span className="text-sm text-muted-foreground stage:text-(length:--stage-tray-count)">· {itemsLeftText(tier.items.length)}</span>
        )}
        {/* A wrapping row: the mouse and touch classes set display: block (app/globals.css). */}
        <p className="hide-in-zen flex flex-wrap gap-x-1 text-sm text-muted-foreground" data-html2canvas-ignore>
          <span>Drag to reorder.</span>
          <span className="tooltip-mouse">Right-click on any item to delete.</span>
          <span className="tooltip-touch">Long-press on any item to delete.</span>
          <span className="tooltip-mouse">Paste an image to add it as an item.</span>
        </p>
      </div>
      <TierItems
        tier={tier}
        showLabels={showLabels}
        onDeleteItem={onDeleteItem}
        trailing={addImagesTile && <div className="hide-in-zen" data-html2canvas-ignore>{addImagesTile}</div>}
        // In 9:16 the tray fills the space under the rows and centres its items in it; in 16:9 its
        // items scroll.
        className="stage-tall:flex-none stage-wide:overflow-y-auto"
      />
    </section>
  );
});
UnrankedTray.displayName = 'UnrankedTray';

/**
 * The Unranked tray in Zen with the ranking order In order or Shuffle (owner decisions,
 * 2026-10-28 and 2026-10-29): "Up next" with the next item, to drag into a row, then the queue
 * of the items after it. "Hide the queue" shows the queue as blank tiles. The tray still takes
 * items dropped on it, and the queue follows the tray: an item put back comes up again in its
 * place (In order) or in its drawn place (Shuffle; last when it was added after the draw).
 */
const UpNextTray = memo<{
  tier: Tier;
  tierLabel: string;
  order: RankingOrder;
  shuffled: readonly string[];
  hideQueue: boolean;
  showLabels: boolean;
  onDeleteItem: (itemId: string) => void;
}>(({tier, tierLabel, order, shuffled, hideQueue, showLabels, onDeleteItem}) => {
  const queueLabelId = useId();
  const {ref, isDropTarget} = useTierItems({tierId: tier.id});
  // The frame layouts show the same parts in their own places (owner decision, 2026-10-31):
  // 16:9 as the editor; 9:16 with the item up next large in the middle and its name under it;
  // the overlay as one strip of small tiles without labels. The frames show one line of queue.
  const stage = useActiveStage();
  const tall = stage === 'tall';
  const strip = stage === 'overlay';
  const places = new Map(tier.items.map((item, index) => [item.id, {item, index}]));
  const [nextId, ...restIds] = queueOrder(tier.items.map(item => item.id), order, shuffled);
  const next = nextId === undefined ? undefined : places.get(nextId);
  const rest = shownQueue(restIds.flatMap(id => places.get(id)?.item ?? []), stage ?? 'editor');
  const left = itemsLeftText(tier.items.length);
  const queueLabel = hideQueue ? 'Queue (hidden)' : 'Queue';
  return (
    <section role="group" aria-label={tierLabel} className="mt-4 w-full rounded-xl bg-muted p-3 stage:mt-(--stage-gap) stage:rounded-none stage:bg-transparent stage:p-0 stage-tall:grow stage-tall:justify-center stage-tall:flex stage-tall:flex-col">
      <div
        ref={ref}
        className={cn(
          'flex',
          !stage && 'min-h-16 md:min-h-20 flex-wrap items-end gap-x-6 gap-y-3',
          stage === 'wide' && 'flex-wrap items-end gap-x-[calc(var(--u)*28)] gap-y-[calc(var(--u)*12)]',
          tall && 'flex-col items-center gap-[calc(var(--u)*20)]',
          strip && 'items-center',
          isDropTarget && 'ring-2 ring-inset ring-ring/60',
        )}
      >
        <div className={cn(
          'flex',
          !stage && 'flex-col gap-2',
          stage === 'wide' && 'flex-col gap-[calc(var(--u)*10)]',
          tall && 'flex-col items-center gap-[calc(var(--u)*20)]',
          strip && 'items-center gap-[calc(var(--u)*12)]',
        )}>
          <div className="flex items-baseline gap-2 stage:gap-[calc(var(--u)*12)]">
            <h2 className={cn(
              'text-sm font-semibold stage:text-(length:--stage-tray-heading) stage:font-black',
              tall && 'font-semibold text-muted-foreground',
            )}>
              Up next
            </h2>
            {!strip && (
              <span className="text-sm text-muted-foreground stage:text-(length:--stage-tray-count) stage-tall:font-semibold">
                {tall ? `· ${left}` : left}
              </span>
            )}
          </div>
          {next && (
            <>
              {/* The item up next: the tile to drag, with a ring. In 9:16 it is large, with its name under it. */}
              <div className={cn('relative self-start stage:[--stage-tile:var(--stage-hero)]', tall && 'self-center')}>
                {/* The same tile as in the rows: DraggableTierItem keys it by its item, so when
                    the item up next changes, a new tile takes its place. */}
                <TierItem
                  item={next.item}
                  tierId={tier.id}
                  index={next.index}
                  showLabels={showLabels && !tall && !strip}
                  onDeleteItem={onDeleteItem}
                />
                <span aria-hidden="true" className="pointer-events-none absolute inset-0 ring-4 ring-inset ring-ring stage:ring-(length:--stage-ring)"/>
              </div>
              {tall && (
                <p aria-hidden="true" className="font-heading font-black leading-tight text-center text-(length:--stage-hero-name)">
                  {itemDisplayLabel(next.item)}
                </p>
              )}
            </>
          )}
        </div>
        {rest.length > 0 && (
          <div className={cn('flex min-w-0 flex-col', stage ? 'gap-[calc(var(--u)*10)]' : 'gap-2', tall && 'items-center')}>
            {/* 9:16 and the overlay show no queue heading (the boards); the list keeps its name. */}
            <span id={queueLabelId} className={cn('text-sm text-muted-foreground stage:text-(length:--stage-tray-count)', (tall || strip) && 'sr-only')}>
              {queueLabel}
            </span>
            <ol aria-labelledby={queueLabelId} className={cn('flex flex-wrap stage:[--stage-tile:var(--stage-queue-tile)]', stage && 'flex-nowrap')}>
              {rest.map(item => hideQueue ? (
                <li key={item.id} aria-hidden="true" className={`${tileClassName(item)} flex items-center justify-center border-r border-muted bg-muted-foreground/15 font-heading text-3xl stage:text-[length:calc(var(--stage-tile)*0.4)] font-black text-muted-foreground`}>
                  ?
                </li>
              ) : (
                <li key={item.id} aria-label={itemDisplayLabel(item)}>
                  <ItemTile {...item} showLabel={showLabels && !strip}/>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
});
UpNextTray.displayName = 'UpNextTray';

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
}

const DragDropTierList: React.FC<DragDropTierListProps> = ({belowRows, addImagesTile}) => {
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
              />
            )}
          </>
        );
      }}
    </TierDragDrop>
  );
};

export default DragDropTierList;
