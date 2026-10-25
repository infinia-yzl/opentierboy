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
  it('starts mouse drags after a short move, as the editor does today', () => {
    expect(activationRule('mouse', 'item')).toEqual({kind: 'distance', distance: MOUSE_DRAG_DISTANCE});
    expect(activationRule('mouse', 'row')).toEqual({kind: 'distance', distance: MOUSE_DRAG_DISTANCE});
    expect(activationRule('', 'item')).toEqual({kind: 'distance', distance: MOUSE_DRAG_DISTANCE});
  });

  it('uses hold, then move for touch and pen on items, giving up when the item menu opens', () => {
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

  it('uses a plain hold for touch and pen on row handles', () => {
    expect(activationRule('touch', 'row')).toEqual({kind: 'hold', holdMs: TOUCH_HOLD_MS, tolerance: TOUCH_HOLD_TOLERANCE});
    expect(activationRule('pen', 'row')).toEqual({kind: 'hold', holdMs: TOUCH_HOLD_MS, tolerance: TOUCH_HOLD_TOLERANCE});
  });

  it('lets the drag start before the long-press menu opens', () => {
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

  it('starts when the finger moves after holding still', () => {
    const gestures = run([down(100, 100, 1_000), move(102, 101, 1_100), move(103, 100, 1_300), move(106, 100, 1_310), move(200, 200, 1_400)]);
    expect(states(gestures)).toEqual(['pending', 'pending', 'pending', 'active', 'active']);
    expect(gestureArmed(gestures[1], 1_200)).toBe(false);
    expect(gestureArmed(gestures[1], 1_250)).toBe(true);
    expect(gestureArmed(gestures[3], 1_320)).toBe(false);
  });

  it('gives way to scrolling when the finger moves during the hold', () => {
    const gestures = run([down(100, 100, 1_000), move(100, 108, 1_050), move(100, 120, 1_400)]);
    expect(states(gestures)).toEqual(['pending', 'aborted', 'aborted']);
    expect(gestureArmed(gestures[2], 1_400)).toBe(false);
  });

  it('gives way to the item menu when the finger holds still for the long press', () => {
    const [pressed, moved] = run([down(100, 100, 1_000), move(130, 100, 1_750)]);
    expect(gestureArmed(pressed, 1_699)).toBe(true);
    expect(gestureArmed(pressed, 1_700)).toBe(false);
    expect(moved.state).toBe('aborted');
  });

  it('ends without a drag when the finger lifts', () => {
    const gestures = run([down(100, 100, 1_000), end, move(130, 100, 1_300)]);
    expect(states(gestures)).toEqual(['pending', 'aborted', 'aborted']);
    expect(gestures[1].start).toBeUndefined();
  });

  it('keeps an active gesture active when the finger lifts', () => {
    const gestures = run([down(100, 100, 1_000), move(110, 100, 1_300), end]);
    expect(states(gestures)).toEqual(['pending', 'active', 'active']);
  });

  it('starts over on the next press', () => {
    const gestures = run([down(100, 100, 1_000), end, down(10, 10, 5_000), move(20, 10, 5_300)]);
    expect(states(gestures)).toEqual(['pending', 'aborted', 'pending', 'active']);
    expect(gestures[2].start).toEqual({x: 10, y: 10, time: 5_000});
  });

  it('does nothing before a press', () => {
    const [gesture] = run([move(1, 1, 1)]);
    expect(gesture).toEqual({rule, state: 'pending'});
    expect(gestureArmed(gesture, 1_000)).toBe(false);
  });

  it('is pure: plain data in and out, the input never changes, and no change returns the same object', () => {
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
