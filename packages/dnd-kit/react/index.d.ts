import * as react_jsx_runtime from 'react/jsx-runtime';
import { PropsWithChildren, RefObject, MutableRefObject, ReactNode } from 'react';
import { Data, DragDropEventHandlers, DragDropManager as DragDropManager$1 } from '@dnd-kit/abstract';
import { Draggable, Droppable, DragDropManager, DragDropManagerInput, DraggableInput, DropAnimation, DroppableInput } from '@dnd-kit/dom';
export { BeforeDragStartEvent, CollisionEvent, DragDropManager, DragEndEvent, DragMoveEvent, DragOverEvent, DragStartEvent, KeyboardSensor, PointerSensor } from '@dnd-kit/dom';
import { CleanupFunction } from '@dnd-kit/state';

type Events$1<T extends Data = Data, U extends Draggable<T> = Draggable<T>, V extends Droppable<T> = Droppable<T>, W extends DragDropManager<T, U, V> = DragDropManager<T, U, V>> = DragDropEventHandlers<U, V, W>;
interface Props$1<T extends Data = Data, U extends Draggable<T> = Draggable<T>, V extends Droppable<T> = Droppable<T>, W extends DragDropManager<T, U, V> = DragDropManager<T, U, V>> extends DragDropManagerInput, PropsWithChildren {
    manager?: W;
    onBeforeDragStart?: Events$1<T, U, V, W>['beforedragstart'];
    onCollision?: Events$1<T, U, V, W>['collision'];
    onDragStart?: Events$1<T, U, V, W>['dragstart'];
    onDragMove?: Events$1<T, U, V, W>['dragmove'];
    onDragOver?: Events$1<T, U, V, W>['dragover'];
    onDragEnd?: Events$1<T, U, V, W>['dragend'];
}
declare function DragDropProvider<T extends Data = Data, U extends Draggable<T> = Draggable<T>, V extends Droppable<T> = Droppable<T>, W extends DragDropManager<T, U, V> = DragDropManager<T, U, V>>({ children, onCollision, onBeforeDragStart, onDragStart, onDragMove, onDragOver, onDragEnd, ...input }: Props$1<T, U, V, W>): react_jsx_runtime.JSX.Element;

type Ref<T> = RefObject<T | null | undefined> | MutableRefObject<T>;
type RefOrValue<T> = T | Ref<T> | null | undefined;

interface UseDraggableInput<T extends Data = Data> extends Omit<DraggableInput<T>, 'handle' | 'element'> {
    handle?: RefOrValue<Element>;
    element?: RefOrValue<Element>;
}
declare function useDraggable<T extends Data = Data>(input: UseDraggableInput<T>): {
    draggable: Draggable<T>;
    readonly isDragging: boolean;
    readonly isDropping: boolean;
    readonly isDragSource: boolean;
    handleRef: (element: Element | null) => void;
    ref: (element: Element | null) => void;
};

interface Props<T extends Data, U extends Draggable<T>> {
    className?: string;
    children: ReactNode | ((source: U) => ReactNode);
    /**
     * Customize or disable the drop animation that plays when a drag operation ends.
     *
     * - `undefined` – use the default animation (250ms ease)
     * - `null` – disable the drop animation entirely
     * - `{duration, easing}` – customize the animation timing
     * - `(context) => Promise<void> | void` – provide a fully custom animation function
     */
    dropAnimation?: DropAnimation | null;
    style?: React.CSSProperties;
    tag?: string;
    disabled?: boolean | ((source: U | null) => boolean);
}
declare function DragOverlay<T extends Data, U extends Draggable<T>>({ children, className, dropAnimation, style, tag, disabled, }: Props<T, U>): react_jsx_runtime.JSX.Element;

interface UseDroppableInput<T extends Data = Data> extends Omit<DroppableInput<T>, 'element'> {
    element?: RefOrValue<Element>;
}
declare function useDroppable<T extends Data = Data>(input: UseDroppableInput<T>): {
    droppable: Droppable<T>;
    readonly isDropTarget: boolean;
    ref: (element: Element | null) => void;
};

declare function useDragDropManager<T extends Data = Data, U extends Draggable<T> = Draggable<T>, V extends Droppable<T> = Droppable<T>, W extends DragDropManager<T, U, V> = DragDropManager<T, U, V>>(): W | null;

type EventNameOverrides = {
    beforedragstart: 'onBeforeDragStart';
};
type EventHandlerName<T extends string> = T extends keyof EventNameOverrides ? EventNameOverrides[T] : T extends `drag${infer Second}${infer Rest}` ? `onDrag${Uppercase<Second>}${Rest}` : `on${Capitalize<T>}`;
/**
 * Type for all possible event handlers
 */
type Events<T extends Data, U extends Draggable<T>, V extends Droppable<T>, W extends DragDropManager<T, U, V>> = DragDropEventHandlers<U, V, W>;
type EventHandlers<T extends Data = Data, U extends Draggable<T> = Draggable<T>, V extends Droppable<T> = Droppable<T>, W extends DragDropManager<T, U, V> = DragDropManager<T, U, V>> = {
    [K in keyof Events<T, U, V, W> as EventHandlerName<K>]: Events<T, U, V, W>[K];
};
/**
 * Hook to monitor drag and drop events anywhere within a DragDropProvider
 * @param handlers Object containing event handlers for drag and drop events
 */
declare function useDragDropMonitor<T extends Data = Data, U extends Draggable<T> = Draggable<T>, V extends Droppable<T> = Droppable<T>, W extends DragDropManager<T, U, V> = DragDropManager<T, U, V>>(handlers: Partial<EventHandlers<T, U, V, W>>): void;

declare function useDragOperation<T extends Data = Data, U extends Draggable<T> = Draggable<T>, V extends Droppable<T> = Droppable<T>, W extends DragDropManager<T, U, V> = DragDropManager<T, U, V>>(): {
    readonly source: U | null | undefined;
    readonly target: V | null | undefined;
};

interface Instance<T extends DragDropManager$1<any, any> = DragDropManager$1<any, any>> {
    manager: T | undefined;
    register(): CleanupFunction | void;
}
declare function useInstance<T extends Instance>(initializer: (manager: DragDropManager$1<any, any> | undefined) => T): T;

export { type EventHandlers as DragDropEventHandlers, DragDropProvider, DragOverlay, type UseDraggableInput, type UseDroppableInput, useDragDropManager, useDragDropMonitor, useDragOperation, useDraggable, useDroppable, useInstance };
