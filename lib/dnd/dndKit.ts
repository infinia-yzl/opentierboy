import {ActivationConstraint, configure, type ActivationConstraints, type Plugins} from '@dnd-kit/abstract';
import {
  Accessibility,
  Feedback,
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
  type DragDropManager,
  type DropAnimationOptions,
} from '@dnd-kit/dom';
import {
  activationRule,
  gestureArmed,
  holdThenMoveGesture,
  holdThenMoveReducer,
  type ActivationRule,
  type HoldThenMoveGesture,
  type HoldThenMoveRule,
} from './activation';
import {SCREEN_READER_INSTRUCTIONS, sortableAnnouncement, type DragPhase} from './announcements';
import {parseDndId} from './ids';
import type {TierLike} from './model';
import {toSortableSnapshot} from './sortable';

/**
 * dnd-kit settings for the tier list: sensors, activation, announcements and the drop
 * animation. lib/dnd is the only place that imports dnd-kit (ESLint enforces it), and in
 * lib/dnd only this file does; the other files are pure and need no DOM.
 *
 * Nothing here runs at import time, so importing it on the server is safe. The objects are
 * meant for @dnd-kit/react's <DragDropProvider sensors={...} plugins={...}> in the wiring
 * step (docs/dnd-fork.md).
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
        this.#blockScrollWhileArmed(event.target);
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

  #blockScrollWhileArmed(target: EventTarget | null): void {
    if (!target || typeof target.addEventListener !== 'function') return;
    const listener = (event: Event) => {
      if (gestureArmed(this.#gesture, event.timeStamp)) event.preventDefault();
    };
    // Not passive, so preventDefault() can stop the scroll.
    target.addEventListener('touchmove', listener, {passive: false});
    this.#stopBlockingScroll = () => target.removeEventListener('touchmove', listener);
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

/**
 * Announcements for dnd-kit's Accessibility plugin. `getTiers` returns the list as shown
 * (unchanged during a drag). Texts come from lib/dnd/announcements.ts.
 */
export function createAnnouncements(getTiers: () => readonly TierLike[]): Announcements {
  const announce = (phase: DragPhase, source: unknown) => {
    const snapshot = toSortableSnapshot(source);
    return snapshot ? sortableAnnouncement(phase, getTiers(), snapshot) : undefined;
  };
  return {
    dragstart: ({operation}) => announce('start', operation.source),
    dragover: ({operation}) => announce('over', operation.source),
    dragend: ({operation, canceled}) => announce(canceled ? 'cancel' : 'drop', operation.source),
  };
}

/**
 * Plugins for <DragDropProvider plugins>: dnd-kit's defaults (auto-scroll, cursor, text
 * selection guard...), with the Accessibility plugin speaking tier labels and the Feedback
 * plugin using DROP_ANIMATION. dnd-kit skips the drop animation when the user prefers
 * reduced motion.
 */
export function createPlugins(getTiers: () => readonly TierLike[]) {
  return (defaults: Plugins<DragDropManager>): Plugins<DragDropManager> => [
    ...defaults.filter(entry => {
      const plugin = 'plugin' in entry ? entry.plugin : entry;
      return plugin !== Accessibility && plugin !== Feedback;
    }),
    configure(Accessibility, {
      announcements: createAnnouncements(getTiers),
      screenReaderInstructions: {draggable: SCREEN_READER_INSTRUCTIONS},
    }),
    configure(Feedback, {dropAnimation: DROP_ANIMATION}),
  ];
}
