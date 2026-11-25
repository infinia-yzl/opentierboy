
/** Pixels the mouse moves with the button down before a drag starts. */
export const MOUSE_DRAG_DISTANCE = 5;
/** Milliseconds a finger holds still on an item or row handle before it can drag. */
export const TOUCH_HOLD_MS = 250;
/** Pixels a finger may drift during the hold. More than this scrolls instead. */
export const TOUCH_HOLD_TOLERANCE = 5;
/** Pixels a finger moves after the hold to start dragging an item. */
export const TOUCH_DRAG_DISTANCE = 5;
/** Radix ContextMenu opens its menu after a touch is held this long (its built-in value). */
export const CONTEXT_MENU_LONG_PRESS_MS = 700;

/** What is being pressed: an item tile, or the handle of a row. */
export type PressTarget = 'item' | 'row';

export type ActivationRule =
  /** Start once the pointer has moved `distance` pixels. */
  | {kind: 'distance'; distance: number}
  /** Start once the pointer has been held for `holdMs` without drifting more than `tolerance`. */
  | {kind: 'hold'; holdMs: number; tolerance: number}
  /**
   * Hold for `holdMs` without drifting more than `tolerance`, then start once the pointer
   * has moved `distance` pixels. No start once `giveUpMs` has passed (the menu opened).
   */
  | {kind: 'holdThenMove'; holdMs: number; tolerance: number; distance: number; giveUpMs: number};

/** The activation rule for a press. `pointerType` is PointerEvent.pointerType. */
export function activationRule(pointerType: string, target: PressTarget): ActivationRule {
  if (pointerType !== 'touch' && pointerType !== 'pen') return {kind: 'distance', distance: MOUSE_DRAG_DISTANCE};
  if (target === 'row') return {kind: 'hold', holdMs: TOUCH_HOLD_MS, tolerance: TOUCH_HOLD_TOLERANCE};
  return {
    kind: 'holdThenMove',
    holdMs: TOUCH_HOLD_MS,
    tolerance: TOUCH_HOLD_TOLERANCE,
    distance: TOUCH_DRAG_DISTANCE,
    giveUpMs: CONTEXT_MENU_LONG_PRESS_MS,
  };
}

export type HoldThenMoveRule = Extract<ActivationRule, {kind: 'holdThenMove'}>;

export type GestureState = 'pending' | 'active' | 'aborted';

/**
 * The hold-then-move gesture as plain data: its rule, its state, and where and when the press
 * started (no press yet: no `start`).
 */
export type HoldThenMoveGesture = Readonly<{
  rule: HoldThenMoveRule;
  state: GestureState;
  start?: Readonly<{x: number; y: number; time: number}>;
}>;

/**
 * What happens to the pointer. Times are milliseconds, for example PointerEvent.timeStamp.
 * `end` means the pointer was released or cancelled.
 */
export type GestureEvent =
  | Readonly<{type: 'down' | 'move'; x: number; y: number; time: number}>
  | Readonly<{type: 'end'}>;

/** A gesture before any press. */
export function holdThenMoveGesture(rule: HoldThenMoveRule): HoldThenMoveGesture {
  return {rule, state: 'pending'};
}

/**
 * The hold-then-move gesture as a pure state machine (a reducer): the gesture after an event.
 * No timers: the state only changes on events. Returns the same object when nothing changes.
 *
 * - `down` starts over at the pointer.
 * - `move` during the hold aborts once the pointer drifts more than `tolerance` (a scroll);
 *   after the hold it turns active once the pointer has moved `distance`; from `giveUpMs` on
 *   it aborts (the item menu opened).
 * - `end` aborts a pending gesture and forgets the press.
 */
export function holdThenMoveReducer(gesture: HoldThenMoveGesture, event: GestureEvent): HoldThenMoveGesture {
  switch (event.type) {
    case 'down':
      return {rule: gesture.rule, state: 'pending', start: {x: event.x, y: event.y, time: event.time}};
    case 'move': {
      const {rule, start} = gesture;
      if (gesture.state !== 'pending' || !start) return gesture;
      const held = event.time - start.time;
      const distance = Math.hypot(event.x - start.x, event.y - start.y);
      if (held >= rule.giveUpMs) return {...gesture, state: 'aborted'};
      if (held < rule.holdMs) return distance > rule.tolerance ? {...gesture, state: 'aborted'} : gesture;
      return distance >= rule.distance ? {...gesture, state: 'active'} : gesture;
    }
    case 'end':
      return {rule: gesture.rule, state: gesture.state === 'pending' ? 'aborted' : gesture.state};
  }
}

/**
 * Whether the hold has passed and the gesture can still start a drag, at `time`. While armed,
 * the page must not scroll on touch moves, or the browser takes the gesture for a scroll and
 * cancels the pointer.
 */
export function gestureArmed(gesture: HoldThenMoveGesture, time: number): boolean {
  if (gesture.state !== 'pending' || !gesture.start) return false;
  const held = time - gesture.start.time;
  return held >= gesture.rule.holdMs && held < gesture.rule.giveUpMs;
}
