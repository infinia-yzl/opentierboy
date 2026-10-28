import {batch, reactive, untracked, WeakStore} from '@dnd-kit/state';
import type {CollisionPriority, Customizable, Modifiers, Plugins} from '@dnd-kit/abstract';
import type {
  Data,
  PluginConstructor,
  Type,
  UniqueIdentifier,
} from '@dnd-kit/abstract';
import {resolveCustomizable} from '@dnd-kit/abstract';
import {
  defaultCollisionDetection,
  type CollisionDetector,
} from '@dnd-kit/collision';
import type {Alignment, Shape} from '@dnd-kit/geometry';
import {Draggable, Droppable, Feedback} from '@dnd-kit/dom';
import type {
  DraggableInput,
  DroppableInput,
  Sensors,
  DragDropManager,
} from '@dnd-kit/dom';
import {
  animateTransform,
  getComputedStyles,
  getWindow,
  computeTranslate,
  prefersReducedMotion,
  ProxiedElements,
} from '@dnd-kit/dom/utilities';

import {SortableKeyboardPlugin} from './plugins/SortableKeyboardPlugin.ts';
import {OptimisticSortingPlugin} from './plugins/OptimisticSortingPlugin.ts';

export interface SortableTransition {
  /**
   * The duration of the transition in milliseconds.
   * @default 300
   */
  duration?: number;
  /**
   * The easing function to use for the transition.
   * @default 'cubic-bezier(0.25, 1, 0.5, 1)'
   */
  easing?: string;
  /**
   * Whether the sortable item should transition when its index changes,
   * but there is no drag operation in progress.
   * @default false
   **/
  idle?: boolean;
}

export interface SortableDisabled {
  draggable?: boolean;
  droppable?: boolean;
}

type SortableDisabledValue = boolean | SortableDisabled;

const defaultPlugins: PluginConstructor[] = [
  SortableKeyboardPlugin,
  OptimisticSortingPlugin,
];

export interface SortableInput<T extends Data>
  extends Omit<DraggableInput<T>, 'disabled' | 'plugins'>,
    Omit<DroppableInput<T>, 'disabled'> {
  /**
   * Whether the sortable item should be disabled.
   *
   * Passing a boolean disables dragging and dropping.
   * Use the object form to disable dragging and dropping independently.
   */
  disabled?: boolean | SortableDisabled;

  /**
   * The index of the sortable item within its group.
   */
  index: number;

  /**
   * The element that should be used as the droppable target for this sortable item.
   */
  target?: Element;

  /**
   * The optional unique identifier of the group that the sortable item belongs to.
   */
  group?: UniqueIdentifier;
  /**
   * The transition configuration to use when the index of the sortable item changes.
   */
  transition?: SortableTransition | null;
  /**
   * Plugins to register or configure per-entity.
   *
   * Bare constructors are registered globally (e.g. sortable-specific plugins).
   * Descriptors from `Plugin.configure()` are applied as per-entity plugin config.
   *
   * Can be provided as an array (replaces defaults) or a function that receives
   * the default plugins and returns a new array (extends defaults).
   *
   * @default [SortableKeyboardPlugin, OptimisticSortingPlugin]
   *
   * @example
   * // Extend defaults
   * plugins: (defaults) => [...defaults, Feedback.configure({feedback: 'clone'})]
   *
   * // Replace defaults
   * plugins: [MyPlugin]
   */
  plugins?: Customizable<Plugins>;
}

export const defaultSortableTransition: SortableTransition = {
  duration: 250,
  easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
  idle: false,
};

export function resolveSortableTransition(
  transition: SortableTransition | null | undefined
): SortableTransition | null {
  return transition === null
    ? null
    : {...defaultSortableTransition, ...transition};
}

function normalizeDisabled(
  disabled: SortableDisabledValue | undefined
): Required<SortableDisabled> {
  if (typeof disabled === 'boolean') {
    return {
      draggable: disabled,
      droppable: disabled,
    };
  }

  return {
    draggable: disabled?.draggable ?? false,
    droppable: disabled?.droppable ?? false,
  };
}

interface TemporaryState {
  initialIndex: number;
  initialGroup: UniqueIdentifier | undefined;
}

const store = new WeakStore<
  DragDropManager,
  UniqueIdentifier,
  TemporaryState
>();

export class Sortable<T extends Data = Data> {
  public draggable: Draggable<T>;
  public droppable: Droppable<T>;

  @reactive
  public accessor index: number;

  #previousGroup: UniqueIdentifier | undefined;

  #previousIndex: number;

  get initialIndex() {
    return store.get(this.manager, this.id)?.initialIndex ?? this.index;
  }

  get initialGroup() {
    return store.get(this.manager, this.id)?.initialGroup ?? this.group;
  }

  @reactive
  public accessor group: UniqueIdentifier | undefined;

  transition: SortableTransition | null;

  constructor(
    {
      effects: inputEffects = () => [],
      disabled,
      group,
      index,
      sensors,
      type,
      transition = defaultSortableTransition,
      plugins: pluginsInput,
      ...input
    }: SortableInput<T>,
    manager: DragDropManager<any, any> | undefined
  ) {
    const plugins = resolveCustomizable(pluginsInput, defaultPlugins);
    const disabledState = normalizeDisabled(disabled);

    this.droppable = new SortableDroppable<T>(
      {...input, disabled: disabledState.droppable},
      manager,
      this
    );
    this.draggable = new SortableDraggable<T>(
      {
        ...input,
        disabled: disabledState.draggable,
        plugins,
        effects: () => [
          () => {
            const status = this.manager?.dragOperation.status;

            if (
              status?.initializationPending &&
              this.id === this.manager?.dragOperation.source?.id
            ) {
              store.clear(this.manager);
            }

            if (status?.dragging) {
              store.set(
                this.manager,
                this.id,
                untracked(() => ({
                  initialIndex: this.index,
                  initialGroup: this.group,
                }))
              );
            }
          },
          () => {
            const {index, group, manager: _} = this;
            const previousIndex = this.#previousIndex;
            const previousGroup = this.#previousGroup;

            // Re-run this effect whenever the index changes
            if (index !== previousIndex || group !== previousGroup) {
              this.#previousIndex = index;
              this.#previousGroup = group;

              this.animate();
            }
          },
          () => {
            const {target} = this;
            const {isDragSource} = this.draggable;
            const feedback =
              this.draggable.pluginConfig(Feedback)?.feedback ?? 'default';

            if (feedback === 'move' && isDragSource) {
              this.droppable.disabled = !target;
            }
          },
          ...inputEffects(),
        ],
        type,
        sensors,
      },
      manager,
      this
    );

    this.#element = input.element;
    this.manager = manager;
    this.index = index;
    this.#previousIndex = index;
    this.group = group;
    this.#previousGroup = group;
    this.type = type;
    this.transition = transition;
  }

  protected animate() {
    untracked(() => {
      const {manager, transition} = this;
      const {shape} = this.droppable;

      if (!manager) return;

      const {idle} = manager.dragOperation.status;

      if (!shape || !transition || (idle && !transition.idle)) {
        return;
      }

      // OpenTierBoy fork: the animations of one render run together (scheduleIndexAnimation).
      scheduleIndexAnimation(manager, this, shape, transition);
    });
  }

  public get manager(): DragDropManager<any, any> | undefined {
    return this.draggable.manager as any;
  }

  public set manager(manager: DragDropManager<any, any> | undefined) {
    batch(() => {
      this.draggable.manager = manager as any;
      this.droppable.manager = manager as any;
    });
  }

  #element: Element | undefined;

  public set element(element: Element | undefined) {
    batch(() => {
      const previousElement = this.#element;
      const droppableElement = this.droppable.element;
      const draggableElement = this.draggable.element;

      if (!droppableElement || droppableElement === previousElement) {
        this.droppable.element = element;
      }

      if (!draggableElement || draggableElement === previousElement) {
        this.draggable.element = element;
      }

      this.#element = element;
    });
  }

  public get element() {
    const element = this.#element;

    if (!element) return;

    return ProxiedElements.get(element) ?? element ?? this.droppable.element;
  }

  public set target(target: Element | undefined) {
    this.droppable.element = target;
  }

  public get target() {
    return this.droppable.element;
  }

  public set source(source: Element | undefined) {
    this.draggable.element = source;
  }

  public get source() {
    return this.draggable.element;
  }

  public get disabled(): boolean | SortableDisabled {
    const {disabled: draggable} = this.draggable;
    const {disabled: droppable} = this.droppable;

    return draggable === droppable ? draggable : {draggable, droppable};
  }

  public set plugins(value: Customizable<Plugins> | undefined) {
    this.draggable.plugins = resolveCustomizable(value, defaultPlugins);
  }

  public set disabled(value: SortableDisabledValue) {
    const disabled = normalizeDisabled(value);

    batch(() => {
      this.droppable.disabled = disabled.droppable;
      this.draggable.disabled = disabled.draggable;
    });
  }

  public set data(data: T) {
    batch(() => {
      this.droppable.data = data;
      this.draggable.data = data;
    });
  }

  public set handle(handle: Element | undefined) {
    this.draggable.handle = handle;
  }

  public set id(id: UniqueIdentifier) {
    this.droppable.id = id;
    this.draggable.id = id;
  }

  public get id() {
    return this.droppable.id;
  }

  public set sensors(value: Sensors | undefined) {
    this.draggable.sensors = value;
  }

  public set modifiers(value: Modifiers | undefined) {
    this.draggable.modifiers = value;
  }

  public set collisionPriority(value: CollisionPriority | number | undefined) {
    this.droppable.collisionPriority = value;
  }

  public set collisionDetector(value: CollisionDetector | undefined) {
    this.droppable.collisionDetector = value ?? defaultCollisionDetection;
  }

  public set alignment(value: Alignment | undefined) {
    this.draggable.alignment = value;
  }

  public get alignment() {
    return this.draggable.alignment;
  }

  public set type(type: Type | undefined) {
    batch(() => {
      this.droppable.type = type;
      this.draggable.type = type;
    });
  }

  public get type() {
    return this.draggable.type;
  }

  public set accept(value: Droppable['accept']) {
    this.droppable.accept = value;
  }

  public get accept() {
    return this.droppable.accept;
  }

  public get isDropTarget() {
    return this.droppable.isDropTarget;
  }

  /**
   * A boolean indicating whether the sortable item is the source of a drag operation.
   */
  public get isDragSource() {
    return this.draggable.isDragSource;
  }

  /**
   * A boolean indicating whether the sortable item is being dragged.
   */
  public get isDragging() {
    return this.draggable.isDragging;
  }

  /**
   * A boolean indicating whether the sortable item is being dropped.
   */
  public get isDropping() {
    return this.draggable.isDropping;
  }

  public get status() {
    return this.draggable.status;
  }

  public refreshShape() {
    return this.droppable.refreshShape();
  }

  public accepts(draggable: Draggable): boolean {
    return this.droppable.accepts(draggable);
  }

  public register = () => {
    batch(() => {
      this.manager?.registry.register(this.droppable);
      this.manager?.registry.register(this.draggable);
    });

    return () => this.unregister();
  };

  public unregister = () => {
    batch(() => {
      this.manager?.registry.unregister(this.droppable);
      this.manager?.registry.unregister(this.draggable);
    });
  };

  public destroy = () => {
    batch(() => {
      this.droppable.destroy();
      this.draggable.destroy();
    });
  };
}

export class SortableDraggable<T extends Data> extends Draggable<T> {
  constructor(
    input: DraggableInput<T>,
    manager: DragDropManager | undefined,
    public sortable: Sortable<T>
  ) {
    super(input, manager);
  }

  get index() {
    return this.sortable.index;
  }

  get initialIndex() {
    return this.sortable.initialIndex;
  }

  get group() {
    return this.sortable.group;
  }

  get initialGroup() {
    return this.sortable.initialGroup;
  }
}

export class SortableDroppable<T extends Data> extends Droppable<T> {
  constructor(
    input: DraggableInput<T>,
    manager: DragDropManager | undefined,
    public sortable: Sortable<T>
  ) {
    super(input, manager);
  }

  get index() {
    return this.sortable.index;
  }

  get group() {
    return this.sortable.group;
  }
}

/*
 * OpenTierBoy fork (docs/dnd-fork.md, "Local changes"): index-change animations in batches.
 *
 * Upstream measures and animates each sortable on its own, one after the other: cancel its
 * transform transitions, measure it, start its animation. Each measurement also sets the
 * sortable's shape, and each new shape runs collision detection over all droppables. So a
 * render that moved 60 items measured the page and ran collision detection 60 times. Here
 * every sortable that changed index in the same render waits for one flush, which cancels all
 * transitions, then measures all items in one batch of shape updates (collision detection runs
 * once), then starts all animations. The animations themselves are the same as upstream's.
 */

interface PendingIndexAnimation {
  sortable: Sortable<any>;
  /** The shape before the index changed (the first one, if the index changed again). */
  shape: Shape;
  transition: SortableTransition;
}

const pendingIndexAnimations = new WeakMap<
  DragDropManager<any, any>,
  Map<Sortable<any>, PendingIndexAnimation>
>();

function scheduleIndexAnimation(
  manager: DragDropManager<any, any>,
  sortable: Sortable<any>,
  shape: Shape,
  transition: SortableTransition
) {
  const pending = pendingIndexAnimations.get(manager);

  if (pending) {
    if (!pending.has(sortable)) pending.set(sortable, {sortable, shape, transition});
    return;
  }

  const animations = new Map([[sortable, {sortable, shape, transition}]]);
  pendingIndexAnimations.set(manager, animations);

  manager.renderer.rendering.then(() => {
    pendingIndexAnimations.delete(manager);
    runIndexAnimations(manager, [...animations.values()]);
  });
}

const TRANSFORM_PROPERTIES = ['transform', 'translate', 'scale'];

function runIndexAnimations(
  manager: DragDropManager<any, any>,
  entries: PendingIndexAnimation[]
) {
  // 1. Cancel CSS transitions on transform-related properties before measuring.
  // These transitions (e.g. `transition: transform` from user CSS) would cause
  // getBoundingClientRect() to return the mid-transition position rather than
  // the element's final resting position, resulting in an incorrect delta.
  for (const {sortable} of entries) {
    const {element} = sortable;

    if (!element) continue;

    for (const animation of element.getAnimations()) {
      if (
        'transitionProperty' in animation &&
        TRANSFORM_PROPERTIES.includes(animation.transitionProperty as string)
      ) {
        animation.cancel();
      }
    }
  }

  // 2. Measure every element, in one batch of shape updates.
  const moves: {
    sortable: Sortable<any>;
    element: Element;
    transition: SortableTransition;
    translate: string[];
  }[] = [];

  batch(() => {
    for (const {sortable, shape, transition} of entries) {
      const {element} = sortable;

      if (!element) continue;

      const updatedShape = sortable.refreshShape();

      if (!updatedShape) continue;

      const delta = {
        x: shape.boundingRectangle.left - updatedShape.boundingRectangle.left,
        y: shape.boundingRectangle.top - updatedShape.boundingRectangle.top,
      };

      if (!delta.x && !delta.y) continue;

      const {translate} = getComputedStyles(element);
      const currentTranslate = computeTranslate(element, translate, false);
      const finalTranslate = computeTranslate(element, translate);

      moves.push({
        sortable,
        element,
        transition: prefersReducedMotion(getWindow(element))
          ? {...transition, duration: 0}
          : transition,
        translate: [
          `${currentTranslate.x + delta.x}px ${currentTranslate.y + delta.y}px ${currentTranslate.z}`,
          `${finalTranslate.x}px ${finalTranslate.y}px ${finalTranslate.z}`,
        ],
      });
    }
  });

  // 3. Start the animations.
  for (const {sortable, element, transition, translate} of moves) {
    animateTransform({
      element,
      keyframes: {translate},
      options: transition,
    }).then(() => {
      if (!manager.dragOperation.status.dragging) {
        sortable.droppable.shape = undefined;
      }
    });
  }
}
