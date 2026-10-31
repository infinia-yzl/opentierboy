import { Position, Coordinates, Shape, Alignment } from '@dnd-kit/geometry';
import { Effect, CleanupFunction, WithHistory } from '@dnd-kit/state';

/**
 * Type representing arbitrary data associated with an entity.
 *
 * @remarks
 * This type is used to store additional information about entities
 * that can be accessed during drag and drop operations.
 */
type Data = Record<string, any>;
/**
 * Type representing a unique identifier for an entity.
 *
 * @remarks
 * This type is used to uniquely identify draggable and droppable entities
 * within the drag and drop system.
 */
type UniqueIdentifier = string | number;
/**
 * Type representing the type of an entity.
 *
 * @remarks
 * This type is used to categorize entities and can be used to
 * implement type-based filtering or matching.
 */
type Type = Symbol | string | number;

interface Input$2<T extends Data = Data> {
    /**
     * The unique identifier of the entity.
     */
    id: UniqueIdentifier;
    /**
     * Optional data associated with the entity.
     */
    data?: T;
    /**
     * Whether the entity should initially be disabled.
     * @default false
     */
    disabled?: boolean;
    /**
     * Whether the entity should be automatically registered with the manager when it is created.
     * @default true
     */
    register?: boolean;
    /**
     * An array of effects that are set up when the entity is registered and cleaned up when it is unregistered.
     */
    effects?(): Effect[];
}
/**
 * The `Entity` class is an abstract representation of a distinct unit in the drag and drop system.
 * It is a base class that other concrete classes like `Draggable` and `Droppable` can extend.
 *
 * @template T - The type of data associated with the entity.
 */
declare class Entity<T extends Data = Data, U extends DragDropManager<any, any> = DragDropManager<any, any>> {
    #private;
    static pendingIdChanges: Map<Entity, UniqueIdentifier> | null;
    /**
     * Creates a new instance of the `Entity` class.
     *
     * @param input - An object containing the initial properties of the entity.
     * @param manager - The manager that controls the drag and drop operations.
     */
    constructor(input: Input$2<T>, manager: U | undefined);
    /**
     * The manager that controls the drag and drop operations.
     */
    accessor manager: U | undefined;
    get id(): UniqueIdentifier;
    set id(value: UniqueIdentifier);
    /**
     * The data associated with the entity.
     */
    accessor data: T;
    /**
     * A boolean indicating whether the entity is disabled.
     */
    accessor disabled: boolean;
    /**
     * An array of effects that are applied to the entity.
     */
    effects: () => Effect[];
    /**
     * A method that registers the entity with the manager.
     * @returns CleanupFunction | void
     */
    register(): CleanupFunction | void;
    /**
     * A method that unregisters the entity from the manager.
     * @returns void
     */
    unregister(): void;
    /**
     * A method that cleans up the entity when it is no longer needed.
     * @returns void
     */
    destroy(): void;
}

/**
 * Reactive class representing a registry for entities.
 * @template T - The type of entries that the registry manages,
 * for example, `Draggable` or `Droppable` entities.
 */
declare class EntityRegistry<T extends Entity> {
    private map;
    private cleanupFunctions;
    /**
     * Iterator for the EntityRegistry class.
     * @returns An iterator for the values in the map.
     */
    [Symbol.iterator](): MapIterator<T>;
    get value(): MapIterator<T>;
    /**
     * Checks if a entity with the given identifier exists in the registry.
     * @param identifier - The unique identifier of the entity.
     * @returns True if the entity exists, false otherwise.
     */
    has(identifier: UniqueIdentifier): boolean;
    /**
     * Retrieves a entity from the registry using its identifier.
     * @param identifier - The unique identifier of the entity.
     * @returns The entity if it exists, undefined otherwise.
     */
    get(identifier: UniqueIdentifier): T | undefined;
    /**
     * Registers a entity in the registry.
     * @param key - The unique identifier of the entity.
     * @param value - The entity to register.
     * @returns A function that unregisters the entity.
     */
    register: (key: UniqueIdentifier, value: T) => () => void;
    /**
     * Unregisters an entity from the registry.
     * @param key - The unique identifier of the entity.
     * @param value - The entity instance to unregister.
     */
    unregister: (key: UniqueIdentifier, value: T) => void;
    /**
     * Destroys all entries in the registry and clears the registry.
     */
    destroy(): void;
}

/** Base type for plugin options */
type PluginOptions = Record<string, any>;
/**
 * Constructor type for plugins.
 *
 * @template T - The type of drag and drop manager
 * @template U - The type of plugin instance
 * @template V - The type of plugin options
 */
interface PluginConstructor<T extends DragDropManager<any, any> = DragDropManager<any, any>, U extends Plugin<T> = Plugin<T>, V extends PluginOptions = InferPluginOptions<U>> {
    /** Creates a new plugin instance */
    new (manager: T, options?: V): U;
}
/**
 * Descriptor type for plugins.
 *
 * @template T - The type of drag and drop manager
 * @template U - The type of plugin instance
 * @template V - The type of plugin constructor
 */
type PluginDescriptor<T extends DragDropManager<any, any> = DragDropManager<any, any>, U extends Plugin<T> = Plugin<T>, V extends PluginConstructor<T, U> = PluginConstructor<T, U>> = {
    /** The plugin constructor */
    plugin: V;
    /** Optional configuration for the plugin */
    options?: InferPluginOptions<U>;
};
/**
 * Array type for plugin constructors or descriptors.
 *
 * @template T - The type of drag and drop manager
 */
type Plugins<T extends DragDropManager<any, any> = DragDropManager<any, any>> = (PluginConstructor<T> | PluginDescriptor<T>)[];
/**
 * Infers the options type from a plugin constructor or instance.
 *
 * @template P - The plugin constructor or instance type
 */
type InferPluginOptions<P> = P extends PluginConstructor<any, any, infer T> ? T : P extends Plugin<any, infer T> ? T : never;

/**
 * Base class for plugins that extend drag and drop functionality.
 *
 * @template T - The type of drag and drop manager
 * @template U - The type of plugin options
 *
 * @remarks
 * Plugins can add new features and behaviors to the drag and drop system
 * by extending this class and implementing custom functionality.
 */
declare abstract class Plugin<T extends DragDropManager<any, any> = DragDropManager<any, any>, U extends PluginOptions = PluginOptions> {
    #private;
    manager: T;
    options?: U | undefined;
    /**
     * Creates a new plugin instance.
     *
     * @param manager - The drag and drop manager that owns this plugin
     * @param options - Optional configuration for the plugin
     */
    constructor(manager: T, options?: U | undefined);
    /**
     * Whether the plugin instance is disabled.
     *
     * @remarks
     * This property is reactive and triggers effects when accessed.
     */
    accessor disabled: boolean;
    /**
     * Enables a disabled plugin instance.
     *
     * @remarks
     * This method triggers effects when called.
     */
    enable(): void;
    /**
     * Disables an enabled plugin instance.
     *
     * @remarks
     * This method triggers effects when called.
     */
    disable(): void;
    /**
     * Checks if the plugin instance is disabled.
     *
     * @returns true if the plugin is disabled
     * @remarks
     * This method does not trigger effects when accessed.
     */
    isDisabled(): boolean;
    /**
     * Configures a plugin instance with new options.
     *
     * @param options - The new options to apply
     */
    configure(options?: U): void;
    /**
     * Registers an effect that will be cleaned up when the plugin is destroyed.
     *
     * @param callback - The effect callback to register
     * @returns A function to dispose of the effect
     */
    protected registerEffect(callback: () => void): CleanupFunction;
    /**
     * Destroys a plugin instance and cleans up its resources.
     *
     * @remarks
     * This method:
     * - Calls all registered cleanup functions
     * - Should be overridden by subclasses to clean up additional resources
     */
    destroy(): void;
    /**
     * Configures a plugin constructor with options.
     *
     * @param options - The options to configure the constructor with
     * @returns The configured plugin constructor
     *
     * @remarks
     * This method is used to configure the options that the
     * plugin constructor will use to create plugin instances.
     */
    static configure(options: PluginOptions): PluginDescriptor<any, any, any>;
}
/**
 * Base class for core plugins that ship with the library.
 *
 * @template T - The type of drag and drop manager
 * @template U - The type of plugin options
 */
declare class CorePlugin<T extends DragDropManager<any, any> = DragDropManager<any, any>, U extends PluginOptions = PluginOptions> extends Plugin<T, U> {
}

/**
 * Manages the registration and lifecycle of plugin instances.
 *
 * @template T - The type of drag and drop manager
 * @template W - The type of plugin constructor
 * @template U - The type of plugin instance
 */
declare class PluginRegistry<T extends DragDropManager<any, any>, W extends PluginConstructor<T> = PluginConstructor<T>, U extends Plugin<T> = InstanceType<W>> {
    #private;
    private manager;
    private instances;
    /**
     * Creates a new plugin registry.
     *
     * @param manager - The drag and drop manager that owns this registry
     */
    constructor(manager: T);
    /**
     * Gets all registered plugin instances.
     *
     * @returns An array of all active plugin instances
     */
    get values(): U[];
    /**
     * Sets the list of plugins to be used by the registry.
     *
     * @param entries - Array of plugin constructors or descriptors
     * @remarks
     * This method:
     * - Filters out duplicate plugins
     * - Unregisters plugins that are no longer in use
     * - Registers new plugins with their options
     */
    set values(entries: Plugins<T>);
    /**
     * Gets a plugin instance by its constructor.
     *
     * @param plugin - The plugin constructor to look up
     * @returns The plugin instance or undefined if not found
     */
    get<X extends W>(plugin: X): InstanceType<X> | undefined;
    /**
     * Registers a new plugin instance.
     *
     * @param plugin - The plugin constructor to register
     * @param options - Optional configuration for the plugin
     * @returns The registered plugin instance
     * @remarks
     * If the plugin is already registered, its options will be updated
     * and the existing instance will be returned.
     */
    register<X extends W>(plugin: X, options?: InferPluginOptions<X>): InstanceType<X>;
    /**
     * Unregisters a plugin instance.
     *
     * @param plugin - The plugin constructor to unregister
     * @remarks
     * This method:
     * - Destroys the plugin instance
     * - Removes it from the registry
     */
    unregister<X extends W>(plugin: X): void;
    /**
     * Destroys all registered plugin instances.
     *
     * @remarks
     * This method:
     * - Calls destroy() on all plugin instances
     * - Clears the registry
     */
    destroy(): void;
}

/**
 * Creates a plugin descriptor with the given plugin constructor and options.
 *
 * @template T - The plugin constructor type
 * @template V - The plugin options type
 * @param plugin - The plugin constructor
 * @param options - The plugin configuration options
 * @returns A plugin descriptor containing the constructor and options
 */
declare function configure<T extends PluginConstructor<any, any, any>, V extends PluginOptions = InferPluginOptions<T>>(plugin: T, options: V): PluginDescriptor<any, any, T>;
/**
 * Creates a configurator function for a specific plugin constructor.
 *
 * @template T - The plugin constructor type
 * @param plugin - The plugin constructor to configure
 * @returns A function that takes options and returns a plugin descriptor
 */
declare function configurator<T extends PluginConstructor<any, any, any>>(plugin: T): (options: InferPluginOptions<T>) => PluginDescriptor<any, Plugin<any, InferPluginOptions<T>>, T>;
/**
 * Normalizes a plugin constructor or descriptor into a descriptor.
 *
 * @template T - The plugin constructor type
 * @param plugin - Either a plugin constructor or a plugin descriptor
 * @returns A plugin descriptor
 */
declare function descriptor<T extends PluginConstructor<any, any, any>>(plugin: T | PluginDescriptor<any, any, T>): PluginDescriptor<any, any, T>;

/**
 * Enum representing the possible states of a drag operation.
 */
declare enum StatusValue {
    /** No drag operation is in progress */
    Idle = "idle",
    /** A drag operation is about to start */
    InitializationPending = "initialization-pending",
    /** A drag operation is being initialized */
    Initializing = "initializing",
    /** A drag operation is in progress */
    Dragging = "dragging",
    /** A drag operation has completed */
    Dropped = "dropped"
}
/**
 * Manages the status of a drag operation.
 *
 * @remarks
 * This class provides reactive accessors for checking the current state
 * of a drag operation and methods for updating it.
 */
declare class Status {
    /** The current status value */
    private accessor value;
    /**
     * Gets the current status value.
     *
     * @returns The current status value
     */
    get current(): StatusValue;
    /**
     * Checks if the status is idle.
     *
     * @returns true if no drag operation is in progress
     */
    get idle(): boolean;
    /**
     * Checks if the status is initialization-pending.
     *
     * @returns true if a drag operation is about to start
     */
    get initializationPending(): boolean;
    /**
     * Checks if the status is initializing.
     *
     * @returns true if a drag operation is being initialized
     */
    get initializing(): boolean;
    /**
     * Checks if the status is initialized.
     *
     * @returns true if a drag operation has started initialization
     */
    get initialized(): boolean;
    /**
     * Checks if the status is dragging.
     *
     * @returns true if a drag operation is in progress
     */
    get dragging(): boolean;
    /**
     * Checks if the status is dropped.
     *
     * @returns true if a drag operation has completed
     */
    get dropped(): boolean;
    /**
     * Sets the current status value.
     *
     * @param value - The new status value
     */
    set(value: StatusValue): void;
}

interface DragOperationSnapshot<T extends Draggable = Draggable, U extends Droppable = Droppable> {
    readonly activatorEvent: Event | null;
    readonly canceled: boolean;
    readonly position: Position;
    readonly transform: Coordinates;
    readonly status: Status;
    get shape(): WithHistory<Shape> | null;
    set shape(value: Shape | null);
    readonly source: T | null;
    readonly target: U | null;
}
/**
 * Represents the current state of a drag operation.
 *
 * @template T - The type of draggable entities
 * @template U - The type of droppable entities
 */
declare class DragOperation<T extends Draggable, U extends Droppable> implements DragOperationSnapshot<T, U> {
    #private;
    /**
     * Creates a new drag operation instance.
     *
     * @param manager - The drag and drop manager that owns this operation
     */
    constructor(manager: DragDropManager<T, U>);
    /** Current status of the drag operation */
    readonly status: Status;
    /** The controller for the currentdrag operation */
    controller: AbortController | undefined;
    /**
     * Gets the current shape of the dragged entity with history.
     *
     * @returns The shape history or null if no shape is set
     */
    get shape(): WithHistory<Shape> | null;
    /**
     * Sets the shape of the dragged entity.
     *
     * @param value - The new shape or null to reset
     */
    set shape(value: Shape | null);
    /** Whether the drag operation was canceled */
    accessor canceled: boolean;
    /**
     * OpenTierBoy fork: true from the moment the drag stops (before `dragend` is dispatched)
     * until the operation resets. Droppables stop tracking their positions then, because the
     * page changes at the drop and collisions no longer matter.
     */
    accessor ending: boolean;
    /** The event that initiated the drag operation */
    accessor activatorEvent: Event | null;
    /** Unique identifier of the source draggable entity */
    accessor sourceIdentifier: UniqueIdentifier | null;
    /** Unique identifier of the target droppable entity */
    accessor targetIdentifier: UniqueIdentifier | null;
    /** List of modifiers applied to the drag operation */
    accessor modifiers: Modifier[];
    /** Current position of the dragged entity */
    position: Position;
    /**
     * Gets the source draggable entity.
     *
     * @returns The current draggable entity, falling back to the previous
     * instance to bridge the gap when React unmounts and remounts a sortable
     * during reparenting (e.g. moving an item between columns).
     */
    get source(): T | null;
    /**
     * Gets the target droppable entity.
     *
     * @returns The current droppable entity or null if not found
     */
    get target(): U | null;
    /**
     * Gets the current transform after applying all modifiers.
     *
     * @returns The transformed coordinates
     */
    get transform(): {
        x: number;
        y: number;
    };
    /**
     * Creates a snapshot of the current drag operation state.
     *
     * @returns An immutable snapshot of the current operation state
     */
    snapshot(): DragOperationSnapshot<T, U>;
    /**
     * Resets the drag operation to its initial state.
     *
     * @remarks
     * This method:
     * - Sets status to idle
     * - Clears source and target identifiers
     * - Resets shape history
     * - Resets position and transform
     * - Clears modifiers
     */
    reset(): void;
}

/** Options that can be passed to a modifier */
type ModifierOptions = PluginOptions;
/**
 * Base class for drag operation modifiers.
 *
 * @template T - The type of drag and drop manager
 * @template U - The type of modifier options
 *
 * @remarks
 * Modifiers can transform the coordinates of a drag operation,
 * enabling features like snapping, constraints, and custom behaviors.
 */
declare class Modifier<T extends DragDropManager<any, any> = DragDropManager<any, any>, U extends ModifierOptions = ModifierOptions> extends Plugin<T, U> {
    manager: T;
    options?: U | undefined;
    /**
     * Creates a new modifier instance.
     *
     * @param manager - The drag and drop manager that owns this modifier
     * @param options - Optional configuration for the modifier
     */
    constructor(manager: T, options?: U | undefined);
    /**
     * Applies the modifier to the current drag operation.
     *
     * @param operation - The current state of the drag operation
     * @returns The transformed coordinates
     *
     * @remarks
     * Override this method to implement custom transformation logic.
     * The default implementation returns the original transform unchanged.
     */
    apply(operation: DragOperationSnapshot<any, any>): Coordinates;
}
/**
 * Constructor type for modifiers.
 *
 * @template T - The type of drag and drop manager
 */
type ModifierConstructor<T extends DragDropManager<any, any> = DragDropManager<any, any>> = PluginConstructor<T, Modifier<T, any>>;
/**
 * Descriptor type for modifiers.
 *
 * @template T - The type of drag and drop manager
 */
type ModifierDescriptor<T extends DragDropManager<any, any> = DragDropManager<any, any>> = PluginDescriptor<T, Modifier<T, any>, ModifierConstructor<T>>;
/**
 * Array type for modifier constructors or descriptors.
 *
 * @template T - The type of drag and drop manager
 */
type Modifiers<T extends DragDropManager<any, any> = DragDropManager<any, any>> = (ModifierConstructor<T> | ModifierDescriptor<T>)[];

/**
 * Options that can be passed to a sensor.
 * Extends the base PluginOptions type.
 */
type SensorOptions = PluginOptions;
/**
 * Abstract base class for all sensor implementations.
 *
 * @template T - The type of drag drop manager
 * @template U - The type of sensor options
 *
 * @remarks
 * Sensors are responsible for detecting and initiating drag operations.
 * They handle the actual user interaction (mouse, touch, keyboard, etc.)
 * and translate those interactions into drag operations.
 */
declare abstract class Sensor<T extends DragDropManager<any, any> = DragDropManager<Draggable, Droppable>, U extends SensorOptions = SensorOptions> extends Plugin<T, U> {
    manager: T;
    options?: U | undefined;
    /**
     * Creates a new sensor instance.
     *
     * @param manager - The drag drop manager instance
     * @param options - Optional sensor configuration
     */
    constructor(manager: T, options?: U | undefined);
    /**
     * Binds the sensor to a draggable source.
     *
     * @param source - The draggable element to bind to
     * @param options - Optional sensor options specific to this draggable
     * @returns A cleanup function to unbind the sensor
     */
    abstract bind(source: Draggable, options?: U): CleanupFunction;
}
/**
 * Constructor type for creating sensor instances.
 *
 * @template T - The type of drag drop manager
 */
type SensorConstructor<T extends DragDropManager<any, any> = DragDropManager<any, any>> = PluginConstructor<T, Sensor<T>>;
/**
 * Descriptor type for configuring sensors.
 *
 * @template T - The type of drag drop manager
 */
type SensorDescriptor<T extends DragDropManager<any, any> = DragDropManager<any, any>> = PluginDescriptor<T, Sensor<T>, SensorConstructor<T>>;
/**
 * Array type for multiple sensor configurations.
 *
 * @template T - The type of drag drop manager
 */
type Sensors<T extends DragDropManager<any, any> = DragDropManager<any, any>> = (SensorConstructor<T> | SensorDescriptor<T>)[];

/**
 * Input configuration for creating a draggable entity.
 *
 * @template T - The type of data associated with the draggable
 *
 * @remarks
 * Extends the base entity input with draggable-specific configuration:
 * - Type for categorization
 * - Sensors for handling drag interactions
 * - Modifiers for transforming drag behavior
 * - Alignment for positioning
 */
interface Input$1<T extends Data = Data> extends Input$2<T> {
    type?: Type;
    sensors?: Sensors;
    modifiers?: Modifiers;
    alignment?: Alignment;
    plugins?: Plugins;
}
/**
 * Possible status values for a draggable entity.
 *
 * @remarks
 * - idle: Not being dragged
 * - dragging: Currently being dragged
 * - dropping: Currently being dropped
 */
type DraggableStatus = 'idle' | 'dragging' | 'dropping';
/**
 * Represents an entity that can be dragged in a drag and drop operation.
 *
 * @template T - The type of data associated with the draggable
 * @template U - The type of drag and drop manager
 *
 * @remarks
 * This class extends the base Entity class with draggable-specific functionality:
 * - Type-based categorization
 * - Sensor-based interaction handling
 * - Modifier-based behavior transformation
 * - Status tracking during drag operations
 */
declare class Draggable<T extends Data = Data, U extends DragDropManager<any, any> = DragDropManager<any, any>> extends Entity<T, U> {
    constructor({ modifiers, type, sensors, plugins, effects, ...input }: Input$1<T>, manager: U | undefined);
    /** The type of the draggable entity */
    accessor type: Type | undefined;
    /** The sensors associated with the draggable entity */
    sensors: Sensors | undefined;
    /** The modifiers associated with the draggable entity */
    accessor modifiers: Modifiers | undefined;
    /** The alignment of the draggable entity */
    alignment: Alignment | undefined;
    /** Per-entity plugin configuration descriptors */
    plugins: Plugins | undefined;
    /**
     * Look up per-entity options for a given plugin constructor.
     */
    pluginConfig<P extends PluginConstructor>(plugin: P): PluginDescriptor<any, any, P>['options'] | undefined;
    /** The current status of the draggable entity */
    accessor status: DraggableStatus;
    /**
     * Checks if the draggable entity is currently being dropped.
     *
     * @returns true if the entity is being dropped and is the drag source
     */
    get isDropping(): boolean;
    /**
     * Checks if the draggable entity is currently being dragged.
     *
     * @returns true if the entity is being dragged and is the drag source
     */
    get isDragging(): boolean;
    /**
     * Checks if the draggable entity is the source of the current drag operation.
     *
     * @returns true if the entity's ID matches the current drag operation's source ID
     */
    get isDragSource(): boolean;
}

/**
 * Priority levels for collision detection.
 *
 * @remarks
 * Higher priority collisions take precedence over lower priority ones.
 * Custom numeric priorities can also be used for fine-grained control.
 */
declare enum CollisionPriority {
    /** Lowest priority level */
    Lowest = 0,
    /** Low priority level */
    Low = 1,
    /** Normal priority level */
    Normal = 2,
    /** High priority level */
    High = 3,
    /** Highest priority level */
    Highest = 4
}
/**
 * Types of collision detection.
 *
 * @remarks
 * Different collision types can be used to implement various
 * drag and drop behaviors and visual feedback.
 */
declare enum CollisionType {
    /** Basic collision detection */
    Collision = 0,
    /** Shape-based intersection detection */
    ShapeIntersection = 1,
    /** Pointer-based intersection detection */
    PointerIntersection = 2
}
/**
 * Represents a detected collision between a draggable and droppable.
 *
 * @remarks
 * Contains information about the collision type, priority, and
 * additional data that can be used for custom behaviors.
 */
interface Collision {
    /** Unique identifier of the droppable involved in the collision */
    id: UniqueIdentifier;
    /** Priority of the collision */
    priority: CollisionPriority | number;
    /** Type of collision detected */
    type: CollisionType;
    /** Numeric value representing the collision strength or overlap */
    value: number;
    /** Additional data associated with the collision */
    data?: Record<string, any>;
}
/** Array of detected collisions */
type Collisions = Collision[];
/**
 * Input for collision detection functions.
 *
 * @template T - The type of draggable entities
 * @template U - The type of droppable entities
 */
interface CollisionDetectorInput<T extends Draggable = Draggable, U extends Droppable = Droppable> {
    /** The droppable to check for collisions */
    droppable: U;
    /** The current drag operation state */
    dragOperation: DragOperationSnapshot<T, U>;
}
/**
 * Function type for detecting collisions between draggables and droppables.
 *
 * @template T - The type of draggable entities
 * @template U - The type of droppable entities
 * @param input - The collision detection input
 * @returns A collision object if detected, null otherwise
 */
type CollisionDetector = <T extends Draggable = Draggable, U extends Droppable = Droppable>(input: CollisionDetectorInput<T, U>) => Collision | null;

/**
 * Observes and manages collision detection between draggable and droppable elements.
 *
 * @template T - The type of draggable entities
 * @template U - The type of droppable entities
 * @template V - The type of drag drop manager
 *
 * @remarks
 * The CollisionObserver is responsible for:
 * - Computing collisions between draggable and droppable elements
 * - Maintaining a signal of current collisions
 * - Updating collision state based on drag operation changes
 */
declare class CollisionObserver<T extends Draggable = Draggable, U extends Droppable = Droppable, V extends DragDropManager<T, U> = DragDropManager<T, U>> extends Plugin<V> {
    #private;
    /**
     * Creates a new CollisionObserver instance.
     *
     * @param manager - The drag drop manager instance
     */
    constructor(manager: V);
    /**
     * Forces an immediate update of collision detection.
     *
     * @param immediate - If true, updates collisions immediately. If false, resets previous coordinates.
     */
    forceUpdate(immediate?: boolean): void;
    /**
     * Computes collisions between draggable and droppable elements.
     *
     * @param entries - Optional array of droppable elements to check. If not provided, uses all registered droppables.
     * @param collisionDetector - Optional custom collision detector function
     * @returns Array of detected collisions, sorted by priority
     */
    computeCollisions(entries?: Droppable[], collisionDetector?: CollisionDetector): Collisions;
    /**
     * Gets the current collisions signal value.
     */
    get collisions(): Collisions;
}

/**
 * Sort collisions from greatest to smallest priority
 * Collisions of equal priority are sorted from greatest to smallest value
 */
declare function sortCollisions(a: Collision, b: Collision): number;

/**
 * Input configuration for creating a droppable entity.
 *
 * @template T - The type of data associated with the droppable
 *
 * @remarks
 * Extends the base entity input with droppable-specific configuration:
 * - Accept rules for determining compatible draggables
 * - Collision detection configuration
 * - Type for categorization
 */
interface Input<T extends Data = Data> extends Input$2<T> {
    /** Types of draggables that can be dropped here, or a function to determine compatibility */
    accept?: Type | Type[] | ((source: Draggable) => boolean);
    /** Priority for collision detection */
    collisionPriority?: CollisionPriority | number;
    /** Detector for determining collisions with draggables */
    collisionDetector: CollisionDetector;
    /** Type for categorization */
    type?: Type;
}
/**
 * Represents an entity that can receive draggable items in a drag and drop operation.
 *
 * @template T - The type of data associated with the droppable
 * @template U - The type of drag and drop manager
 *
 * @remarks
 * This class extends the base Entity class with droppable-specific functionality:
 * - Type-based acceptance rules
 * - Collision detection
 * - Shape tracking
 * - Target status tracking
 */
declare class Droppable<T extends Data = Data, U extends DragDropManager<any, any> = DragDropManager<any, any>> extends Entity<T, U> {
    constructor({ accept, collisionDetector, collisionPriority, type, ...input }: Input<T>, manager: U | undefined);
    /**
     * Types of draggables that can be dropped here, or a function to determine compatibility.
     *
     * @remarks
     * If undefined, all draggables are accepted.
     * If a function, it determines compatibility based on the draggable.
     * If a type or array of types, only draggables of matching types are accepted.
     */
    accessor accept: Type | Type[] | ((draggable: Draggable) => boolean) | undefined;
    /** The type of the droppable entity */
    accessor type: Type | undefined;
    /**
     * Checks whether or not the droppable accepts a given draggable.
     *
     * @param draggable - The draggable to check
     * @returns true if the draggable can be dropped here
     */
    accepts(draggable: Draggable): boolean;
    /** The collision detector for this droppable */
    accessor collisionDetector: CollisionDetector;
    /** The collision priority for this droppable */
    accessor collisionPriority: CollisionPriority | number | undefined;
    /** The current shape of this droppable */
    accessor shape: Shape | undefined;
    /**
     * Checks if this droppable is the current drop target.
     *
     * @returns true if this droppable's ID matches the current drag operation's target ID
     */
    get isDropTarget(): boolean;
}

declare class ActivationController<E extends Event> extends AbortController {
    private constraints;
    private onActivate;
    activated: boolean;
    constructor(constraints: ActivationConstraints<E> | undefined, onActivate: (event: E) => void);
    onEvent(event: E): void;
    activate(event: E): void;
    abort(event?: E): void;
}
interface ActivationConstraintOptions {
}
declare abstract class ActivationConstraint<E extends Event = Event, O extends ActivationConstraintOptions = ActivationConstraintOptions> {
    #private;
    protected options: O;
    set controller(controller: ActivationController<E>);
    constructor(options: O);
    /**
     * Called when the activation is triggered.
     */
    activate(event: E): void;
    /**
     * Called when the activation is aborted.
     */
    abstract abort(event?: E): void;
    /**
     * Called when an input event is received by the sensor.
     * Returns `true` if this event triggers activation immediately.
     */
    abstract onEvent(event: E): void;
}
type ActivationConstraints<E extends Event> = ActivationConstraint<E>[];

/**
 * Provides actions for controlling drag and drop operations.
 *
 * @template T - The type of draggable entities
 * @template U - The type of droppable entities
 * @template V - The type of drag and drop manager
 */
declare class DragActions<T extends Draggable, U extends Droppable, V extends DragDropManager<T, U>> {
    private readonly manager;
    /**
     * Creates a new instance of drag actions.
     *
     * @param manager - The drag and drop manager instance
     */
    constructor(manager: V);
    /**
     * Sets the source of the drag operation.
     *
     * @param source - The draggable entity or its unique identifier
     */
    setDragSource(source: T | UniqueIdentifier): void;
    /**
     * Sets the target of the drop operation.
     *
     * @param identifier - The unique identifier of the droppable entity or null/undefined
     * @returns A promise that resolves to true if the drop was prevented
     */
    setDropTarget(identifier: UniqueIdentifier | null | undefined): Promise<boolean>;
    /**
     * Starts a new drag operation.
     *
     * @param args - Configuration for the drag operation
     * @param args.event - The event that initiated the drag
     * @param args.source - The source draggable entity or its identifier
     * @param args.coordinates - The initial coordinates of the drag
     * @returns true if the drag operation started successfully
     * @throws {Error} If there is no drag source or another operation is active
     */
    start(args: {
        /** The event that initiated the drag. */
        event?: Event;
        /** The source draggable entity or its identifier. */
        source?: T | UniqueIdentifier;
        /** The initial coordinates of the drag. */
        coordinates: Coordinates;
    }): AbortController;
    /**
     * Moves the dragged entity to a new position.
     *
     * @param args - Configuration for the move operation
     * @param args.by - Relative coordinates to move by
     * @param args.to - Absolute coordinates to move to
     * @param args.event - The event that triggered the move
     * @param args.cancelable - Whether the move can be canceled
     * @param args.propagate - Whether to dispatch dragmove events
     */
    move(args: {
        /** The relative coordinates to move by. */
        by?: Coordinates;
        /** The absolute coordinates to move to. */
        to?: Coordinates;
        /** The event that triggered the move. */
        event?: Event;
        /** Whether the move can be canceled. */
        cancelable?: boolean;
        /** Whether to propagate the dragmove event to the manager. */
        propagate?: boolean;
    }): void;
    /**
     * Stops the current drag operation.
     *
     * @param args - Configuration for stopping the operation
     * @param args.event - The event that triggered the stop
     * @param args.canceled - Whether the operation was canceled
     * @remarks
     * This method:
     * - Dispatches a dragend event
     * - Allows suspension of the operation
     * - Handles cleanup of the operation state
     */
    stop(args?: {
        /**
         * The event that triggered the stop.
         */
        event?: Event;
        /**
         * Whether the operation was canceled.
         *
         * @default false
         */
        canceled?: boolean;
    }): void;
}

/**
 * Manages the registration and lifecycle of draggable and droppable entities,
 * as well as plugins, sensors, and modifiers.
 *
 * @template T - The type of draggable entities
 * @template U - The type of droppable entities
 * @template V - The type of drag and drop manager
 */
declare class DragDropRegistry<T extends Draggable, U extends Droppable, V extends DragDropManager<T, U>> {
    /**
     * Creates a new registry instance.
     *
     * @param manager - The drag and drop manager that owns this registry
     */
    constructor(manager: V);
    /** Registry for draggable entities */
    draggables: EntityRegistry<T>;
    /** Registry for droppable entities */
    droppables: EntityRegistry<U>;
    /** Registry for plugins */
    plugins: PluginRegistry<V, PluginConstructor<V>>;
    /** Registry for sensors */
    sensors: PluginRegistry<V, SensorConstructor<V>>;
    /** Registry for modifiers */
    modifiers: PluginRegistry<V, ModifierConstructor<V>>;
    /**
     * Registers a new entity, plugin, sensor, or modifier.
     *
     * @param input - The entity, plugin constructor, sensor constructor, or modifier constructor to register
     * @param options - Optional configuration for plugins and sensors
     * @returns A cleanup function or the registered instance
     * @throws {Error} If the input type is invalid
     */
    register(input: Entity): () => void;
    register(input: Draggable): () => void;
    register(input: Droppable): () => void;
    register(input: SensorConstructor, options?: SensorOptions): Sensor;
    register(input: ModifierConstructor): Modifier;
    register(input: PluginConstructor, options?: PluginOptions): Plugin;
    /**
     * Unregisters an entity, plugin, sensor, or modifier.
     *
     * @param input - The entity, plugin constructor, sensor constructor, or modifier constructor to unregister
     * @returns A cleanup function
     * @throws {Error} If the input type is invalid
     */
    unregister(input: Entity): CleanupFunction;
    unregister(input: Draggable): CleanupFunction;
    unregister(input: Droppable): CleanupFunction;
    unregister(input: SensorConstructor): CleanupFunction;
    unregister(input: ModifierConstructor): CleanupFunction;
    unregister(input: PluginConstructor): CleanupFunction;
    /**
     * Destroys all registered entities and cleans up resources.
     *
     * @remarks
     * This method:
     * - Destroys all draggable and droppable entities
     * - Destroys all plugins, sensors, and modifiers
     * - Cleans up any associated resources
     */
    destroy(): void;
}

/** Base type for event handler functions */
type Events = Record<string, (...args: any[]) => void>;
/**
 * Extends an event type with preventable functionality.
 *
 * @template T - The base event type
 */
type Preventable<T> = T & {
    /** Whether the event can be canceled */
    cancelable: boolean;
    /** Whether the default action was prevented */
    defaultPrevented: boolean;
    /** Prevents the default action of the event */
    preventDefault(): void;
};
/**
 * Base class for event monitoring and dispatching.
 *
 * @template T - The type of events to monitor
 */
declare class Monitor<T extends Events> {
    private registry;
    /**
     * Adds an event listener for the specified event type.
     *
     * @param name - The name of the event to listen for
     * @param handler - The function to call when the event occurs
     * @returns A function to remove the event listener
     */
    addEventListener<U extends keyof T>(name: U, handler: T[U]): () => void;
    /**
     * Removes an event listener for the specified event type.
     *
     * @param name - The name of the event
     * @param handler - The function to remove
     */
    removeEventListener(name: keyof T, handler: T[keyof T]): void;
    /**
     * Dispatches an event to all registered listeners.
     *
     * @param name - The name of the event to dispatch
     * @param args - Arguments to pass to the event handlers
     */
    protected dispatch<U extends keyof T>(name: U, ...args: any[]): void;
}
/**
 * Map of drag and drop event objects, keyed by event name.
 * Follows the same pattern as the DOM's `WindowEventMap`.
 *
 * @template T - The type of draggable entities
 * @template U - The type of droppable entities
 * @template V - The type of drag and drop manager
 */
type DragDropEventMap<T extends Draggable, U extends Droppable, V extends DragDropManager<T, U>> = {
    /** Event fired when collisions are detected */
    collision: Preventable<{
        collisions: Collisions;
    }>;
    /** Event fired before a drag operation starts */
    beforedragstart: Preventable<{
        operation: DragOperationSnapshot<T, U>;
        nativeEvent?: Event;
    }>;
    /** Event fired when a drag operation starts */
    dragstart: {
        cancelable: false;
        operation: DragOperationSnapshot<T, U>;
        nativeEvent?: Event;
    };
    /** Event fired when a drag operation moves */
    dragmove: Preventable<{
        operation: DragOperationSnapshot<T, U>;
        to?: Coordinates;
        by?: Coordinates;
        nativeEvent?: Event;
    }>;
    /** Event fired when a drag operation hovers over a droppable */
    dragover: Preventable<{
        operation: DragOperationSnapshot<T, U>;
    }>;
    /** Event fired when a drag operation ends */
    dragend: {
        operation: DragOperationSnapshot<T, U>;
        nativeEvent?: Event;
        canceled: boolean;
        suspend(): {
            resume(): void;
            abort(): void;
        };
    };
};
/**
 * Map of drag and drop event handler signatures, keyed by event name.
 * Each handler receives the event object and the manager instance.
 * Derived from `DragDropEventMap`.
 *
 * @template T - The type of draggable entities
 * @template U - The type of droppable entities
 * @template V - The type of drag and drop manager
 */
type DragDropEventHandlers<T extends Draggable, U extends Droppable, V extends DragDropManager<T, U>> = {
    [K in keyof DragDropEventMap<T, U, V>]: (event: DragDropEventMap<T, U, V>[K], manager: V) => void;
};
type CollisionEvent<T extends Draggable = Draggable, U extends Droppable = Droppable, V extends DragDropManager<T, U> = DragDropManager<T, U>> = DragDropEventMap<T, U, V>['collision'];
type BeforeDragStartEvent<T extends Draggable = Draggable, U extends Droppable = Droppable, V extends DragDropManager<T, U> = DragDropManager<T, U>> = DragDropEventMap<T, U, V>['beforedragstart'];
type DragStartEvent<T extends Draggable = Draggable, U extends Droppable = Droppable, V extends DragDropManager<T, U> = DragDropManager<T, U>> = DragDropEventMap<T, U, V>['dragstart'];
type DragMoveEvent<T extends Draggable = Draggable, U extends Droppable = Droppable, V extends DragDropManager<T, U> = DragDropManager<T, U>> = DragDropEventMap<T, U, V>['dragmove'];
type DragOverEvent<T extends Draggable = Draggable, U extends Droppable = Droppable, V extends DragDropManager<T, U> = DragDropManager<T, U>> = DragDropEventMap<T, U, V>['dragover'];
type DragEndEvent<T extends Draggable = Draggable, U extends Droppable = Droppable, V extends DragDropManager<T, U> = DragDropManager<T, U>> = DragDropEventMap<T, U, V>['dragend'];
/**
 * Monitors and dispatches drag and drop events.
 *
 * @template T - The type of draggable entities
 * @template U - The type of droppable entities
 * @template V - The type of drag and drop manager
 */
declare class DragDropMonitor<T extends Draggable, U extends Droppable, V extends DragDropManager<T, U>> extends Monitor<DragDropEventHandlers<T, U, V>> {
    private manager;
    /**
     * Creates a new drag and drop monitor.
     *
     * @param manager - The drag and drop manager to monitor
     */
    constructor(manager: V);
    /**
     * Dispatches a drag and drop event.
     *
     * @param type - The type of event to dispatch
     * @param event - The event data to dispatch
     */
    dispatch<Key extends keyof DragDropEventMap<T, U, V>>(type: Key, event: DragDropEventMap<T, U, V>[Key]): void;
}

/**
 * Interface for handling visual feedback during drag operations.
 *
 * @remarks
 * Implementations of this interface are responsible for managing
 * the visual state of dragged elements and ensuring smooth animations.
 */
interface Renderer {
    /**
     * Gets a promise that resolves when the current rendering operation is complete.
     *
     * @returns A promise that resolves when rendering is finished
     */
    get rendering(): Promise<void>;
}

/**
 * A value that can be provided as-is or as a function that receives defaults.
 *
 * @example
 * // As a plain array (replaces defaults)
 * plugins: [MyPlugin]
 *
 * // As a function (receives defaults)
 * plugins: (defaults) => [...defaults, MyPlugin]
 */
type Customizable<T> = T | ((defaults: T) => T);
/**
 * Resolves a customizable value by applying it to defaults.
 *
 * @param value - A value or function that receives defaults
 * @param defaults - The default value to use when undefined, or to pass to a function
 * @returns The resolved value
 */
declare function resolveCustomizable<T>(value: Customizable<T> | undefined, defaults: T): T;
type DragDropManagerInput<T extends DragDropManager<any, any>> = {
    plugins?: Customizable<Plugins<T>>;
    sensors?: Customizable<Sensors<T>>;
    modifiers?: Customizable<Modifiers<T>>;
    renderer?: Renderer;
};
/**
 * Central manager class that orchestrates drag and drop operations.
 *
 * @template T - The type of draggable entities
 * @template U - The type of droppable entities
 */
declare class DragDropManager<T extends Draggable, U extends Droppable> {
    /** Actions that can be performed during drag operations */
    actions: DragActions<T, U, DragDropManager<T, U>>;
    /** Observes and manages collision detection between draggable and droppable entities */
    collisionObserver: CollisionObserver<T, U>;
    /** Tracks the current drag operation state and metadata */
    dragOperation: DragOperation<T, U>;
    /** Monitors and emits drag and drop events */
    monitor: DragDropMonitor<T, U, DragDropManager<T, U>>;
    /** Registry that manages draggable and droppable entities */
    registry: DragDropRegistry<T, U, DragDropManager<T, U>>;
    /** Handles rendering of drag and drop visual feedback */
    renderer: Renderer;
    /**
     * Creates a new drag and drop manager instance.
     *
     * @param config - Optional configuration for plugins, sensors, modifiers, and renderer
     */
    constructor(config?: DragDropManagerInput<any>);
    /**
     * Gets the list of active plugins.
     *
     * @returns Array of active plugin instances
     */
    get plugins(): Plugin<any>[];
    /**
     * Sets the list of plugins to be used by the manager.
     *
     * @param plugins - Array of plugin constructors or instances
     */
    set plugins(plugins: Plugins<any>);
    /**
     * Gets the list of active modifiers.
     *
     * @returns Array of active modifier instances
     */
    get modifiers(): Modifier<any>[];
    /**
     * Sets the list of modifiers to be used by the manager.
     *
     * @param modifiers - Array of modifier constructors or instances
     */
    set modifiers(modifiers: Modifiers<any>);
    /**
     * Gets the list of active sensors.
     *
     * @returns Array of active sensor instances
     */
    get sensors(): Sensor<any>[];
    /**
     * Sets the list of sensors to be used by the manager.
     *
     * @param sensors - Array of sensor constructors or instances
     */
    set sensors(sensors: Sensors<any>);
    /**
     * Cleans up resources and stops any active drag operations.
     */
    destroy: () => void;
}

export { ActivationConstraint, type ActivationConstraints, ActivationController, type BeforeDragStartEvent, type Collision, type CollisionDetector, type CollisionEvent, CollisionPriority, CollisionType, CorePlugin, type Customizable, type Data, DragActions, type DragDropEventHandlers, type DragDropEventMap, DragDropManager, type DragDropManagerInput, type DragEndEvent, type DragMoveEvent, type DragOperationSnapshot as DragOperation, Status as DragOperationStatus, type DragOverEvent, type DragStartEvent, Draggable, type Input$1 as DraggableInput, Droppable, type Input as DroppableInput, Entity, Modifier, type ModifierConstructor, type Modifiers, Plugin, type PluginConstructor, type PluginDescriptor, type PluginOptions, PluginRegistry, type Plugins, type Renderer, Sensor, type SensorConstructor, type SensorDescriptor, type SensorOptions, type Sensors, type Type, type UniqueIdentifier, configurator, configure, descriptor, resolveCustomizable, sortCollisions };
