'use client';

import React, {createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {CollisionPriority} from '@dnd-kit/abstract';
import {
  DragDropProvider,
  useDragDropManager,
  useDroppable,
  type DragDropManager,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/react';
import {useSortable} from '@dnd-kit/react/sortable';
import {
  accessibilityIds,
  createAnnouncements,
  createPlugins,
  createSensors,
  endedWithoutDrop,
  isKeyboardDrag,
  keyboardDirection,
  measureRows,
  moveDraggedToItsPlace,
  pauseAutoScroll,
  type AnnouncedDragReader,
} from './dndKit';
import {DND_TYPES, itemDndId, parseDndId, ROWS_GROUP, rowDndId, tierItemsDndId} from './ids';
import {keyboardItemTarget, keyboardRowTarget} from './keyboard';
import type {ItemLike, ItemMove, RowMove, TierLike} from './model';
import {findItem, moveItem} from './moves';
import {itemMoveFromPreview, moveRowInPreview, previewItemOver, previewRowOver, rowMoveFromPreview} from './preview';

/**
 * The React side of the drag and drop adapter. Components use these and never import dnd-kit.
 *
 *   <TierDragDrop tiers={tiers} onItemMove={...} onRowMove={...} itemLabel={...}>
 *     {(shownTiers) => shownTiers.map((tier, index) => <Row .../>)}
 *   </TierDragDrop>
 *
 * - useTierRow: a row, sortable by its handle.
 * - useTierItems: the item area of a row, which takes items over its free space (and when the
 *   row is empty).
 * - useTierItem: an item tile, sortable inside and between rows.
 *
 * The list changes only on drop (history is the undo, product rule 2). During a drag the rows
 * render a preview, a copy of the list that follows the pointer or the arrow keys
 * (lib/dnd/preview.ts). React draws every move; dnd-kit's optimistic sorting, which moves
 * elements behind React's back, is not used. On drop TierDragDrop calls onItemMove or
 * onRowMove once, and only when something moved, so a drop where the drag started adds no
 * history entry.
 */

/** No per-sortable dnd-kit plugins: no optimistic sorting (React draws the preview) and no sortable keyboard plugin (DragMoves). */
const NO_SORTABLE_PLUGINS: never[] = [];

interface Drag<T extends TierLike> {
  kind: 'item' | 'row';
  /** The app id of the dragged item or row (tier id). */
  id: string;
  /** The dnd-kit id of the dragged item or row. */
  dndId: string;
  /** The list when the drag started. */
  tiers: T[];
  keyboard: boolean;
}

interface Projection<T> {
  before: T[];
  next: T[];
}

interface TierDragDropState {
  /** aria-describedby for draggables: the hidden instructions. */
  describedBy: string;
  /** The tier id of the row that holds the dragged item in the preview, during an item drag. */
  itemTargetTierId: string | null;
  /** True during a row drag. */
  rowDrag: boolean;
}

const TierDragDropContext = createContext<TierDragDropState>({describedBy: '', itemTargetTierId: null, rowDrag: false});

export interface TierDragDropProps<T extends TierLike> {
  /** The list as the store holds it. */
  tiers: T[];
  /** One item moved (on drop, only when it moved). `to.index` counts the target row after the move. */
  onItemMove: (move: ItemMove) => void;
  /** One row moved (on drop, only when it moved). Apply it with reorderRows: the labels stay in place. */
  onRowMove: (move: RowMove) => void;
  /** The name screen readers hear for an item. Default: its `content`. */
  itemLabel?: (item: T['items'][number]) => string;
  /** Renders the rows: the list itself, or the preview during a drag. */
  children: (shownTiers: T[]) => React.ReactNode;
}

function labelled<T extends TierLike>(tiers: readonly T[], itemLabel?: (item: T['items'][number]) => string): TierLike[] {
  if (!itemLabel) return tiers as readonly TierLike[] as TierLike[];
  return tiers.map(tier => ({id: tier.id, name: tier.name, items: tier.items.map((item: ItemLike) => ({id: item.id, content: itemLabel(item)}))}));
}

type SessionProps<T extends TierLike> = Pick<TierDragDropProps<T>, 'tiers' | 'onItemMove' | 'onRowMove' | 'itemLabel'>;

/**
 * The state of one editor's drags, outside React's rendering: dnd-kit's event handlers and
 * announcements read and change it. A factory with closures (A47). TierDragDrop keeps the
 * preview to draw in React state; this keeps the newest one, which runs ahead of rendering
 * when events arrive faster than renders.
 */
function createDragSession<T extends TierLike>(id: string) {
  let props: SessionProps<T> = {tiers: [], onItemMove: () => {}, onRowMove: () => {}};
  let drag: Drag<T> | null = null;
  /** The newest preview. */
  let latest: T[] | null = null;
  /** The preview the page shows. Keyboard moves measure the page, so they wait until it is drawn. */
  let drawn: T[] | null = null;
  /** Set by a keyboard move: once drawn, the dragged element moves onto its new place. */
  let keyboardMoveManager: DragDropManager | null = null;
  let resumeAutoScroll: (() => void) | null = null;
  // The announcements and the handlers both need the preview an event leads to. They run one
  // after the other for the same event, in an order dnd-kit does not promise, so the first one
  // works it out and the second one reads it here.
  const projections = new WeakMap<object, Projection<T>>();

  const project = (type: 'over' | 'move', event: DragOverEvent | DragMoveEvent, manager: DragDropManager): Projection<T> | undefined => {
    const cached = projections.get(event);
    if (cached) return cached;
    if (!drag || event.operation.source?.id !== drag.dndId) return undefined;
    const before = latest ?? drag.tiers;
    let next = before;
    if (!drag.keyboard && (type === 'over' || drag.kind === 'item')) {
      // A pointer drag: a new target (dragover), or, for items, the pointer moving over the
      // same item (dragmove), since an item's place depends on the half of the item under the
      // pointer. A row takes the place of the row it moves onto, once per new target.
      const pointer = (type === 'move' ? (event as DragMoveEvent).to : undefined) ?? manager.dragOperation.position.current;
      next = projectPointer(drag, before, event.operation.target, pointer.x);
    } else if (drag.keyboard && type === 'move' && latest === drawn) {
      next = projectKey(drag, before, event as DragMoveEvent, manager);
    }
    const projection = {before, next};
    projections.set(event, projection);
    return projection;
  };

  const read: AnnouncedDragReader = (phase, event, manager, type) => {
    const {tiers, itemLabel} = props;
    if (phase === 'start') return {tiers: labelled(tiers, itemLabel), preview: labelled(tiers, itemLabel)};
    if (!drag || event.operation.source?.id !== drag.dndId) return undefined;
    if (phase !== 'over') return {tiers: labelled(drag.tiers, itemLabel), preview: labelled(latest ?? drag.tiers, itemLabel)};
    // Pointer moves are dragmove events too: they change nothing here, and cost next to nothing.
    const projection = project(type === 'dragmove' ? 'move' : 'over', event as DragOverEvent, manager);
    if (!projection || projection.next === projection.before) return undefined;
    return {tiers: labelled(drag.tiers, itemLabel), preview: labelled(projection.next, itemLabel)};
  };

  const stopAutoScrollPause = () => {
    resumeAutoScroll?.();
    resumeAutoScroll = null;
  };

  return Object.freeze({
    sensors: createSensors(),
    plugins: createPlugins(createAnnouncements(read), {id}),
    setProps(next: SessionProps<T>) {
      props = next;
    },
    /** A drag starts: returns what is dragged and the preview to show, or null when it is not ours. */
    start(event: DragStartEvent, manager: DragDropManager): {kind: Drag<T>['kind']; id: string; preview: T[]} | null {
      const parsed = parseDndId(event.operation.source?.id);
      if (parsed?.kind !== 'item' && parsed?.kind !== 'row') return null;
      const keyboard = isKeyboardDrag(manager);
      drag = {kind: parsed.kind, id: parsed.id, dndId: String(event.operation.source?.id), tiers: props.tiers, keyboard};
      latest = drawn = props.tiers;
      keyboardMoveManager = null;
      stopAutoScrollPause();
      if (keyboard) resumeAutoScroll = pauseAutoScroll(manager);
      return {kind: parsed.kind, id: parsed.id, preview: props.tiers};
    },
    /** A pointer drag moves over something: the new preview, or null when nothing changes. */
    over(event: DragOverEvent, manager: DragDropManager): T[] | null {
      const projection = project('over', event, manager);
      if (!projection || projection.next === projection.before) return null;
      latest = projection.next;
      return latest;
    },
    /**
     * The pointer moves, or an arrow key during a keyboard drag: the new preview, or null when
     * nothing changes.
     */
    move(event: DragMoveEvent, manager: DragDropManager): T[] | null {
      if (!drag) return null;
      if (drag.keyboard) {
        if (!keyboardDirection(event)) return null;
        // The adapter decides where an arrow key goes; dnd-kit's own small step must not happen.
        event.preventDefault();
      }
      const projection = project('move', event, manager);
      if (!projection || projection.next === projection.before) return null;
      latest = projection.next;
      if (drag.keyboard) keyboardMoveManager = manager;
      return latest;
    },
    /** The drag ends: on a drop that moved something, one onItemMove or onRowMove. */
    end(event: DragEndEvent, manager: DragDropManager): void {
      if (drag && latest && !endedWithoutDrop(event, manager)) {
        if (drag.kind === 'item') {
          const move = itemMoveFromPreview(props.tiers, latest, drag.id);
          if (move) props.onItemMove(move);
        } else {
          const move = rowMoveFromPreview(props.tiers, latest, drag.id);
          if (move) props.onRowMove(move);
        }
      }
      // `drag` and `latest` stay until the next drag: the drop announcement may read them after this.
      keyboardMoveManager = null;
      stopAutoScrollPause();
    },
    /** A preview was drawn. Returns the manager when the dragged element must move onto its new place. */
    drawn(preview: T[] | null): DragDropManager | null {
      drawn = preview;
      const manager = keyboardMoveManager;
      keyboardMoveManager = null;
      return preview ? manager : null;
    },
    dispose: stopAutoScrollPause,
  });
}

/** The drag and drop context of the editor: dnd-kit's provider, the preview and the announcements. */
export function TierDragDrop<T extends TierLike>({tiers, onItemMove, onRowMove, itemLabel, children}: TierDragDropProps<T>) {
  const [preview, setPreview] = useState<T[] | null>(null);
  const [active, setActive] = useState<{kind: Drag<T>['kind']; id: string} | null>(null);
  const idPrefix = useId();
  const [session] = useState(() => createDragSession<T>(idPrefix));

  useLayoutEffect(() => {
    session.setProps({tiers, onItemMove, onRowMove, itemLabel});
  });

  const handleDragStart = (event: DragStartEvent, manager: DragDropManager) => {
    const started = session.start(event, manager);
    if (!started) return;
    setPreview(started.preview);
    setActive({kind: started.kind, id: started.id});
  };

  const handleDragOver = (event: DragOverEvent, manager: DragDropManager) => {
    const next = session.over(event, manager);
    if (next) setPreview(next);
  };

  const handleDragEnd = (event: DragEndEvent, manager: DragDropManager) => {
    session.end(event, manager);
    setPreview(null);
    setActive(null);
  };

  const handleDragMove = (event: DragMoveEvent, manager: DragDropManager) => {
    const next = session.move(event, manager);
    if (next) setPreview(next);
  };

  // A keyboard move, once drawn: the dragged element goes onto its new place. dnd-kit moves its
  // placeholder next to the dragged element after React's changes, and reads the page in
  // animation frames, so this waits for the next one.
  useLayoutEffect(() => {
    const manager = session.drawn(preview);
    if (!manager) return;
    const frame = requestAnimationFrame(() => moveDraggedToItsPlace(manager));
    return () => cancelAnimationFrame(frame);
  }, [session, preview]);

  useEffect(() => session.dispose, [session]);

  const shown = preview ?? tiers;
  const itemTargetTierId = useMemo(
    () => (active?.kind === 'item' && preview ? findItem(preview, active.id)?.tierId ?? null : null),
    [active, preview],
  );
  const state = useMemo<TierDragDropState>(() => ({
    describedBy: accessibilityIds(idPrefix).description,
    itemTargetTierId,
    rowDrag: active?.kind === 'row',
  }), [idPrefix, itemTargetTierId, active]);

  return (
    <TierDragDropContext.Provider value={state}>
      <DragDropProvider
        sensors={session.sensors}
        plugins={session.plugins}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <DragMoves onMove={handleDragMove}/>
        {children(shown)}
      </DragDropProvider>
    </TierDragDropContext.Provider>
  );
}

/**
 * Listens to dragmove events: arrow keys, and pointer moves within one item. A separate
 * listener, because a DragDropProvider handler for dragmove would start a React transition
 * on every pointer move, even when nothing changes.
 */
function DragMoves({onMove}: {onMove: (event: DragMoveEvent, manager: DragDropManager) => void}) {
  const manager = useDragDropManager();
  const handler = useRef(onMove);
  useLayoutEffect(() => {
    handler.current = onMove;
  });
  useEffect(() => {
    if (!manager) return;
    return manager.monitor.addEventListener('dragmove', (event, eventManager) => handler.current(event, eventManager));
  }, [manager]);
  return null;
}

/** Where a pointer drag goes, over the drop target, with the pointer at `pointerX`. */
function projectPointer<T extends TierLike>(drag: Drag<T>, before: T[], target: DragOverEvent['operation']['target'], pointerX: number): T[] {
  const over = parseDndId(target?.id);
  if (!target || !over) return before;
  if (drag.kind === 'row') return over.kind === 'row' ? previewRowOver(before, drag.id, over.id) : before;
  if (over.kind === 'tier') return previewItemOver(before, drag.id, {kind: 'tier', tierId: over.id});
  if (over.kind !== 'item' || over.id === drag.id) return before;
  // Before or after the item, by the half of it under the pointer, as the page shows it now.
  const box = target.element?.getBoundingClientRect();
  const centre = box ? box.left + box.width / 2 : target.shape?.center.x;
  const after = centre !== undefined && pointerX > centre;
  return previewItemOver(before, drag.id, {kind: 'item', itemId: over.id, after});
}

/** Where an arrow key moves the dragged item or row (a keyboard dragmove event). */
function projectKey<T extends TierLike>(drag: Drag<T>, before: T[], event: DragMoveEvent, manager: DragDropManager): T[] {
  const direction = keyboardDirection(event);
  if (!direction) return before;
  if (drag.kind === 'row') {
    const from = before.findIndex(tier => tier.id === drag.id);
    const to = keyboardRowTarget(from, direction, before.length);
    return to === null ? before : moveRowInPreview(before, from, to);
  }
  const from = findItem(before, drag.id);
  const to = keyboardItemTarget(measureRows(manager, before), drag.id, direction);
  return from && to ? moveItem(before, from, to) : before;
}

/** A tier row, sortable by its handle. Put `ref` on the row and `handleRef` on its handle. */
export function useTierRow({tierId, index}: {tierId: string; index: number}) {
  const {ref, handleRef, isDragging} = useSortable({
    id: rowDndId(tierId),
    index,
    group: ROWS_GROUP,
    type: DND_TYPES.row,
    accept: DND_TYPES.row,
    plugins: NO_SORTABLE_PLUGINS,
  });
  return {ref, handleRef, isDragging};
}

/**
 * The item area of a row: it takes items dragged over its free space, and over an empty row.
 * Items on it come first (low collision priority). `isDropTarget` is true while the dragged
 * item would land in this row.
 */
export function useTierItems({tierId}: {tierId: string}) {
  const {ref} = useDroppable({
    id: tierItemsDndId(tierId),
    accept: DND_TYPES.item,
    collisionPriority: CollisionPriority.Low,
  });
  const {itemTargetTierId} = useContext(TierDragDropContext);
  return {ref, isDropTarget: itemTargetTierId === tierId};
}

/**
 * An item tile, sortable inside its row and between rows. Put `ref` on the tile and
 * `describedBy` in its aria-describedby (the keyboard instructions).
 */
export function useTierItem({itemId, tierId, index}: {itemId: string; tierId: string; index: number}) {
  const {ref, isDragging, isDropping} = useSortable({
    id: itemDndId(itemId),
    index,
    group: tierItemsDndId(tierId),
    type: DND_TYPES.item,
    accept: DND_TYPES.item,
    plugins: NO_SORTABLE_PLUGINS,
  });
  const {describedBy} = useContext(TierDragDropContext);
  return {ref, isDragging, isDropping, describedBy};
}

/** The row handle's and the list's drag state: `describedBy` for the handle, `rowDrag` during a row drag. */
export function useTierDragState() {
  const {describedBy, rowDrag} = useContext(TierDragDropContext);
  return {describedBy, rowDrag};
}
