import * as _dnd_kit_abstract from '@dnd-kit/abstract';
import { Sensors as Sensors$1, Data, Draggable as Draggable$1, DraggableInput, Droppable as Droppable$1, DroppableInput, DragDropManager as DragDropManager$1, DragDropManagerInput, Modifiers, Plugins, DragDropEventMap, Sensor, ActivationConstraints, ActivationController, ActivationConstraint, Plugin, CorePlugin } from '@dnd-kit/abstract';
export { Customizable, resolveCustomizable } from '@dnd-kit/abstract';
import { CollisionDetector } from '@dnd-kit/collision';
import { Shape, Coordinates, Distance, Axis } from '@dnd-kit/geometry';
import { CleanupFunction as CleanupFunction$1 } from '@dnd-kit/state';

type Sensors = Sensors$1<DragDropManager>;

interface Input$2<T extends Data = Data> extends DraggableInput<T> {
    handle?: Element;
    element?: Element;
    sensors?: Sensors;
}
declare class Draggable<T extends Data = Data> extends Draggable$1<T, DragDropManager> {
    constructor({ element, effects, handle, ...input }: Input$2<T>, manager: DragDropManager | undefined);
    accessor handle: Element | undefined;
    accessor element: Element | undefined;
}

type OptionalInput = 'collisionDetector';
interface Input$1<T extends Data = Data> extends Omit<DroppableInput<T>, OptionalInput> {
    collisionDetector?: CollisionDetector;
    element?: Element;
}
declare class Droppable<T extends Data = Data> extends Droppable$1<T, DragDropManager> {
    #private;
    constructor({ element, effects, ...input }: Input$1<T>, manager: DragDropManager | undefined);
    accessor proxy: Element | undefined;
    set element(element: Element | undefined);
    get element(): Element | undefined;
    refreshShape: () => Shape | undefined;
}

interface Input extends DragDropManagerInput<DragDropManager> {
}
declare const defaultPreset: {
    modifiers: Modifiers<DragDropManager>;
    plugins: Plugins<DragDropManager>;
    sensors: Sensors$1<DragDropManager>;
};
declare class DragDropManager<T extends Data = Data, U extends Draggable<T> = Draggable<T>, V extends Droppable<T> = Droppable<T>> extends DragDropManager$1<U, V> {
    constructor(input?: Input);
}

type Events = DragDropEventMap<Draggable, Droppable, DragDropManager>;
type CollisionEvent = Events['collision'];
type BeforeDragStartEvent = Events['beforedragstart'];
type DragStartEvent = Events['dragstart'];
type DragMoveEvent = Events['dragmove'];
type DragOverEvent = Events['dragover'];
type DragEndEvent = Events['dragend'];

interface EventListenerDescriptor {
    type: string;
    listener(event: Event): void;
    options?: AddEventListenerOptions;
}
type EventListenerInput = EventListenerDescriptor[] | EventListenerDescriptor;
declare class Listeners {
    private entries;
    constructor();
    bind(target: EventTarget | EventTarget[], input: EventListenerInput): () => void;
    clear: () => void;
}

type Maybe<T> = T | undefined;
interface PointerSensorOptions {
    activationConstraints?: ActivationConstraints<PointerEvent> | ((event: PointerEvent, source: Draggable) => ActivationConstraints<PointerEvent> | undefined);
    activatorElements?: Maybe<Element>[] | ((source: Draggable) => Maybe<Element>[]);
    preventActivation?: (event: PointerEvent, source: Draggable) => boolean;
}
/**
 * The PointerSensor class is an input sensor that handles Pointer events,
 * such as mouse, touch and pen interactions.
 */
declare class PointerSensor extends Sensor<DragDropManager, PointerSensorOptions> {
    #private;
    manager: DragDropManager;
    options?: PointerSensorOptions | undefined;
    protected listeners: Listeners;
    protected initialCoordinates: Coordinates | undefined;
    protected controller: ActivationController<PointerEvent> | undefined;
    constructor(manager: DragDropManager, options?: PointerSensorOptions | undefined);
    protected activationConstraints(event: PointerEvent, source: Draggable, options?: PointerSensorOptions | undefined): ActivationConstraints<PointerEvent> | undefined;
    bind(source: Draggable, options?: PointerSensorOptions | undefined): CleanupFunction$1;
    protected handlePointerDown(event: PointerEvent, source: Draggable, options: PointerSensorOptions | undefined): void;
    private latest;
    protected handleMove: () => void;
    protected handlePointerMove(event: PointerEvent, source: Draggable): void;
    private handlePointerUp;
    protected handleKeyDown(event: KeyboardEvent): void;
    protected handleStart(source: Draggable, event: PointerEvent): void;
    protected handleCancel(event: Event): void;
    protected cleanup(): void;
    destroy(): void;
    static configure: (options: PointerSensorOptions) => _dnd_kit_abstract.PluginDescriptor<any, _dnd_kit_abstract.Plugin<any, PointerSensorOptions>, typeof PointerSensor>;
    static defaults: Readonly<PointerSensorOptions>;
}

interface DistanceConstraintOptions {
    value: number;
    tolerance?: Distance;
}
declare class DistanceConstraint extends ActivationConstraint<PointerEvent, DistanceConstraintOptions> {
    #private;
    onEvent(event: PointerEvent): void;
    abort(): void;
}

interface DelayConstraintOptions {
    value: number;
    tolerance: Distance;
}
declare class DelayConstraint extends ActivationConstraint<PointerEvent, DelayConstraintOptions> {
    #private;
    onEvent(event: PointerEvent): void;
    abort(): void;
}

declare class PointerActivationConstraints {
    static Delay: typeof DelayConstraint;
    static Distance: typeof DistanceConstraint;
}

type KeyCode = KeyboardEvent['key'];

type KeyboardCodes = {
    start: KeyCode[];
    cancel: KeyCode[];
    end: KeyCode[];
    up: KeyCode[];
    down: KeyCode[];
    left: KeyCode[];
    right: KeyCode[];
};
interface KeyboardSensorOptions {
    /**
     * The offset by which the keyboard sensor should move the draggable.
     *
     * @default 10
     */
    offset?: number | {
        x: number;
        y: number;
    };
    /**
     * The keyboard keys that activate the keyboard sensor.
     *
     * @default {
     *   start: ['Space', 'Enter'],
     *   cancel: ['Escape'],
     *   end: ['Space', 'Enter', 'Tab'],
     *   up: ['ArrowUp'],
     *   down: ['ArrowDown'],
     *   left: ['ArrowLeft'],
     *   right: ['ArrowRight']
     * }
     */
    keyboardCodes?: KeyboardCodes;
    /**
     * Function that determines if the keyboard sensor should activate.
     */
    preventActivation?: (event: KeyboardEvent, source: Draggable) => boolean;
}
/**
 * The KeyboardSensor class is an input sensor that handles Keyboard events.
 */
declare class KeyboardSensor extends Sensor<DragDropManager, KeyboardSensorOptions> {
    #private;
    manager: DragDropManager;
    options?: KeyboardSensorOptions | undefined;
    constructor(manager: DragDropManager, options?: KeyboardSensorOptions | undefined);
    protected listeners: Listeners;
    bind(source: Draggable, options?: KeyboardSensorOptions | undefined): CleanupFunction$1;
    protected handleSourceKeyDown: (event: KeyboardEvent, source: Draggable, options: KeyboardSensorOptions | undefined) => void;
    protected handleStart(event: KeyboardEvent, source: Draggable, options: KeyboardSensorOptions | undefined): void;
    protected handleKeyDown(event: KeyboardEvent, _source: Draggable, options: KeyboardSensorOptions | undefined): void;
    protected handleEnd(event: Event, canceled: boolean): void;
    protected handleMove(direction: 'up' | 'down' | 'left' | 'right', event: KeyboardEvent): void;
    private sideEffects;
    protected cleanup(): void;
    destroy(): void;
    static configure: (options: KeyboardSensorOptions) => _dnd_kit_abstract.PluginDescriptor<any, _dnd_kit_abstract.Plugin<any, KeyboardSensorOptions>, typeof KeyboardSensor>;
    static defaults: Readonly<Required<KeyboardSensorOptions>>;
}

type GetAnnouncementForEvent<Key extends keyof DragDropEventMap<any, any, any>> = (event: DragDropEventMap<Draggable, Droppable, DragDropManager>[Key], manager: DragDropManager) => string | undefined;
interface Announcements {
    dragstart: GetAnnouncementForEvent<'dragstart'>;
    dragmove?: GetAnnouncementForEvent<'dragmove'>;
    dragover?: GetAnnouncementForEvent<'dragover'>;
    dragend: GetAnnouncementForEvent<'dragend'>;
}
interface ScreenReaderInstructions {
    draggable: string;
}

interface Options {
    /**
     * Optional id that should be used for the accessibility plugin's screen reader instructions and announcements.
     */
    id?: string;
    /**
     * Optional id prefix to use for the accessibility plugin's screen reader instructions and announcements.
     */
    idPrefix?: {
        description?: string;
        announcement?: string;
    };
    /**
     * The announcements to use for the accessibility plugin.
     */
    announcements?: Announcements;
    /**
     * The screen reader instructions to use for the accessibility plugin.
     */
    screenReaderInstructions?: ScreenReaderInstructions;
    /**
     * The number of milliseconds to debounce the announcement updates.
     *
     * @remarks
     * Only the `dragover` and `dragmove` announcements are debounced.
     *
     * @default 500
     */
    debounce?: number;
}
declare class Accessibility extends Plugin<DragDropManager> {
    constructor(manager: DragDropManager, options?: Options);
}

interface CursorPluginOptions {
    /**
     * The style of the cursor to be applied to the document body.
     * @default 'grabbing'
     */
    cursor?: string;
}
declare class Cursor extends Plugin<DragDropManager> {
    manager: DragDropManager;
    constructor(manager: DragDropManager, options?: CursorPluginOptions);
}

interface DropAnimationOptions {
    /** Duration in milliseconds. @default 250 */
    duration?: number;
    /** CSS easing function. @default 'ease' */
    easing?: string;
}
type DropAnimationFunction = (context: {
    source: Draggable;
    element: Element;
    feedbackElement: Element;
    placeholder: Element | null | undefined;
    translate: Coordinates;
    moved: boolean;
}) => Promise<void> | void;
type DropAnimation = DropAnimationOptions | DropAnimationFunction;

type FeedbackType = 'default' | 'move' | 'clone' | 'none';
type FeedbackInput = FeedbackType | ((source: Draggable, manager: DragDropManager) => FeedbackType);
interface KeyboardTransition {
    duration?: number;
    easing?: string;
}
interface FeedbackOptions {
    feedback?: FeedbackInput;
    rootElement?: Element | ((source: Draggable) => Element);
    dropAnimation?: DropAnimation | null;
    keyboardTransition?: KeyboardTransition | null;
}
declare class Feedback extends Plugin<DragDropManager, FeedbackOptions> {
    #private;
    accessor overlay: Element | undefined;
    /**
     * Override the drop animation configuration for this Feedback instance.
     *
     * - `undefined` – use the default from plugin options
     * - `null` – disable the drop animation entirely
     * - `DropAnimationOptions` – customize duration / easing
     * - `DropAnimationFunction` – provide a fully custom animation
     */
    dropAnimation: DropAnimation | null | undefined;
    private state;
    constructor(manager: DragDropManager, options?: FeedbackOptions);
    static configure: (options: FeedbackOptions) => _dnd_kit_abstract.PluginDescriptor<any, Plugin<any, FeedbackOptions>, typeof Feedback>;
}

interface Transition {
    /**
     * The duration of the transition in milliseconds.
     * @default 250
     */
    duration?: number;
    /**
     * The easing function to use for the transition.
     * @default 'ease-in-out'
     */
    easing?: string;
}

interface ScrollOptions {
    acceleration?: number;
    threshold?: Record<Axis, number>;
}
declare class Scroller extends CorePlugin<DragDropManager> {
    #private;
    getScrollableElements: () => Set<Element> | null;
    private scrollIntentTracker;
    accessor autoScrolling: boolean;
    constructor(manager: DragDropManager);
    scroll: (options?: {
        by: Coordinates;
    }, scrollOptions?: ScrollOptions) => boolean;
}

interface AutoScrollerOptions {
    /**
     * Base scroll speed multiplier. Higher values scroll faster.
     * @default 25
     */
    acceleration?: number;
    /**
     * Percentage of container dimensions that defines the scroll activation zone.
     * A single number applies to both axes. Use `{ x, y }` to set per-axis
     * thresholds. Set an axis to `0` to disable auto-scrolling on that axis.
     * @default { x: 0.2, y: 0.2 }
     */
    threshold?: number | Record<Axis, number>;
}
declare class AutoScroller extends Plugin<DragDropManager, AutoScrollerOptions> {
    destroy: CleanupFunction$1;
    constructor(manager: DragDropManager, options?: AutoScrollerOptions);
    static configure: (options: AutoScrollerOptions) => _dnd_kit_abstract.PluginDescriptor<any, Plugin<any, AutoScrollerOptions>, typeof AutoScroller>;
}

declare class ScrollListener extends CorePlugin<DragDropManager> {
    #private;
    constructor(manager: DragDropManager);
    private handleScroll;
}

declare class PreventSelection extends Plugin<DragDropManager> {
    manager: DragDropManager;
    constructor(manager: DragDropManager);
}

type CleanupFunction = () => void;
interface StyleInjectorOptions {
    nonce?: string;
}
interface StyleRegistrationOptions {
    /**
     * Keep the rules injected in a root after the drag operation that required
     * them ends, until the rules are unregistered or the plugin is destroyed.
     *
     * Adding or removing a stylesheet makes the browser recalculate styles for
     * the entire document, so rules that are injected and removed on every drag
     * add that cost to the start and end of each drag. Only retain rules that
     * have no effect outside of a drag operation, such as rules scoped to
     * `data-dnd-*` attributes.
     *
     * @default false
     */
    retain?: boolean;
}
declare class StyleInjector extends CorePlugin<DragDropManager, StyleInjectorOptions> {
    #private;
    /**
     * Registered CSS rules, mapped to whether they are retained between drag
     * operations.
     */
    private accessor registeredRules;
    private accessor additionalRoots;
    constructor(manager: DragDropManager, options?: StyleInjectorOptions);
    /**
     * Registers CSS rules to be injected into the active drag operation's
     * document and shadow roots. The StyleInjector handles tracking
     * which roots need the styles and cleaning up when they're no longer needed.
     *
     * Returns a cleanup function that unregisters the rules.
     */
    register(cssRules: string, options?: StyleRegistrationOptions): CleanupFunction;
    /**
     * Adds an additional root to track for style injection.
     * Returns a cleanup function that removes the root.
     */
    addRoot(root: Document | ShadowRoot): CleanupFunction;
    private get sourceRoot();
    private get targetRoot();
    private get roots();
    destroy(): void;
    static configure: (options: StyleInjectorOptions) => _dnd_kit_abstract.PluginDescriptor<any, _dnd_kit_abstract.Plugin<any, StyleInjectorOptions>, typeof StyleInjector>;
}

export { Accessibility, AutoScroller, type BeforeDragStartEvent, type CollisionEvent, Cursor, DragDropManager, type Input as DragDropManagerInput, type DragEndEvent, type DragMoveEvent, type DragOverEvent, type DragStartEvent, Draggable, type Input$2 as DraggableInput, type DropAnimation, type DropAnimationFunction, type DropAnimationOptions, Droppable, type Input$1 as DroppableInput, Feedback, type FeedbackInput, type FeedbackOptions, type FeedbackType, KeyboardSensor, type KeyboardSensorOptions, PointerActivationConstraints, PointerSensor, type PointerSensorOptions, PreventSelection, ScrollListener, Scroller, type Sensors, StyleInjector, type Transition, defaultPreset };
