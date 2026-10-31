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
  chooseDropAnimation,
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

describe('HoldThenMoveConstraint', () => {
  it('returns activated true when the pointer moves past distance after holdMs', () => {
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

  it('returns no activation when the pointer moves past tolerance before holdMs ends (a scroll)', () => {
    const activated: PointerEvent[] = [];
    const controller = new ActivationController([new HoldThenMoveConstraint(holdThenMove)], event => activated.push(event));
    controller.onEvent(pointer('pointerdown', 100, 100, 1_000));
    controller.onEvent(pointer('pointermove', 100, 120, 1_050));
    controller.onEvent(pointer('pointermove', 100, 160, 1_400));
    expect(activated).toHaveLength(0);
  });

  it('returns no activation when the pointer moves after giveUpMs (the long-press menu opened)', () => {
    const activated: PointerEvent[] = [];
    const controller = new ActivationController([new HoldThenMoveConstraint(holdThenMove)], event => activated.push(event));
    controller.onEvent(pointer('pointerdown', 100, 100, 1_000));
    controller.onEvent(pointer('pointermove', 140, 100, 1_800));
    expect(activated).toHaveLength(0);
  });

  it('returns touchmove defaultPrevented true when holdMs has passed, and false before holdMs and after the drag starts', () => {
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

  it('returns no activation and unblocked touchmove when contextmenu fires before giveUpMs (Chrome on Android)', () => {
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

  it('returns defaultPrevented false for touchmove when the controller aborts an armed press', () => {
    const target = new EventTarget();
    const controller = new ActivationController([new HoldThenMoveConstraint(holdThenMove)], () => {});
    controller.onEvent(pointer('pointerdown', 100, 100, performance.now() - 300, target));
    controller.abort();
    expect(touchMove(target)).toBe(false);
  });
});

describe('lib/dnd/dndKit sensors', () => {
  it('returns Distance, Delay or HoldThenMoveConstraint when activationConstraintsFor gets each rule kind', () => {
    expect(activationConstraintsFor(activationRule('mouse', 'item'))[0]).toBeInstanceOf(PointerActivationConstraints.Distance);
    expect(activationConstraintsFor(activationRule('touch', 'row'))[0]).toBeInstanceOf(PointerActivationConstraints.Delay);
    expect(activationConstraintsFor(activationRule('touch', 'item'))[0]).toBeInstanceOf(HoldThenMoveConstraint);
  });

  it('returns constraints by pointerType and item or row source when createPointerSensor constraints run', () => {
    const sensor = createPointerSensor();
    expect(sensor.plugin).toBe(PointerSensor);
    const constraints = sensor.options!.activationConstraints as (event: PointerEvent, source: Draggable) => unknown[];
    const source = (id: string) => ({id}) as unknown as Draggable;
    expect(constraints({pointerType: 'mouse'} as PointerEvent, source('item:m'))[0]).toBeInstanceOf(PointerActivationConstraints.Distance);
    expect(constraints({pointerType: 'touch'} as PointerEvent, source('item:m'))[0]).toBeInstanceOf(HoldThenMoveConstraint);
    expect(constraints({pointerType: 'touch'} as PointerEvent, source('row:tier-s'))[0]).toBeInstanceOf(PointerActivationConstraints.Delay);
  });

  it('returns a list with KeyboardSensor when createSensors runs', () => {
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

describe('createAnnouncements', () => {
  withKeyboardEvents();
  const preview = [{...tiers[0], items: [...tiers[0].items, tiers[1].items[0]]}, {...tiers[1], items: []}];
  const keyboard = {dragOperation: {activatorEvent: new FakeKeyboardEvent('keydown')}} as unknown as DragDropManager;
  const pointer = {dragOperation: {activatorEvent: null}} as unknown as DragDropManager;
  const source = {id: 'item:w'};

  it('returns tier labels and the positions of the lists from the reader when each drag event fires', () => {
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

  it('returns Move cancelled for pointer drags and Dropped for keyboard drags when a drag ends with no target', () => {
    const announcements = createAnnouncements(() => ({tiers, preview}));
    expect(announcements.dragend({operation: {source, target: null}, canceled: false} as never, pointer)).toBe('Move cancelled. Winston is back in Unranked, position 1 of 1.');
    expect(announcements.dragend({operation: {source, target: null}, canceled: false} as never, keyboard)).toBe('Dropped Winston in tier S, position 2 of 2.');
  });

  it('returns undefined when the reader returns undefined or the source id is unknown', () => {
    const announcements = createAnnouncements(() => undefined);
    expect(announcements.dragover!({operation: {source}} as never, pointer)).toBeUndefined();
    const known = createAnnouncements(() => ({tiers, preview: tiers}));
    expect(known.dragstart({operation: {source: {id: 'item:nope'}}} as never, pointer)).toBeUndefined();
    expect(known.dragstart({operation: {source: null}} as never, pointer)).toBeUndefined();
  });
});

describe('lib/dnd/dndKit drag helpers', () => {
  withKeyboardEvents();
  it('returns true from endedWithoutDrop when a drag is cancelled or a pointer drag ends over no target', () => {
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

  it('returns up, down, left or right when keyboardDirection gets a keyboard move, and null otherwise', () => {
    const key = new FakeKeyboardEvent('keydown');
    expect(keyboardDirection({by: {x: 10, y: 0}, nativeEvent: key})).toBe('right');
    expect(keyboardDirection({by: {x: -10, y: 0}, nativeEvent: key})).toBe('left');
    expect(keyboardDirection({by: {x: 0, y: 10}, nativeEvent: key})).toBe('down');
    expect(keyboardDirection({by: {x: 0, y: -10}, nativeEvent: key})).toBe('up');
    expect(keyboardDirection({by: {x: 0, y: 0}, nativeEvent: key})).toBeNull();
    expect(keyboardDirection({by: {x: 10, y: 0}, nativeEvent: new Event('pointermove')})).toBeNull();
    expect(keyboardDirection({nativeEvent: key})).toBeNull();
  });

  it('returns dnd-kit-description-<id> and dnd-kit-announcement-<id> when accessibilityIds gets an id', () => {
    expect(accessibilityIds('r1')).toEqual({description: 'dnd-kit-description-r1', announcement: 'dnd-kit-announcement-r1'});
  });
});

describe('createPlugins', () => {
  it('returns defaultPreset.plugins with Accessibility and Feedback options set when createPlugins wraps them', () => {
    const plugins = createPlugins(createAnnouncements(() => undefined), {id: 'r1'})(defaultPreset.plugins);
    const plain = plugins.filter(entry => !('plugin' in entry));
    expect(plain).toEqual(defaultPreset.plugins.filter(plugin => plugin !== Accessibility && plugin !== Feedback));
    expect(plain).toContain(AutoScroller);
    const accessibility = plugins.find(entry => 'plugin' in entry && entry.plugin === Accessibility);
    const feedback = plugins.find(entry => 'plugin' in entry && entry.plugin === Feedback);
    expect(accessibility && 'options' in accessibility && accessibility.options).toMatchObject({id: 'r1', screenReaderInstructions: {draggable: expect.stringMatching(/Space or Enter/)}});
    expect(feedback && 'options' in feedback && feedback.options).toEqual({dropAnimation: DROP_ANIMATION});
  });

  it('returns a DragDropManager with Accessibility, Feedback and the pointer sensor when built with no DOM', () => {
    const manager = new DragDropManager({sensors: createSensors(), plugins: createPlugins(createAnnouncements(() => undefined), {id: 'r1'})});
    try {
      expect(manager.registry.plugins.get(Accessibility)).toBeDefined();
      expect(manager.registry.plugins.get(Feedback)?.options).toEqual({dropAnimation: DROP_ANIMATION});
      expect(manager.registry.sensors.get(PointerSensor)?.options?.activationConstraints).toBeTypeOf('function');
      // Keyboard drags drop without the animation; pointer drags use DROP_ANIMATION.
      chooseDropAnimation(manager, true);
      expect(manager.registry.plugins.get(Feedback)?.dropAnimation).toBeTypeOf('function');
      chooseDropAnimation(manager, false);
      expect(manager.registry.plugins.get(Feedback)?.dropAnimation).toBeUndefined();
    } finally {
      manager.destroy();
    }
  });

  it('returns sensors and plugins typed as DragDropProvider props when created (checked by tsc)', () => {
    type ProviderProps = ComponentProps<typeof DragDropProvider>;
    const props: Pick<ProviderProps, 'sensors' | 'plugins'> = {sensors: createSensors(), plugins: createPlugins(createAnnouncements(() => undefined), {id: 'r1'})};
    expect(props.sensors).toHaveLength(2);
  });
});
