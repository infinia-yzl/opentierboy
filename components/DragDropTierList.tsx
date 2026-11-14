import React, {useCallback, memo, useId, useLayoutEffect, useMemo, useRef} from 'react';
import {toast} from "@/lib/toast";
import {useTierContext} from "@/contexts/TierContext";
import Tier, {LabelPosition} from "@/models/Tier";
import Item from "@/models/Item";
import EditableLabel from '../components/EditableLabel';
import {RowGrip, RowStack} from '../components/RowHandle';
import ItemTile from "@/components/ItemTile";
import {FirstDragHint} from "@/components/EditorTips";
import {getTierColour, getTierGradient} from "@/lib/utils";
import {findItemToDelete} from "@/lib/tierListReducer";
import {itemDisplayLabel, linkImageOf} from "@/lib/images/listImages";
import {DraggableTierItem, TierDragDrop, useTierDragDescription, useTierDragState, useTierItems, useTierRow} from "@/lib/dnd/react";
import type {ItemMove, RowMove} from "@/lib/dnd/model";
import {rowLabel} from "@/lib/dnd/labels";
import {useZenMode} from "@/components/usePageState";
import {useRankingOrder} from "@/components/useRankingOrder";
import {itemsLeftText, queueOrder, type RankingOrder} from "@/lib/zen/queue";
import {tileClassName} from "@/lib/tileSize";
import {useActiveStage} from "@/components/useZenLayout";
import {shownQueue} from "@/lib/zen/layouts";
import {cn} from "@/lib/utils";

/**
 * The rows of the editor, with drag and drop from lib/dnd (dnd-kit). Items move inside and
 * between rows; a row moves whole by its grip, and its items alone by its stack (owner
 * decision, 2026-11-14), with the mouse, by touch (hold, then move) and with the keyboard. The
 * list changes only on drop: one history entry per move (product rule 2).
 *
 * The Clean layout (owner decisions, 2026-10-28 and 2026-10-31): the ranked rows sit flush, each
 * with its tier letter in a column on its gradient, its tiles flush, its grip beside it and its
 * stack at the end.
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

/**
 * A brief light wash after a drop, on what moved (owner decision, 2026-11-14). Render it with a
 * new key for every drop, so it starts again. People who ask for less motion get none.
 */
const SettleWash: React.FC = () => <span aria-hidden="true" className="row-settle motion-reduce:hidden"/>;

const TierItems = memo<{
  tier: Tier;
  showLabels: boolean;
  onDeleteItem: (itemId: string) => void;
  /** Changes with every drop of this row's items (its stack): the items area washes briefly. */
  washKey?: number;
  /** After the items, inside the drop area: the tray's "Add images" tile. */
  trailing?: React.ReactNode;
  /** More classes for the drop area (the tray's). */
  className?: string;
}>(({tier, showLabels, onDeleteItem, washKey, trailing, className = ''}) => {
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
        className={`relative flex-1 min-w-0 min-h-16 md:min-h-20 compact:min-h-12 stage:min-h-(--stage-tile) flex flex-wrap content-start ${className} ${isDropTarget ? 'ring-2 ring-inset ring-ring/60' : ''}`}
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
        {washKey !== undefined && <SettleWash key={washKey}/>}
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
 * The Unranked tray (or Up next) in a frame layout: it gives way before the rows, down to its
 * least height, and scrolls (owner decisions, 2026-11-01). The frame and the cover never scroll
 * (components/ZenStage.tsx).
 * - 16:9 and 9:16 have a fixed height: from a 0% basis the tray starts at its least height and
 *   grows into the space under the rows. The rows give way only once the tray is at its least.
 * - The overlay's panel is as tall as its content, up to the frame: 0% then counts as the
 *   tray's content, and the tray shrinks a million times faster than the rows.
 */
const STAGE_TRAY_FLEX = 'stage:basis-[0%] stage:shrink-[1000000] stage-wide:grow stage-tall:grow';

/**
 * The tier letter's size: big for a letter or two, smaller for longer names, which wrap. Compact
 * tiles (the dense editor) take smaller letters; the frame layouts take theirs from the frame
 * (`--stage-letter`, lib/zen/layouts.ts).
 */
function rowLabelClass(name: string, labelPosition: LabelPosition): string {
  // A row without a name shows its position as a small hint, "Row 4": sized as a long name.
  const length = name.trim() ? Array.from(name.trim()).length : Infinity;
  const size = labelPosition === 'top' ? 'text-lg stage:text-[length:calc(var(--stage-letter)*0.4)]'
    : length <= 2 ? 'text-[1.625rem] sm:text-3xl compact:text-xl stage:text-(length:--stage-letter)'
      : length <= 5 ? 'text-lg sm:text-xl compact:text-[15px] stage:text-[length:calc(var(--stage-letter)*0.5)]'
        : 'text-sm stage:text-[length:calc(var(--stage-letter)*0.3)]';
  return `font-heading font-black leading-tight break-words ${size}`;
}

const TierRow = memo<{
  tier: Tier;
  /** The row's place on screen (during a row drag, in the preview): its colour and its "Row n" hint. */
  index: number;
  /** The row's place in the list, where a rename goes. */
  listIndex: number;
  tiersLength: number;
  labelPosition: LabelPosition;
  showLabels: boolean;
  onSaveLabel: (index: number, newText: string) => void;
  onDeleteItem: (itemId: string) => void;
}>(({tier, index, listIndex, tiersLength, labelPosition, showLabels, onSaveLabel, onDeleteItem}) => {
  const {ref, handleRef, isDragging, itemsWaiting, settled} = useTierRow({tierId: tier.id, index});
  const describedBy = useTierDragDescription();
  // After a drop, a brief wash on what moved: the row (its grip) or its items (its stack).
  const itemsWash = settled?.kind === 'stack' ? settled.count : undefined;
  // Colours belong to positions (owner decision, 2026-11-14): a row takes the colour of the place
  // it shows in, also while it is dragged, so the gap it would leave has that place's colour.
  const tierGradient = getTierGradient(index, tiersLength);
  // Accessible name for the row. A row without a name is named after its position, "Row 4",
  // which it also shows as a faint hint; the link never holds it.
  const tierLabel = rowLabel(tier.name, index);
  const label = (
    <EditableLabel
      text={tier.name}
      onSave={(newText) => onSaveLabel(listIndex, newText)}
      className={labelPosition === 'top'
        ? 'px-2 pt-1'
        : 'w-14 sm:w-24 compact:sm:w-22 stage:w-(--stage-letter-column) shrink-0 self-stretch flex items-center justify-center p-1 text-center'}
      contentClassName={rowLabelClass(tier.name, labelPosition)}
      as="h2"
      emptyHint={tierLabel}
    />
  );

  return (
    <div
      ref={ref}
      role="group"
      aria-label={tierLabel}
      data-tier-row=""
      data-lifted={isDragging || undefined}
      data-items-waiting={itemsWaiting || undefined}
      className={`relative w-full min-h-16 md:min-h-20 compact:min-h-12 stage:min-h-(--stage-tile) flex border-b border-black/10 dark:border-white/10 ${isDragging ? 'z-10' : ''}`}
      // A longhand: dnd-kit copies the row's style to the gap it leaves, and a var() in the
      // background shorthand would not copy.
      style={{backgroundImage: tierGradient || undefined, '--row-colour': getTierColour(index, tiersLength)} as React.CSSProperties}
    >
      {/* First, so Tab reaches it first in the row: grip, name, each item, stack. */}
      <RowGrip handleRef={handleRef} describedBy={describedBy} name={tier.name} index={index}/>
      {labelPosition === 'top' ? (
        <div className="flex-1 min-w-0 flex flex-col">
          {label}
          <TierItems tier={tier} showLabels={showLabels} onDeleteItem={onDeleteItem} washKey={itemsWash}/>
        </div>
      ) : (
        <div className={`flex-1 min-w-0 flex ${labelPosition === 'right' ? 'flex-row-reverse' : 'flex-row'}`}>
          {label}
          <TierItems tier={tier} showLabels={showLabels} onDeleteItem={onDeleteItem} washKey={itemsWash}/>
        </div>
      )}
      <RowStack tierId={tier.id} describedBy={describedBy} name={tier.name} index={index} count={tier.items.length}/>
      {settled?.kind === 'row' && <SettleWash key={settled.count}/>}
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
  /** In place of the items and the hints when the whole list is empty: the drop area. */
  emptyListArea?: React.ReactNode;
}>(({tier, listIndex, showLabels, onSaveLabel, onDeleteItem, addImagesTile, emptyListArea}) => {
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
    // fills the space under the rows, in the middle (the board "9:16 · Pick freely"). It takes
    // the space under the rows and its items scroll, so the frame keeps its size (owner
    // decisions, 2026-11-01): it gives way before the rows (STAGE_TRAY_FLEX).
    <section role="group" aria-label={tierLabel} className={`mt-4 w-full rounded-xl bg-muted p-3 flex flex-col gap-2 stage:mt-(--stage-gap) stage:rounded-none stage:bg-transparent stage:p-0 stage-tall:justify-center-safe ${STAGE_TRAY_FLEX} stage:min-h-[calc(var(--stage-tray-heading)*1.5+var(--u)*10+var(--stage-tile))] stage:gap-[calc(var(--u)*10)] stage:[--stage-tile:var(--stage-tray-tile)]`}>
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
        {!emptyListArea && <p className="hide-in-zen flex flex-wrap gap-x-1 text-sm text-muted-foreground" data-html2canvas-ignore>
          <span>Drag to reorder.</span>
          <FirstDragHint/>
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
          // In a frame the items scroll. In 9:16 they keep their own height, centred in the tray.
          className="stage:overflow-y-auto stage:overflow-x-hidden stage-tall:flex-[0_1_auto]"
        />
      )}
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
    // In a frame layout it takes the space under the rows and scrolls when it must (owner
    // decisions, 2026-11-01), as the Unranked tray does.
    <section role="group" aria-label={tierLabel} className={`mt-4 w-full rounded-xl bg-muted p-3 stage:mt-(--stage-gap) stage:rounded-none stage:bg-transparent stage:p-0 ${STAGE_TRAY_FLEX} stage:min-h-[calc(var(--stage-tray-heading)*1.5+var(--u)*10+var(--stage-hero))] stage:overflow-y-auto stage:overflow-x-hidden stage-tall:flex stage-tall:flex-col stage-tall:justify-center-safe`}>
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
  const {dragging} = useTierDragState();
  return (
    // data-dragging turns off the tile label blur during a drag and its drop animation
    // (app/globals.css), as scrolling does: hundreds of blurred layers made every frame of a
    // drag slow. The blur comes back once the item has landed: at the release, the labels'
    // transitions back to the blur made the drop animation slow.
    // In a frame layout the rows keep their size; only when they alone are taller than the frame
    // do they scroll inside it (owner decision, 2026-11-01).
    <div className="w-full stage:min-h-0 stage:overflow-y-auto stage:overflow-x-hidden" data-dragging={dragging || undefined}>
      {/* Each row's grip hangs off its left edge, in the page space beside the list: 24 px in a
          28 px gutter, a 44 px column on touch screens. Where the page leaves less space than that
          beside the list (phones, narrow windows), the rows move in by what is missing. In a frame
          layout the grip is a column inside the row (components/RowHandle.tsx). */}
      <div className="border-t border-black/10 dark:border-white/10 [--row-gutter:28px] pointer-coarse:[--row-gutter:44px] ml-[max(0px,calc(var(--row-gutter)-(100vw-100%)/2))] stage:ml-0">
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
  const {tiers, labelPosition, showLabels, moveItem, moveTier, moveRow, renameTier, deleteItem, restoreItem} = useTierContext();

  const listIsEmpty = tiers.every((tier) => tier.items.length === 0);

  const handleItemMove = useCallback((move: ItemMove) => moveItem(move.from, move.to), [moveItem]);
  const listIndexOf = useMemo(() => new Map(tiers.map((tier, index) => [tier.id, index])), [tiers]);
  // The grip moves the whole row (its name too); the stack moves only the items (the names stay).
  const handleRowMove = useCallback((move: RowMove) => moveRow(move.from, move.to), [moveRow]);
  const handleRowItemsMove = useCallback((move: RowMove) => moveTier(move.from, move.to), [moveTier]);

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
          restoreItem(deleted.item, deleted.tierId, deleted.index);
          toast('Item restored', {
            description: `${itemDisplayLabel(deleted.item)} has been restored.`,
          });
        },
      },
    });
  }, [deleteItem, restoreItem]);

  return (
    // Announcements name rows and items by their labels, never by internal ids.
    <TierDragDrop tiers={tiers} onItemMove={handleItemMove} onRowMove={handleRowMove} onRowItemsMove={handleRowItemsMove} itemLabel={itemDisplayLabel}>
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
