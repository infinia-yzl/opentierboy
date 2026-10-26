import {ActivationConstraint, configure, type ActivationConstraints, type Plugins} from '@dnd-kit/abstract';
import {
  Accessibility,
  Feedback,
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
  Scroller,
  type DragDropManager,
  type DragEndEvent,
  type DropAnimationOptions,
} from '@dnd-kit/dom';
import {DOMRectangle, isKeyboardEvent, scrollIntoViewIfNeeded} from '@dnd-kit/dom/utilities';
import {
  activationRule,
  gestureArmed,
  holdThenMoveGesture,
  holdThenMoveReducer,
  type ActivationRule,
  type HoldThenMoveGesture,
  type HoldThenMoveRule,
} from './activation';
import {previewAnnouncement, SCREEN_READER_INSTRUCTIONS, type DragPhase} from './announcements';
import {itemDndId, parseDndId, tierItemsDndId} from './ids';
import type {LayoutRow} from './keyboard';
import type {Direction, TierLike} from './model';

/**
 * dnd-kit settings for the tier list: sensors, activation, announcements, the drop animation,
 * and the page measurements for keyboard moves. lib/dnd is the only place that imports dnd-kit
 * (ESLint enforces it); in lib/dnd only this file and the React hooks in react.tsx do. The
 * other files are pure and need no DOM.
 *
 * Nothing here runs at import time, so importing it on the server is safe. react.tsx passes
 * these to @dnd-kit/react's <DragDropProvider sensors={...} plugins={...}>.
 */

/** The drop animation: the same duration and curve as the editor's drop today. */
export const DROP_ANIMATION: DropAnimationOptions = {duration: 300, easing: 'cubic-bezier(0.2, 0, 0, 1)'};

/**
 * dnd-kit activation constraint for touch and pen presses on an item: hold still, then move
 * (see lib/dnd/activation.ts). While the hold has passed and the drag has not started, it
 * stops touch moves from scrolling the page, so the browser does not cancel the pointer.
 *
 * The one class in our code (A47, `ALLOWED_CLASS_FILES` in eslint.config.mjs): dnd-kit's
 * ActivationConstraint API requires a subclass. Sensors call `onEvent` and `abort` on it, and
 * the base class keeps its controller in a private class field (`#controller`), which only a
 * real subclass instance has. The gesture itself is the pure reducer `holdThenMoveReducer`;
 * this class only feeds it pointer events and acts on the result.
 */
export class HoldThenMoveConstraint extends ActivationConstraint<PointerEvent, HoldThenMoveRule> {
  #gesture: HoldThenMoveGesture;
  #stopBlockingScroll: (() => void) | undefined;

  constructor(rule: HoldThenMoveRule) {
    super(rule);
    this.#gesture = holdThenMoveGesture(rule);
  }

  onEvent(event: PointerEvent): void {
    switch (event.type) {
      case 'pointerdown':
        this.#cleanup();
        this.#gesture = holdThenMoveReducer(this.#gesture, {type: 'down', x: event.clientX, y: event.clientY, time: event.timeStamp});
        this.#listen(event.target);
        break;
      case 'pointermove': {
        this.#gesture = holdThenMoveReducer(this.#gesture, {type: 'move', x: event.clientX, y: event.clientY, time: event.timeStamp});
        if (this.#gesture.state === 'active') {
          // From here dnd-kit's PointerSensor blocks touch scrolling itself.
          this.#cleanup();
          this.activate(event);
        } else if (this.#gesture.state === 'aborted') {
          this.#cleanup();
        }
        break;
      }
      case 'pointerup':
      case 'pointercancel':
        this.abort();
        break;
    }
  }

  abort(): void {
    this.#gesture = holdThenMoveReducer(this.#gesture, {type: 'end'});
    this.#cleanup();
  }

  /**
   * While the press lasts: stops touch scrolling once armed, and gives up when the item menu
   * opens. Browsers that open a context menu on a long press (Chrome on Android, after about
   * 500 ms) can do so before CONTEXT_MENU_LONG_PRESS_MS; then no drag may start.
   */
  #listen(target: EventTarget | null): void {
    if (!target || typeof target.addEventListener !== 'function') return;
    const blockScroll = (event: Event) => {
      if (gestureArmed(this.#gesture, event.timeStamp)) event.preventDefault();
    };
    const menuOpened = () => {
      this.#gesture = holdThenMoveReducer(this.#gesture, {type: 'end'});
    };
    // Not passive, so preventDefault() can stop the scroll.
    target.addEventListener('touchmove', blockScroll, {passive: false});
    target.addEventListener('contextmenu', menuOpened);
    this.#stopBlockingScroll = () => {
      target.removeEventListener('touchmove', blockScroll);
      target.removeEventListener('contextmenu', menuOpened);
    };
  }

  #cleanup(): void {
    this.#stopBlockingScroll?.();
    this.#stopBlockingScroll = undefined;
  }
}

/** dnd-kit constraints for an activation rule. */
export function activationConstraintsFor(rule: ActivationRule): ActivationConstraints<PointerEvent> {
  switch (rule.kind) {
    case 'distance':
      return [new PointerActivationConstraints.Distance({value: rule.distance})];
    case 'hold':
      return [new PointerActivationConstraints.Delay({value: rule.holdMs, tolerance: rule.tolerance})];
    case 'holdThenMove':
      return [new HoldThenMoveConstraint(rule)];
  }
}

/** The pointer sensor: rows (by their handle) and items follow lib/dnd/activation.ts. */
export function createPointerSensor() {
  return PointerSensor.configure({
    activationConstraints(event, source) {
      const target = parseDndId(source.id)?.kind === 'row' ? 'row' : 'item';
      return activationConstraintsFor(activationRule(event.pointerType, target));
    },
  });
}

/** Sensors for <DragDropProvider sensors>: pointer (mouse, touch, pen) and keyboard. */
export function createSensors() {
  return [createPointerSensor(), KeyboardSensor];
}

type AccessibilityOptions = NonNullable<ConstructorParameters<typeof Accessibility>[1]>;
type Announcements = NonNullable<AccessibilityOptions['announcements']>;
type AnnouncedEvent = Parameters<Announcements['dragstart']>[0] | Parameters<NonNullable<Announcements['dragover']>>[0]
  | Parameters<NonNullable<Announcements['dragmove']>>[0] | Parameters<Announcements['dragend']>[0];

/** What an announcement reads: the list from the start of the drag, and the list as the drag shows it now. */
export interface AnnouncedDrag {
  tiers: readonly TierLike[];
  preview: readonly TierLike[];
}

/** The dnd-kit events that get an announcement. */
export type AnnouncedEventType = 'dragstart' | 'dragmove' | 'dragover' | 'dragend';

/**
 * Reads the drag for one event. `phase` is the moment ('over' for dragover and dragmove).
 * Returns undefined when the event changes nothing on screen: then nothing is announced.
 */
export type AnnouncedDragReader = (
  phase: DragPhase,
  event: AnnouncedEvent,
  manager: DragDropManager,
  type: AnnouncedEventType,
) => AnnouncedDrag | undefined;

/**
 * True when a drag ends without a drop: cancelled (Escape), or a pointer drag released over
 * nothing that takes it. The list then stays as it was, as with the editor's drag and drop
 * before. A keyboard drag always drops where the keys moved it.
 */
export function endedWithoutDrop(event: Pick<DragEndEvent, 'canceled' | 'operation'>, manager: DragDropManager): boolean {
  if (event.canceled) return true;
  if (isKeyboardDrag(manager)) return false;
  return !event.operation.target;
}

/**
 * Announcements for dnd-kit's Accessibility plugin. Texts come from lib/dnd/announcements.ts,
 * with the positions of the preview (the list as the drag shows it, lib/dnd/preview.ts).
 * Keyboard moves are dragmove events; pointer moves are dragover events.
 */
export function createAnnouncements(read: AnnouncedDragReader): Announcements {
  const announce = (phase: DragPhase, event: AnnouncedEvent, manager: DragDropManager, type: AnnouncedEventType) => {
    const drag = read(phase, event, manager, type);
    return drag && previewAnnouncement(phase, drag.tiers, drag.preview, event.operation.source?.id);
  };
  return {
    dragstart: (event, manager) => announce('start', event, manager, 'dragstart'),
    dragmove: (event, manager) => announce('over', event, manager, 'dragmove'),
    dragover: (event, manager) => announce('over', event, manager, 'dragover'),
    dragend: (event, manager) => announce(endedWithoutDrop(event, manager) ? 'cancel' : 'drop', event, manager, 'dragend'),
  };
}

/** The ids of the hidden instructions (for aria-describedby) and of the live region of one editor. */
export function accessibilityIds(id: string): {description: string; announcement: string} {
  return {description: `dnd-kit-description-${id}`, announcement: `dnd-kit-announcement-${id}`};
}

/**
 * Plugins for <DragDropProvider plugins>: dnd-kit's defaults (auto-scroll, cursor, text
 * selection guard...), with the Accessibility plugin speaking tier labels and the Feedback
 * plugin using DROP_ANIMATION. dnd-kit skips the drop animation when the user prefers
 * reduced motion. `id` names the instructions and the live region (accessibilityIds).
 */
export function createPlugins(announcements: Announcements, {id}: {id?: string} = {}) {
  return (defaults: Plugins<DragDropManager>): Plugins<DragDropManager> => [
    ...defaults.filter(entry => {
      const plugin = 'plugin' in entry ? entry.plugin : entry;
      return plugin !== Accessibility && plugin !== Feedback;
    }),
    configure(Accessibility, {
      ...(id !== undefined && {id}),
      announcements,
      screenReaderInstructions: {draggable: SCREEN_READER_INSTRUCTIONS},
    }),
    configure(Feedback, {dropAnimation: DROP_ANIMATION}),
  ];
}

/** True while the drag in progress was started with the keyboard. */
export function isKeyboardDrag(manager: DragDropManager): boolean {
  return isKeyboardEvent(manager.dragOperation.activatorEvent);
}

/**
 * The arrow direction of a keyboard move: dnd-kit's KeyboardSensor moves by a few pixels
 * (`by` of the dragmove event) in the arrow's direction. Null for anything else.
 */
export function keyboardDirection(event: {by?: {x: number; y: number}; nativeEvent?: Event}): Direction | null {
  if (!isKeyboardEvent(event.nativeEvent) || !event.by) return null;
  const {x, y} = event.by;
  if (x > 0) return 'right';
  if (x < 0) return 'left';
  if (y > 0) return 'down';
  if (y < 0) return 'up';
  return null;
}

/**
 * Stops dnd-kit's auto-scrolling for a keyboard drag (the moves scroll the item into view
 * themselves, as dnd-kit's own keyboard plugin does). Returns the function that turns it on
 * again.
 */
export function pauseAutoScroll(manager: DragDropManager): () => void {
  const scroller = manager.registry.plugins.get(Scroller);
  if (!scroller || scroller.disabled) return () => {};
  scroller.disable();
  return () => scroller.enable();
}

/** A layout box without transforms (dnd-kit moves tiles with animated translations). */
function layoutBox(element: Element) {
  const {left, top, width, height} = new DOMRectangle(element, {ignoreTransforms: true});
  return {left, top, width, height};
}

/** The inner width of an element: its content box, where its tiles wrap. */
function contentWidth(element: Element): number | undefined {
  const view = element.ownerDocument.defaultView;
  if (!view) return undefined;
  const style = view.getComputedStyle(element);
  return element.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
}

/**
 * Measures the rows as the page shows them, for keyboardItemTarget: each item's box (the
 * dragged item's place is its placeholder, which dnd-kit leaves in the row) and the width of
 * each row's item area. Items without an element are left out.
 */
export function measureRows(manager: DragDropManager, tiers: readonly TierLike[]): LayoutRow[] {
  const elementOf = (dndId: string) => manager.registry.droppables.get(dndId)?.element;
  return tiers.map(tier => {
    const items = tier.items.flatMap(item => {
      const element = elementOf(itemDndId(item.id));
      return element ? [{id: item.id, box: layoutBox(element)}] : [];
    });
    const area = elementOf(tierItemsDndId(tier.id));
    const width = area ? contentWidth(area) : undefined;
    return {tierId: tier.id, items, ...(width !== undefined && {width})};
  });
}

/**
 * After a keyboard move has been drawn: brings the dragged element onto its new place (its
 * placeholder) and scrolls that place into view, as dnd-kit's own keyboard plugin does.
 */
export function moveDraggedToItsPlace(manager: DragDropManager): void {
  const {source, shape, status} = manager.dragOperation;
  if (!source || !shape || !status.dragging) return;
  const place = manager.registry.droppables.get(source.id)?.element;
  if (!place) return;
  scrollIntoViewIfNeeded(place);
  const target = new DOMRectangle(place);
  const current = shape.current.boundingRectangle;
  const by = {x: target.left - current.left, y: target.top - current.top};
  if (by.x || by.y) manager.actions.move({by});
}
