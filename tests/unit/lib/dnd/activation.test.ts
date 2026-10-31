import {describe, expect, it} from 'vitest';
import {
  activationRule,
  CONTEXT_MENU_LONG_PRESS_MS,
  gestureArmed,
  holdThenMoveGesture,
  holdThenMoveReducer,
  MOUSE_DRAG_DISTANCE,
  TOUCH_DRAG_DISTANCE,
  TOUCH_HOLD_MS,
  TOUCH_HOLD_TOLERANCE,
  type GestureEvent,
  type HoldThenMoveGesture,
} from '@/lib/dnd/activation';

describe('activationRule', () => {
  it('returns a distance rule of MOUSE_DRAG_DISTANCE when the pointer is a mouse or unknown', () => {
    expect(activationRule('mouse', 'item')).toEqual({kind: 'distance', distance: MOUSE_DRAG_DISTANCE});
    expect(activationRule('mouse', 'row')).toEqual({kind: 'distance', distance: MOUSE_DRAG_DISTANCE});
    expect(activationRule('', 'item')).toEqual({kind: 'distance', distance: MOUSE_DRAG_DISTANCE});
  });

  it('returns a holdThenMove rule ending at CONTEXT_MENU_LONG_PRESS_MS when touch or pen presses an item', () => {
    for (const pointer of ['touch', 'pen']) {
      expect(activationRule(pointer, 'item')).toEqual({
        kind: 'holdThenMove',
        holdMs: TOUCH_HOLD_MS,
        tolerance: TOUCH_HOLD_TOLERANCE,
        distance: TOUCH_DRAG_DISTANCE,
        giveUpMs: CONTEXT_MENU_LONG_PRESS_MS,
      });
    }
  });

  it('returns {kind: \'hold\', holdMs: TOUCH_HOLD_MS} when the pointer is touch or pen on a row handle', () => {
    expect(activationRule('touch', 'row')).toEqual({kind: 'hold', holdMs: TOUCH_HOLD_MS, tolerance: TOUCH_HOLD_TOLERANCE});
    expect(activationRule('pen', 'row')).toEqual({kind: 'hold', holdMs: TOUCH_HOLD_MS, tolerance: TOUCH_HOLD_TOLERANCE});
  });

  it('returns a TOUCH_HOLD_MS below CONTEXT_MENU_LONG_PRESS_MS when the constants are compared', () => {
    expect(TOUCH_HOLD_MS).toBeLessThan(CONTEXT_MENU_LONG_PRESS_MS);
  });
});

describe('holdThenMoveReducer', () => {
  const rule = {kind: 'holdThenMove', holdMs: 250, tolerance: 5, distance: 5, giveUpMs: 700} as const;

  /** Runs events through the reducer and returns every gesture on the way. */
  function run(events: GestureEvent[], from = holdThenMoveGesture(rule)): HoldThenMoveGesture[] {
    const gestures: HoldThenMoveGesture[] = [];
    events.reduce((gesture, event) => {
      const next = holdThenMoveReducer(gesture, event);
      gestures.push(next);
      return next;
    }, from);
    return gestures;
  }

  const down = (x: number, y: number, time: number): GestureEvent => ({type: 'down', x, y, time});
  const move = (x: number, y: number, time: number): GestureEvent => ({type: 'move', x, y, time});
  const end: GestureEvent = {type: 'end'};
  const states = (gestures: HoldThenMoveGesture[]) => gestures.map(gesture => gesture.state);

  it('returns state active when the pointer moves past distance after holdMs', () => {
    const gestures = run([down(100, 100, 1_000), move(102, 101, 1_100), move(103, 100, 1_300), move(106, 100, 1_310), move(200, 200, 1_400)]);
    expect(states(gestures)).toEqual(['pending', 'pending', 'pending', 'active', 'active']);
    expect(gestureArmed(gestures[1], 1_200)).toBe(false);
    expect(gestureArmed(gestures[1], 1_250)).toBe(true);
    expect(gestureArmed(gestures[3], 1_320)).toBe(false);
  });

  it('returns state aborted when the pointer moves past tolerance before holdMs ends', () => {
    const gestures = run([down(100, 100, 1_000), move(100, 108, 1_050), move(100, 120, 1_400)]);
    expect(states(gestures)).toEqual(['pending', 'aborted', 'aborted']);
    expect(gestureArmed(gestures[2], 1_400)).toBe(false);
  });

  it('returns state aborted when the pointer rests still for giveUpMs and then moves', () => {
    const [pressed, moved] = run([down(100, 100, 1_000), move(130, 100, 1_750)]);
    expect(gestureArmed(pressed, 1_699)).toBe(true);
    expect(gestureArmed(pressed, 1_700)).toBe(false);
    expect(moved.state).toBe('aborted');
  });

  it('returns state aborted with no start when the pointer lifts before holdMs ends', () => {
    const gestures = run([down(100, 100, 1_000), end, move(130, 100, 1_300)]);
    expect(states(gestures)).toEqual(['pending', 'aborted', 'aborted']);
    expect(gestures[1].start).toBeUndefined();
  });

  it('returns state active when the pointer lifts after the gesture became active', () => {
    const gestures = run([down(100, 100, 1_000), move(110, 100, 1_300), end]);
    expect(states(gestures)).toEqual(['pending', 'active', 'active']);
  });

  it('returns state pending with the new start when the next press comes', () => {
    const gestures = run([down(100, 100, 1_000), end, down(10, 10, 5_000), move(20, 10, 5_300)]);
    expect(states(gestures)).toEqual(['pending', 'aborted', 'pending', 'active']);
    expect(gestures[2].start).toEqual({x: 10, y: 10, time: 5_000});
  });

  it('returns the initial gesture, unarmed, when a move comes before any press', () => {
    const [gesture] = run([move(1, 1, 1)]);
    expect(gesture).toEqual({rule, state: 'pending'});
    expect(gestureArmed(gesture, 1_000)).toBe(false);
  });

  it('returns the same object when an event changes nothing, and plain new objects without mutating input', () => {
    const pressed = holdThenMoveReducer(holdThenMoveGesture(rule), down(100, 100, 1_000));
    const copy = structuredClone(pressed);
    const still = holdThenMoveReducer(pressed, move(101, 100, 1_100));
    expect(still).toBe(pressed);
    const active = holdThenMoveReducer(pressed, move(110, 100, 1_300));
    expect(active).not.toBe(pressed);
    expect(pressed).toEqual(copy);
    expect(Object.getPrototypeOf(active)).toBe(Object.prototype);
    expect(structuredClone(active)).toEqual(active);
    expect(holdThenMoveReducer(active, move(300, 300, 9_000))).toBe(active);
  });
});
