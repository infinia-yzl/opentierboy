import {Droppable as AbstractDroppable} from '@dnd-kit/abstract';
import type {
  Data,
  DroppableInput as AbstractDroppableInput,
} from '@dnd-kit/abstract';
import {defaultCollisionDetection} from '@dnd-kit/collision';
import type {CollisionDetector} from '@dnd-kit/collision';
import {batch, reactive, signal, untracked} from '@dnd-kit/state';
import type {BoundingRectangle, Shape} from '@dnd-kit/geometry';
import {DOMRectangle, PositionObserver, Scheduler} from '@dnd-kit/dom/utilities';

import type {DragDropManager} from '../../manager/manager.ts';

type OptionalInput = 'collisionDetector';

/*
 * OpenTierBoy fork (docs/reference/drag-and-drop.md, "Local changes"): position changes in batches.
 *
 * Upstream updates a droppable's shape inside its position observer's callback. Each new shape
 * runs collision detection for every droppable at once, so a render that moves 60 droppables
 * ran collision detection 60 times, each over all droppables. Here a droppable that already
 * has a shape queues its update, and one task after the observer callbacks measures all queued
 * droppables in one batch: collision detection runs once. The first shape of a drag, and a
 * droppable leaving the screen, still update at once.
 */
const pendingShapeUpdates = new Map<object, () => void>();
const shapeUpdates = new Scheduler((callback) => setTimeout(callback, 0));

function flushShapeUpdates() {
  const updates = [...pendingShapeUpdates.values()];
  pendingShapeUpdates.clear();
  batch(() => {
    for (const update of updates) update();
  });
}

export interface Input<T extends Data = Data>
  extends Omit<AbstractDroppableInput<T>, OptionalInput> {
  collisionDetector?: CollisionDetector;
  element?: Element;
}

export class Droppable<T extends Data = Data> extends AbstractDroppable<
  T,
  DragDropManager
> {
  constructor(
    {element, effects = () => [], ...input}: Input<T>,
    manager: DragDropManager | undefined
  ) {
    const {collisionDetector = defaultCollisionDetection} = input;
    const updateShape = (boundingClientRect?: BoundingRectangle | null) => {
      const {manager, element} = this;

      if (!element || boundingClientRect === null) {
        this.shape = undefined;
        return undefined;
      }

      if (!manager) return;

      const updatedShape = new DOMRectangle(element);

      const shape = untracked(() => this.shape);
      if (updatedShape && shape?.equals(updatedShape)) {
        return shape;
      }

      this.shape = updatedShape;

      return updatedShape;
    };

    const observePosition = signal(false);

    super(
      {
        ...input,
        collisionDetector,
        effects: () => [
          ...effects(),
          () => {
            const {element, manager} = this;
            if (!manager) return;

            const {dragOperation} = manager;
            const {source} = dragOperation;

            // OpenTierBoy fork: stop tracking positions as soon as the drag stops. Collisions no
            // longer matter, and the list changes at the drop; every droppable's observer would
            // measure and rebuild itself during the drop animation (see docs/reference/drag-and-drop.md).
            observePosition.value = Boolean(
              source &&
                dragOperation.status.initialized &&
                !dragOperation.ending &&
                !dragOperation.status.dropped &&
                element &&
                !this.disabled &&
                this.accepts(source)
            );
          },
          () => {
            const {element} = this;

            if (observePosition.value && element) {
              const positionObserver = new PositionObserver(
                element,
                (boundingClientRect) => {
                  if (
                    boundingClientRect === null ||
                    untracked(() => this.shape) === undefined
                  ) {
                    pendingShapeUpdates.delete(this);
                    updateShape(boundingClientRect);
                    return;
                  }

                  pendingShapeUpdates.set(this, () => updateShape());
                  shapeUpdates.schedule(flushShapeUpdates);
                }
              );

              return () => {
                positionObserver.disconnect();
                pendingShapeUpdates.delete(this);
                this.shape = undefined;
              };
            }
          },
          () => {
            if (this.manager?.dragOperation.status.initialized) {
              return () => {
                this.shape = undefined;
              };
            }
          },
        ],
      },
      manager
    );

    this.element = element;
    this.refreshShape = () => updateShape();
  }

  @reactive
  accessor #element: Element | undefined;

  @reactive
  public accessor proxy: Element | undefined;

  set element(element: Element | undefined) {
    this.#element = element;
  }

  get element() {
    return this.proxy ?? this.#element;
  }

  public refreshShape: () => Shape | undefined;
}
