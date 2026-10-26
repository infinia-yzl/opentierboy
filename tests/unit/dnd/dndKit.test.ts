import type {ComponentProps} from 'react';
import {ActivationController} from '@dnd-kit/abstract';
import {
  Accessibility,
  AutoScroller,
  defaultPreset,
  DragDropManager,
  Feedback,
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
  type Draggable,
} from '@dnd-kit/dom';
import type {DragDropProvider} from '@dnd-kit/react';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  accessibilityIds,
  activationConstraintsFor,
  createAnnouncements,
  createPlugins,
  createPointerSensor,
  createSensors,
  DROP_ANIMATION,
  endedWithoutDrop,
  HoldThenMoveConstraint,
  isKeyboardDrag,
  keyboardDirection,
} from '@/lib/dnd/dndKit';
import {activationRule} from '@/lib/dnd/activation';

const tiers = [
  {id: 'tier-s', name: 'S', items: [{id: 'm', content: 'Mauga'}]},
  {id: 'uncategorized', name: '', items: [{id: 'w', content: 'Winston'}]},
];

const holdThenMove = {kind: 'holdThenMove', holdMs: 250, tolerance: 5, distance: 5, giveUpMs: 700} as const;

function pointer(type: string, x: number, y: number, timeStamp: number, target: EventTarget | null = null): PointerEvent {
  return {type, clientX: x, clientY: y, timeStamp, target} as unknown as PointerEvent;
}

function touchMove(target: EventTarget): boolean {
  const event = new Event('touchmove', {cancelable: true});
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('HoldThenMoveConstraint (dnd-kit activation)', () => {
  it('activates dnd-kit once the finger moves after the hold', () => {
    const activated: PointerEvent[] = [];
    const controller = new ActivationController([new HoldThenMoveConstraint(holdThenMove)], event => activated.push(event));
    controller.onEvent(pointer('pointerdown', 100, 100, 1_000));
    controller.onEvent(pointer('pointermove', 101, 100, 1_100));
    controller.onEvent(pointer('pointermove', 101, 100, 1_260));
    expect(activated).toHaveLength(0);
    const move = pointer('pointermove', 110, 100, 1_300);
    controller.onEvent(move);
    expect(activated).toEqual([move]);
    expect(controller.activated).toBe(true);
  });

  it('never activates when the finger moves during the hold (a scroll)', () => {
    const activated: PointerEvent[] = [];
    const controller = new ActivationController([new HoldThenMoveConstraint(holdThenMove)], event => activated.push(event));
    controller.onEvent(pointer('pointerdown', 100, 100, 1_000));
    controller.onEvent(pointer('pointermove', 100, 120, 1_050));
    controller.onEvent(pointer('pointermove', 100, 160, 1_400));
    expect(activated).toHaveLength(0);
  });

  it('never activates after the long-press menu opened', () => {
    const activated: PointerEvent[] = [];
    const controller = new ActivationController([new HoldThenMoveConstraint(holdThenMove)], event => activated.push(event));
    controller.onEvent(pointer('pointerdown', 100, 100, 1_000));
    controller.onEvent(pointer('pointermove', 140, 100, 1_800));
    expect(activated).toHaveLength(0);
  });

  it('stops touch scrolling only while armed, and lets go once the drag starts', () => {
    const now = performance.now();
    const target = new EventTarget();
    const constraint = new HoldThenMoveConstraint(holdThenMove);
    const controller = new ActivationController([constraint], () => {});

    controller.onEvent(pointer('pointerdown', 100, 100, now, target));
    expect(touchMove(target), 'during the hold the page scrolls').toBe(false);

    const armed = new HoldThenMoveConstraint(holdThenMove);
    const armedController = new ActivationController([armed], () => {});
    const armedTarget = new EventTarget();
    armedController.onEvent(pointer('pointerdown', 100, 100, now - 300, armedTarget));
    expect(touchMove(armedTarget), 'after the hold the page does not scroll').toBe(true);
    armedController.onEvent(pointer('pointermove', 120, 100, now - 300 + 260, armedTarget));
    expect(armedController.activated).toBe(true);
    expect(touchMove(armedTarget), 'dnd-kit blocks scrolling itself once dragging').toBe(false);
  });

  it('never activates once the item menu opened, even before the long press time (Chrome on Android)', () => {
    const now = performance.now();
    const target = new EventTarget();
    const activated: PointerEvent[] = [];
    const controller = new ActivationController([new HoldThenMoveConstraint(holdThenMove)], event => activated.push(event));
    controller.onEvent(pointer('pointerdown', 100, 100, now - 500, target));
    target.dispatchEvent(new Event('contextmenu'));
    expect(touchMove(target), 'the page may scroll again').toBe(false);
    controller.onEvent(pointer('pointermove', 130, 100, now - 500 + 520, target));
    expect(activated).toHaveLength(0);
  });

  it('removes its touch listener when the press is aborted', () => {
    const target = new EventTarget();
    const controller = new ActivationController([new HoldThenMoveConstraint(holdThenMove)], () => {});
    controller.onEvent(pointer('pointerdown', 100, 100, performance.now() - 300, target));
    controller.abort();
    expect(touchMove(target)).toBe(false);
  });
});

describe('sensors', () => {
  it('turns activation rules into dnd-kit constraints', () => {
    expect(activationConstraintsFor(activationRule('mouse', 'item'))[0]).toBeInstanceOf(PointerActivationConstraints.Distance);
    expect(activationConstraintsFor(activationRule('touch', 'row'))[0]).toBeInstanceOf(PointerActivationConstraints.Delay);
    expect(activationConstraintsFor(activationRule('touch', 'item'))[0]).toBeInstanceOf(HoldThenMoveConstraint);
  });

  it('chooses constraints by pointer type and by what is pressed', () => {
    const sensor = createPointerSensor();
    expect(sensor.plugin).toBe(PointerSensor);
    const constraints = sensor.options!.activationConstraints as (event: PointerEvent, source: Draggable) => unknown[];
    const source = (id: string) => ({id}) as unknown as Draggable;
    expect(constraints({pointerType: 'mouse'} as PointerEvent, source('item:m'))[0]).toBeInstanceOf(PointerActivationConstraints.Distance);
    expect(constraints({pointerType: 'touch'} as PointerEvent, source('item:m'))[0]).toBeInstanceOf(HoldThenMoveConstraint);
    expect(constraints({pointerType: 'touch'} as PointerEvent, source('row:tier-s'))[0]).toBeInstanceOf(PointerActivationConstraints.Delay);
  });

  it('adds the keyboard sensor', () => {
    expect(createSensors()).toContain(KeyboardSensor);
  });
});

/** dnd-kit tells keyboard events by the window's KeyboardEvent; the unit tests run without a DOM. */
class FakeKeyboardEvent extends Event {}
const withKeyboardEvents = () => {
  beforeAll(() => {
    vi.stubGlobal('window', {KeyboardEvent: FakeKeyboardEvent});
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });
};

describe('announcements plugin', () => {
  withKeyboardEvents();
  const preview = [{...tiers[0], items: [...tiers[0].items, tiers[1].items[0]]}, {...tiers[1], items: []}];
  const keyboard = {dragOperation: {activatorEvent: new FakeKeyboardEvent('keydown')}} as unknown as DragDropManager;
  const pointer = {dragOperation: {activatorEvent: null}} as unknown as DragDropManager;
  const source = {id: 'item:w'};

  it('speaks tier labels, with the positions of the list the reader hands it', () => {
    const seen: string[] = [];
    const announcements = createAnnouncements((phase, _event, _manager, type) => {
      seen.push(`${phase}:${type}`);
      return {tiers, preview: phase === 'start' ? tiers : preview};
    });
    expect(announcements.dragstart({operation: {source}} as never, pointer)).toBe('Picked up Winston, in Unranked, position 1 of 1.');
    expect(announcements.dragover!({operation: {source}} as never, pointer)).toBe('Winston moves to tier S, position 2 of 2.');
    expect(announcements.dragmove!({operation: {source}} as never, keyboard)).toBe('Winston moves to tier S, position 2 of 2.');
    expect(announcements.dragend({operation: {source, target: {id: 'item:w'}}, canceled: false} as never, pointer)).toBe('Dropped Winston in tier S, position 2 of 2.');
    expect(announcements.dragend({operation: {source}, canceled: true} as never, pointer)).toBe('Move cancelled. Winston is back in Unranked, position 1 of 1.');
    expect(seen).toEqual(['start:dragstart', 'over:dragover', 'over:dragmove', 'drop:dragend', 'cancel:dragend']);
  });

  it('says the item is back when a pointer drag ends over nothing, and drops a keyboard drag where it is', () => {
    const announcements = createAnnouncements(() => ({tiers, preview}));
    expect(announcements.dragend({operation: {source, target: null}, canceled: false} as never, pointer)).toBe('Move cancelled. Winston is back in Unranked, position 1 of 1.');
    expect(announcements.dragend({operation: {source, target: null}, canceled: false} as never, keyboard)).toBe('Dropped Winston in tier S, position 2 of 2.');
  });

  it('says nothing when the reader has nothing new, or for ids it does not know', () => {
    const announcements = createAnnouncements(() => undefined);
    expect(announcements.dragover!({operation: {source}} as never, pointer)).toBeUndefined();
    const known = createAnnouncements(() => ({tiers, preview: tiers}));
    expect(known.dragstart({operation: {source: {id: 'item:nope'}}} as never, pointer)).toBeUndefined();
    expect(known.dragstart({operation: {source: null}} as never, pointer)).toBeUndefined();
  });
});

describe('drag helpers', () => {
  withKeyboardEvents();
  it('tells drops from drags that end without one', () => {
    const keyboard = {dragOperation: {activatorEvent: new FakeKeyboardEvent('keydown')}} as unknown as DragDropManager;
    const pointer = {dragOperation: {activatorEvent: null}} as unknown as DragDropManager;
    expect(endedWithoutDrop({canceled: true, operation: {target: {}}} as never, pointer)).toBe(true);
    expect(endedWithoutDrop({canceled: false, operation: {target: null}} as never, pointer)).toBe(true);
    expect(endedWithoutDrop({canceled: false, operation: {target: {}}} as never, pointer)).toBe(false);
    expect(endedWithoutDrop({canceled: false, operation: {target: null}} as never, keyboard)).toBe(false);
    expect(endedWithoutDrop({canceled: true, operation: {target: null}} as never, keyboard)).toBe(true);
    expect(isKeyboardDrag(keyboard)).toBe(true);
    expect(isKeyboardDrag(pointer)).toBe(false);
  });

  it('reads the direction of an arrow key from a keyboard move', () => {
    const key = new FakeKeyboardEvent('keydown');
    expect(keyboardDirection({by: {x: 10, y: 0}, nativeEvent: key})).toBe('right');
    expect(keyboardDirection({by: {x: -10, y: 0}, nativeEvent: key})).toBe('left');
    expect(keyboardDirection({by: {x: 0, y: 10}, nativeEvent: key})).toBe('down');
    expect(keyboardDirection({by: {x: 0, y: -10}, nativeEvent: key})).toBe('up');
    expect(keyboardDirection({by: {x: 0, y: 0}, nativeEvent: key})).toBeNull();
    expect(keyboardDirection({by: {x: 10, y: 0}, nativeEvent: new Event('pointermove')})).toBeNull();
    expect(keyboardDirection({nativeEvent: key})).toBeNull();
  });

  it('names the instructions and the live region of an editor', () => {
    expect(accessibilityIds('r1')).toEqual({description: 'dnd-kit-description-r1', announcement: 'dnd-kit-announcement-r1'});
  });
});

describe('plugins', () => {
  it('keeps dnd-kit defaults and configures Accessibility and Feedback', () => {
    const plugins = createPlugins(createAnnouncements(() => undefined), {id: 'r1'})(defaultPreset.plugins);
    const plain = plugins.filter(entry => !('plugin' in entry));
    expect(plain).toEqual(defaultPreset.plugins.filter(plugin => plugin !== Accessibility && plugin !== Feedback));
    expect(plain).toContain(AutoScroller);
    const accessibility = plugins.find(entry => 'plugin' in entry && entry.plugin === Accessibility);
    const feedback = plugins.find(entry => 'plugin' in entry && entry.plugin === Feedback);
    expect(accessibility && 'options' in accessibility && accessibility.options).toMatchObject({id: 'r1', screenReaderInstructions: {draggable: expect.stringMatching(/Space or Enter/)}});
    expect(feedback && 'options' in feedback && feedback.options).toEqual({dropAnimation: DROP_ANIMATION});
  });

  it('builds a dnd-kit manager with these settings (no DOM needed to set it up)', () => {
    const manager = new DragDropManager({sensors: createSensors(), plugins: createPlugins(createAnnouncements(() => undefined), {id: 'r1'})});
    try {
      expect(manager.registry.plugins.get(Accessibility)).toBeDefined();
      expect(manager.registry.plugins.get(Feedback)?.options).toEqual({dropAnimation: DROP_ANIMATION});
      expect(manager.registry.sensors.get(PointerSensor)?.options?.activationConstraints).toBeTypeOf('function');
    } finally {
      manager.destroy();
    }
  });

  it('fits the props of @dnd-kit/react DragDropProvider (checked by tsc)', () => {
    type ProviderProps = ComponentProps<typeof DragDropProvider>;
    const props: Pick<ProviderProps, 'sensors' | 'plugins'> = {sensors: createSensors(), plugins: createPlugins(createAnnouncements(() => undefined), {id: 'r1'})};
    expect(props.sensors).toHaveLength(2);
  });
});
