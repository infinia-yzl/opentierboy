import * as _dnd_kit_geometry from '@dnd-kit/geometry';
import { Alignment } from '@dnd-kit/geometry';
import { Data, UniqueIdentifier, Customizable, Plugins, Modifiers, CollisionPriority, Type, DragOperation, Plugin } from '@dnd-kit/abstract';
import { CollisionDetector } from '@dnd-kit/collision';
import { Draggable, Droppable, DraggableInput, DroppableInput, DragDropManager, Sensors } from '@dnd-kit/dom';

interface SortableTransition {
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
interface SortableDisabled {
    draggable?: boolean;
    droppable?: boolean;
}
type SortableDisabledValue = boolean | SortableDisabled;
interface SortableInput<T extends Data> extends Omit<DraggableInput<T>, 'disabled' | 'plugins'>, Omit<DroppableInput<T>, 'disabled'> {
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
declare const defaultSortableTransition: SortableTransition;
declare function resolveSortableTransition(transition: SortableTransition | null | undefined): SortableTransition | null;
declare class Sortable<T extends Data = Data> {
    #private;
    draggable: Draggable<T>;
    droppable: Droppable<T>;
    accessor index: number;
    get initialIndex(): number;
    get initialGroup(): UniqueIdentifier | undefined;
    accessor group: UniqueIdentifier | undefined;
    transition: SortableTransition | null;
    constructor({ effects: inputEffects, disabled, group, index, sensors, type, transition, plugins: pluginsInput, ...input }: SortableInput<T>, manager: DragDropManager<any, any> | undefined);
    protected animate(): void;
    get manager(): DragDropManager<any, any> | undefined;
    set manager(manager: DragDropManager<any, any> | undefined);
    set element(element: Element | undefined);
    get element(): Element | undefined;
    set target(target: Element | undefined);
    get target(): Element | undefined;
    set source(source: Element | undefined);
    get source(): Element | undefined;
    get disabled(): boolean | SortableDisabled;
    set plugins(value: Customizable<Plugins> | undefined);
    set disabled(value: SortableDisabledValue);
    set data(data: T);
    set handle(handle: Element | undefined);
    set id(id: UniqueIdentifier);
    get id(): UniqueIdentifier;
    set sensors(value: Sensors | undefined);
    set modifiers(value: Modifiers | undefined);
    set collisionPriority(value: CollisionPriority | number | undefined);
    set collisionDetector(value: CollisionDetector | undefined);
    set alignment(value: Alignment | undefined);
    get alignment(): Alignment | undefined;
    set type(type: Type | undefined);
    get type(): Type | undefined;
    set accept(value: Droppable['accept']);
    get accept(): Droppable["accept"];
    get isDropTarget(): boolean;
    /**
     * A boolean indicating whether the sortable item is the source of a drag operation.
     */
    get isDragSource(): boolean;
    /**
     * A boolean indicating whether the sortable item is being dragged.
     */
    get isDragging(): boolean;
    /**
     * A boolean indicating whether the sortable item is being dropped.
     */
    get isDropping(): boolean;
    get status(): "idle" | "dragging" | "dropping";
    refreshShape(): _dnd_kit_geometry.Shape | undefined;
    accepts(draggable: Draggable): boolean;
    register: () => () => void;
    unregister: () => void;
    destroy: () => void;
}
declare class SortableDraggable<T extends Data> extends Draggable<T> {
    sortable: Sortable<T>;
    constructor(input: DraggableInput<T>, manager: DragDropManager | undefined, sortable: Sortable<T>);
    get index(): number;
    get initialIndex(): number;
    get group(): UniqueIdentifier | undefined;
    get initialGroup(): UniqueIdentifier | undefined;
}
declare class SortableDroppable<T extends Data> extends Droppable<T> {
    sortable: Sortable<T>;
    constructor(input: DraggableInput<T>, manager: DragDropManager | undefined, sortable: Sortable<T>);
    get index(): number;
    get group(): UniqueIdentifier | undefined;
}

declare function isSortable<T extends Data = Data>(element: Draggable<T> | null): element is SortableDraggable<T>;
declare function isSortable<T extends Data = Data>(element: Droppable<T> | null): element is SortableDroppable<T>;
declare function isSortableOperation<T extends Data = Data, U extends Data = T>(operation: DragOperation<Draggable<T>, Droppable<U>>): operation is DragOperation<SortableDraggable<T>, SortableDroppable<U>>;

declare class OptimisticSortingPlugin extends Plugin<DragDropManager> {
    constructor(manager: DragDropManager);
}

declare class SortableKeyboardPlugin extends Plugin<DragDropManager> {
    constructor(manager: DragDropManager);
}

export { OptimisticSortingPlugin, Sortable, type SortableDisabled, SortableDraggable, SortableDroppable, type SortableInput, SortableKeyboardPlugin, type SortableTransition, defaultSortableTransition, isSortable, isSortableOperation, resolveSortableTransition };
