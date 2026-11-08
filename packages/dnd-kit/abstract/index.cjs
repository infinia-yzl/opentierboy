'use strict';

var state = require('@dnd-kit/state');
var geometry = require('@dnd-kit/geometry');

var __create = Object.create;
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : Symbol.for("Symbol." + name);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __objRest = (source, exclude) => {
  var target = {};
  for (var prop in source)
    if (__hasOwnProp.call(source, prop) && exclude.indexOf(prop) < 0)
      target[prop] = source[prop];
  if (source != null && __getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(source)) {
      if (exclude.indexOf(prop) < 0 && __propIsEnum.call(source, prop))
        target[prop] = source[prop];
    }
  return target;
};
var __decoratorStart = (base) => {
  var _a;
  return [, , , __create((_a = base == null ? void 0 : base[__knownSymbol("metadata")]) != null ? _a : null)];
};
var __decoratorStrings = ["class", "method", "getter", "setter", "accessor", "field", "value", "get", "set"];
var __expectFn = (fn) => fn !== void 0 && typeof fn !== "function" ? __typeError("Function expected") : fn;
var __decoratorContext = (kind, name, done, metadata, fns) => ({ kind: __decoratorStrings[kind], name, metadata, addInitializer: (fn) => done._ ? __typeError("Already initialized") : fns.push(__expectFn(fn || null)) });
var __decoratorMetadata = (array, target) => __defNormalProp(target, __knownSymbol("metadata"), array[3]);
var __runInitializers = (array, flags, self, value) => {
  for (var i = 0, fns = array[flags >> 1], n = fns && fns.length; i < n; i++) flags & 1 ? fns[i].call(self) : value = fns[i].call(self, value);
  return value;
};
var __decorateElement = (array, flags, name, decorators, target, extra) => {
  var fn, it, done, ctx, access, k = flags & 7, s = !!(flags & 8), p = !!(flags & 16);
  var j = k > 3 ? array.length + 1 : k ? s ? 1 : 2 : 0, key = __decoratorStrings[k + 5];
  var initializers = k > 3 && (array[j - 1] = []), extraInitializers = array[j] || (array[j] = []);
  var desc = k && (!p && !s && (target = target.prototype), k < 5 && (k > 3 || !p) && __getOwnPropDesc(k < 4 ? target : { get [name]() {
    return __privateGet(this, extra);
  }, set [name](x) {
    return __privateSet(this, extra, x);
  } }, name));
  k ? p && k < 4 && __name(extra, (k > 2 ? "set " : k > 1 ? "get " : "") + name) : __name(target, name);
  for (var i = decorators.length - 1; i >= 0; i--) {
    ctx = __decoratorContext(k, name, done = {}, array[3], extraInitializers);
    if (k) {
      ctx.static = s, ctx.private = p, access = ctx.access = { has: p ? (x) => __privateIn(target, x) : (x) => name in x };
      if (k ^ 3) access.get = p ? (x) => (k ^ 1 ? __privateGet : __privateMethod)(x, target, k ^ 4 ? extra : desc.get) : (x) => x[name];
      if (k > 2) access.set = p ? (x, y) => __privateSet(x, target, y, k ^ 4 ? extra : desc.set) : (x, y) => x[name] = y;
    }
    it = (0, decorators[i])(k ? k < 4 ? p ? extra : desc[key] : k > 4 ? void 0 : { get: desc.get, set: desc.set } : target, ctx), done._ = 1;
    if (k ^ 4 || it === void 0) __expectFn(it) && (k > 4 ? initializers.unshift(it) : k ? p ? extra = it : desc[key] = it : target = it);
    else if (typeof it !== "object" || it === null) __typeError("Object expected");
    else __expectFn(fn = it.get) && (desc.get = fn), __expectFn(fn = it.set) && (desc.set = fn), __expectFn(fn = it.init) && initializers.unshift(fn);
  }
  return k || __decoratorMetadata(array, target), desc && __defProp(target, name, desc), p ? k ^ 4 ? extra : desc : target;
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateIn = (member, obj) => Object(obj) !== obj ? __typeError('Cannot use the "in" operator on this value') : member.has(obj);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);

// src/core/plugins/utilities.ts
function configure(plugin, options) {
  return {
    plugin,
    options
  };
}
function configurator(plugin) {
  return (options) => {
    return configure(plugin, options);
  };
}
function descriptor(plugin) {
  if (typeof plugin === "function") {
    return {
      plugin,
      options: void 0
    };
  }
  return plugin;
}

// src/core/plugins/plugin.ts
var _disabled_dec, _init, _disabled, _cleanupFunctions;
_disabled_dec = [state.reactive];
var Plugin = class {
  /**
   * Creates a new plugin instance.
   *
   * @param manager - The drag and drop manager that owns this plugin
   * @param options - Optional configuration for the plugin
   */
  constructor(manager, options) {
    this.manager = manager;
    this.options = options;
    __privateAdd(this, _disabled, __runInitializers(_init, 8, this, false)), __runInitializers(_init, 11, this);
    __privateAdd(this, _cleanupFunctions, /* @__PURE__ */ new Set());
  }
  /**
   * Enables a disabled plugin instance.
   *
   * @remarks
   * This method triggers effects when called.
   */
  enable() {
    this.disabled = false;
  }
  /**
   * Disables an enabled plugin instance.
   *
   * @remarks
   * This method triggers effects when called.
   */
  disable() {
    this.disabled = true;
  }
  /**
   * Checks if the plugin instance is disabled.
   *
   * @returns true if the plugin is disabled
   * @remarks
   * This method does not trigger effects when accessed.
   */
  isDisabled() {
    return state.untracked(() => {
      return this.disabled;
    });
  }
  /**
   * Configures a plugin instance with new options.
   *
   * @param options - The new options to apply
   */
  configure(options) {
    this.options = options;
  }
  /**
   * Registers an effect that will be cleaned up when the plugin is destroyed.
   *
   * @param callback - The effect callback to register
   * @returns A function to dispose of the effect
   */
  registerEffect(callback) {
    const dispose = state.effect(callback.bind(this));
    __privateGet(this, _cleanupFunctions).add(dispose);
    return dispose;
  }
  /**
   * Destroys a plugin instance and cleans up its resources.
   *
   * @remarks
   * This method:
   * - Calls all registered cleanup functions
   * - Should be overridden by subclasses to clean up additional resources
   */
  destroy() {
    __privateGet(this, _cleanupFunctions).forEach((cleanup) => cleanup());
  }
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
  static configure(options) {
    return configure(this, options);
  }
};
_init = __decoratorStart(null);
_disabled = new WeakMap();
_cleanupFunctions = new WeakMap();
__decorateElement(_init, 4, "disabled", _disabled_dec, Plugin, _disabled);
__decoratorMetadata(_init, Plugin);
var CorePlugin = class extends Plugin {
};

// src/core/plugins/registry.ts
var _previousValues;
var PluginRegistry = class {
  /**
   * Creates a new plugin registry.
   *
   * @param manager - The drag and drop manager that owns this registry
   */
  constructor(manager) {
    this.manager = manager;
    this.instances = /* @__PURE__ */ new Map();
    __privateAdd(this, _previousValues, []);
  }
  /**
   * Gets all registered plugin instances.
   *
   * @returns An array of all active plugin instances
   */
  get values() {
    return Array.from(this.instances.values());
  }
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
  set values(entries) {
    const descriptors = entries.map(descriptor).reduce((acc, descriptor2) => {
      const existing = acc.find(({ plugin }) => plugin === descriptor2.plugin);
      if (existing) {
        existing.options = descriptor2.options;
        return acc;
      }
      return [...acc, descriptor2];
    }, []);
    const constructors = descriptors.map(({ plugin }) => plugin);
    for (const plugin of __privateGet(this, _previousValues)) {
      if (!constructors.includes(plugin)) {
        if (plugin.prototype instanceof CorePlugin) {
          continue;
        }
        this.unregister(plugin);
      }
    }
    for (const { plugin, options } of descriptors) {
      this.register(plugin, options);
    }
    __privateSet(this, _previousValues, constructors);
  }
  /**
   * Gets a plugin instance by its constructor.
   *
   * @param plugin - The plugin constructor to look up
   * @returns The plugin instance or undefined if not found
   */
  get(plugin) {
    const instance = this.instances.get(plugin);
    return instance;
  }
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
  register(plugin, options) {
    const existingInstance = this.instances.get(plugin);
    if (existingInstance) {
      if (existingInstance.options !== options) {
        existingInstance.options = options;
      }
      return existingInstance;
    }
    const instance = new plugin(this.manager, options);
    this.instances.set(plugin, instance);
    return instance;
  }
  /**
   * Unregisters a plugin instance.
   *
   * @param plugin - The plugin constructor to unregister
   * @remarks
   * This method:
   * - Destroys the plugin instance
   * - Removes it from the registry
   */
  unregister(plugin) {
    const instance = this.instances.get(plugin);
    if (instance) {
      instance.destroy();
      this.instances.delete(plugin);
    }
  }
  /**
   * Destroys all registered plugin instances.
   *
   * @remarks
   * This method:
   * - Calls destroy() on all plugin instances
   * - Clears the registry
   */
  destroy() {
    for (const plugin of this.instances.values()) {
      plugin.destroy();
    }
    this.instances.clear();
  }
};
_previousValues = new WeakMap();

// src/core/collision/utilities.ts
function sortCollisions(a, b) {
  if (a.priority === b.priority) {
    if (a.type === b.type) {
      return b.value - a.value;
    }
    return b.type - a.type;
  }
  return b.priority - a.priority;
}

// src/core/collision/observer.ts
var DEFAULT_VALUE = [];
var _previousCoordinates, _collisions;
var CollisionObserver = class extends Plugin {
  /**
   * Creates a new CollisionObserver instance.
   *
   * @param manager - The drag drop manager instance
   */
  constructor(manager) {
    super(manager);
    __privateAdd(this, _previousCoordinates);
    __privateAdd(this, _collisions);
    this.computeCollisions = this.computeCollisions.bind(this);
    __privateSet(this, _collisions, state.signal(DEFAULT_VALUE));
    this.destroy = state.effects(
      () => {
        const collisions = this.computeCollisions();
        const coordinates = state.untracked(
          () => this.manager.dragOperation.position.current
        );
        if (collisions !== DEFAULT_VALUE) {
          const previousCoordinates = __privateGet(this, _previousCoordinates);
          __privateSet(this, _previousCoordinates, coordinates);
          if (previousCoordinates && coordinates.x == previousCoordinates.x && coordinates.y == previousCoordinates.y) {
            return;
          }
        } else {
          __privateSet(this, _previousCoordinates, void 0);
        }
        __privateGet(this, _collisions).value = collisions;
      },
      () => {
        const { dragOperation } = this.manager;
        if (dragOperation.status.initialized) {
          this.forceUpdate();
        }
      }
    );
  }
  /**
   * Forces an immediate update of collision detection.
   *
   * @param immediate - If true, updates collisions immediately. If false, resets previous coordinates.
   */
  forceUpdate(immediate = true) {
    state.untracked(() => {
      if (immediate) {
        __privateGet(this, _collisions).value = this.computeCollisions();
      } else {
        __privateSet(this, _previousCoordinates, void 0);
      }
    });
  }
  /**
   * Computes collisions between draggable and droppable elements.
   *
   * @param entries - Optional array of droppable elements to check. If not provided, uses all registered droppables.
   * @param collisionDetector - Optional custom collision detector function
   * @returns Array of detected collisions, sorted by priority
   */
  computeCollisions(entries, collisionDetector) {
    const { registry, dragOperation } = this.manager;
    const { source, shape, status } = dragOperation;
    if (!status.initialized || !shape) {
      return DEFAULT_VALUE;
    }
    const collisions = [];
    const potentialTargets = [];
    for (const entry of entries != null ? entries : registry.droppables) {
      if (entry.disabled) {
        continue;
      }
      if (source && !entry.accepts(source)) {
        continue;
      }
      const detectCollision = collisionDetector != null ? collisionDetector : entry.collisionDetector;
      if (!detectCollision) {
        continue;
      }
      potentialTargets.push(entry);
      void entry.shape;
      const collision = state.untracked(
        () => detectCollision({
          droppable: entry,
          dragOperation
        })
      );
      if (collision) {
        if (entry.collisionPriority != null) {
          collision.priority = entry.collisionPriority;
        }
        collisions.push(collision);
      }
    }
    if (potentialTargets.length === 0) {
      return DEFAULT_VALUE;
    }
    collisions.sort(sortCollisions);
    return collisions;
  }
  /**
   * Gets the current collisions signal value.
   */
  get collisions() {
    return __privateGet(this, _collisions).value;
  }
};
_previousCoordinates = new WeakMap();
_collisions = new WeakMap();
var _disabled_dec2, _data_dec, _manager_dec, _Entity_static, flushIdChanges_fn, _init2, _manager, _idSignal, _data, _disabled2;
_manager_dec = [state.reactive], _data_dec = [state.reactive], _disabled_dec2 = [state.reactive];
var _Entity = class _Entity {
  /**
   * Creates a new instance of the `Entity` class.
   *
   * @param input - An object containing the initial properties of the entity.
   * @param manager - The manager that controls the drag and drop operations.
   */
  constructor(input, manager) {
    __privateAdd(this, _manager, __runInitializers(_init2, 8, this)), __runInitializers(_init2, 11, this);
    /**
     * The unique identifier of the entity.
     *
     * Setting this property defers the signal update to a microtask,
     * batching multiple id changes together atomically. This ensures
     * that when entities swap ids (e.g. during sorting with virtualization),
     * all registry updates happen in a single transaction.
     */
    __privateAdd(this, _idSignal);
    __privateAdd(this, _data, __runInitializers(_init2, 12, this)), __runInitializers(_init2, 15, this);
    __privateAdd(this, _disabled2, __runInitializers(_init2, 16, this)), __runInitializers(_init2, 19, this);
    const { effects: effects6, id, data = {}, disabled = false, register = true } = input;
    let previousId = id;
    __privateSet(this, _idSignal, state.signal(id));
    this.manager = manager;
    this.data = data;
    this.disabled = disabled;
    this.effects = () => {
      var _a;
      return [
        () => {
          const { id: id2, manager: manager2 } = this;
          if (id2 === previousId) {
            return;
          }
          previousId = id2;
          manager2 == null ? void 0 : manager2.registry.register(this);
          return () => manager2 == null ? void 0 : manager2.registry.unregister(this);
        },
        ...(_a = effects6 == null ? void 0 : effects6()) != null ? _a : []
      ];
    };
    this.register = this.register.bind(this);
    this.unregister = this.unregister.bind(this);
    this.destroy = this.destroy.bind(this);
    if (manager && register) {
      queueMicrotask(this.register);
    }
  }
  get id() {
    var _a, _b;
    const signalValue = __privateGet(this, _idSignal).value;
    return (_b = (_a = _Entity.pendingIdChanges) == null ? void 0 : _a.get(this)) != null ? _b : signalValue;
  }
  set id(value) {
    var _a, _b;
    const current = (_b = (_a = _Entity.pendingIdChanges) == null ? void 0 : _a.get(this)) != null ? _b : __privateGet(this, _idSignal).peek();
    if (value === current) return;
    if (!_Entity.pendingIdChanges) {
      _Entity.pendingIdChanges = /* @__PURE__ */ new Map();
      queueMicrotask(() => {
        var _a2;
        return __privateMethod(_a2 = _Entity, _Entity_static, flushIdChanges_fn).call(_a2);
      });
    }
    _Entity.pendingIdChanges.set(this, value);
  }
  /**
   * A method that registers the entity with the manager.
   * @returns CleanupFunction | void
   */
  register() {
    var _a;
    return (_a = this.manager) == null ? void 0 : _a.registry.register(this);
  }
  /**
   * A method that unregisters the entity from the manager.
   * @returns void
   */
  unregister() {
    var _a;
    (_a = this.manager) == null ? void 0 : _a.registry.unregister(this);
  }
  /**
   * A method that cleans up the entity when it is no longer needed.
   * @returns void
   */
  destroy() {
    var _a;
    (_a = this.manager) == null ? void 0 : _a.registry.unregister(this);
  }
};
_init2 = __decoratorStart(null);
_Entity_static = new WeakSet();
flushIdChanges_fn = function() {
  const changes = _Entity.pendingIdChanges;
  _Entity.pendingIdChanges = null;
  if (changes) {
    state.batch(() => {
      for (const [entity, id] of changes) {
        __privateGet(entity, _idSignal).value = id;
      }
    });
  }
};
_manager = new WeakMap();
_idSignal = new WeakMap();
_data = new WeakMap();
_disabled2 = new WeakMap();
__decorateElement(_init2, 4, "manager", _manager_dec, _Entity, _manager);
__decorateElement(_init2, 4, "data", _data_dec, _Entity, _data);
__decorateElement(_init2, 4, "disabled", _disabled_dec2, _Entity, _disabled2);
__privateAdd(_Entity, _Entity_static);
__decoratorMetadata(_init2, _Entity);
_Entity.pendingIdChanges = null;
var Entity = _Entity;
var EntityRegistry = class {
  constructor() {
    this.map = state.signal(/* @__PURE__ */ new Map());
    this.cleanupFunctions = /* @__PURE__ */ new WeakMap();
    /**
     * Registers a entity in the registry.
     * @param key - The unique identifier of the entity.
     * @param value - The entity to register.
     * @returns A function that unregisters the entity.
     */
    this.register = (key, value) => {
      const current = this.map.peek();
      const currentValue = current.get(key);
      const unregister = () => this.unregister(key, value);
      if (currentValue === value) return unregister;
      if (currentValue) {
        if (currentValue.id === key) {
          const cleanup2 = this.cleanupFunctions.get(currentValue);
          cleanup2 == null ? void 0 : cleanup2();
          this.cleanupFunctions.delete(currentValue);
        }
      }
      const updatedMap = new Map(current);
      for (const [existingKey, existingValue] of current) {
        if (existingValue === value && existingKey !== key) {
          updatedMap.delete(existingKey);
          break;
        }
      }
      updatedMap.set(key, value);
      this.map.value = updatedMap;
      const cleanup = state.effects(...value.effects());
      this.cleanupFunctions.set(value, cleanup);
      return unregister;
    };
    /**
     * Unregisters an entity from the registry.
     * @param key - The unique identifier of the entity.
     * @param value - The entity instance to unregister.
     */
    this.unregister = (key, value) => {
      const current = this.map.peek();
      if (current.get(key) !== value) {
        return;
      }
      const cleanup = this.cleanupFunctions.get(value);
      cleanup == null ? void 0 : cleanup();
      this.cleanupFunctions.delete(value);
      const updatedMap = new Map(current);
      updatedMap.delete(key);
      this.map.value = updatedMap;
    };
  }
  /**
   * Iterator for the EntityRegistry class.
   * @returns An iterator for the values in the map.
   */
  [Symbol.iterator]() {
    return this.map.peek().values();
  }
  get value() {
    return this.map.value.values();
  }
  /**
   * Checks if a entity with the given identifier exists in the registry.
   * @param identifier - The unique identifier of the entity.
   * @returns True if the entity exists, false otherwise.
   */
  has(identifier) {
    return this.map.value.has(identifier);
  }
  /**
   * Retrieves a entity from the registry using its identifier.
   * @param identifier - The unique identifier of the entity.
   * @returns The entity if it exists, undefined otherwise.
   */
  get(identifier) {
    return this.map.value.get(identifier);
  }
  /**
   * Destroys all entries in the registry and clears the registry.
   */
  destroy() {
    for (const entry of this) {
      const cleanup = this.cleanupFunctions.get(entry);
      cleanup == null ? void 0 : cleanup();
      entry.destroy();
    }
    this.map.value = /* @__PURE__ */ new Map();
  }
};
var _isDragSource_dec, _isDragging_dec, _isDropping_dec, _status_dec, _modifiers_dec, _type_dec, _c, _init3, _type, _modifiers, _status;
var Draggable = class extends (_c = Entity, _type_dec = [state.reactive], _modifiers_dec = [state.reactive], _status_dec = [state.reactive], _isDropping_dec = [state.derived], _isDragging_dec = [state.derived], _isDragSource_dec = [state.derived], _c) {
  constructor(_a, manager) {
    var _b = _a, { modifiers, type, sensors, plugins, effects: effects6 } = _b, input = __objRest(_b, ["modifiers", "type", "sensors", "plugins", "effects"]);
    super(
      __spreadProps(__spreadValues({}, input), {
        effects: () => {
          var _a2;
          return [
            ...(_a2 = effects6 == null ? void 0 : effects6()) != null ? _a2 : [],
            () => {
              const { manager: manager2, plugins: plugins2 } = this;
              if (!manager2 || !plugins2) return;
              for (const entry of plugins2) {
                const { plugin } = descriptor(entry);
                manager2.registry.plugins.register(plugin);
              }
            }
          ];
        }
      }),
      manager
    );
    __runInitializers(_init3, 5, this);
    __privateAdd(this, _type, __runInitializers(_init3, 8, this)), __runInitializers(_init3, 11, this);
    __privateAdd(this, _modifiers, __runInitializers(_init3, 12, this)), __runInitializers(_init3, 15, this);
    __privateAdd(this, _status, __runInitializers(_init3, 16, this, this.isDragSource ? "dragging" : "idle")), __runInitializers(_init3, 19, this);
    this.type = type;
    this.sensors = sensors;
    this.modifiers = modifiers;
    this.alignment = input.alignment;
    this.plugins = plugins;
  }
  /**
   * Look up per-entity options for a given plugin constructor.
   */
  pluginConfig(plugin) {
    if (!this.plugins) return void 0;
    for (const entry of this.plugins) {
      const desc = descriptor(entry);
      if (desc.plugin === plugin) return desc.options;
    }
    return void 0;
  }
  get isDropping() {
    return this.status === "dropping" && this.isDragSource;
  }
  get isDragging() {
    return this.status === "dragging" && this.isDragSource;
  }
  get isDragSource() {
    var _a, _b;
    return ((_b = (_a = this.manager) == null ? void 0 : _a.dragOperation.source) == null ? void 0 : _b.id) === this.id;
  }
};
_init3 = __decoratorStart(_c);
_type = new WeakMap();
_modifiers = new WeakMap();
_status = new WeakMap();
__decorateElement(_init3, 4, "type", _type_dec, Draggable, _type);
__decorateElement(_init3, 4, "modifiers", _modifiers_dec, Draggable, _modifiers);
__decorateElement(_init3, 4, "status", _status_dec, Draggable, _status);
__decorateElement(_init3, 2, "isDropping", _isDropping_dec, Draggable);
__decorateElement(_init3, 2, "isDragging", _isDragging_dec, Draggable);
__decorateElement(_init3, 2, "isDragSource", _isDragSource_dec, Draggable);
__decoratorMetadata(_init3, Draggable);
var _isDropTarget_dec, _shape_dec, _collisionPriority_dec, _collisionDetector_dec, _type_dec2, _accept_dec, _c2, _init4, _accept, _type2, _collisionDetector, _collisionPriority, _shape;
var Droppable = class extends (_c2 = Entity, _accept_dec = [state.reactive], _type_dec2 = [state.reactive], _collisionDetector_dec = [state.reactive], _collisionPriority_dec = [state.reactive], _shape_dec = [state.reactive], _isDropTarget_dec = [state.derived], _c2) {
  constructor(_a, manager) {
    var _b = _a, { accept, collisionDetector, collisionPriority, type } = _b, input = __objRest(_b, ["accept", "collisionDetector", "collisionPriority", "type"]);
    super(input, manager);
    __runInitializers(_init4, 5, this);
    __privateAdd(this, _accept, __runInitializers(_init4, 8, this)), __runInitializers(_init4, 11, this);
    __privateAdd(this, _type2, __runInitializers(_init4, 12, this)), __runInitializers(_init4, 15, this);
    __privateAdd(this, _collisionDetector, __runInitializers(_init4, 16, this)), __runInitializers(_init4, 19, this);
    __privateAdd(this, _collisionPriority, __runInitializers(_init4, 20, this)), __runInitializers(_init4, 23, this);
    __privateAdd(this, _shape, __runInitializers(_init4, 24, this)), __runInitializers(_init4, 27, this);
    this.accept = accept;
    this.collisionDetector = collisionDetector;
    this.collisionPriority = collisionPriority;
    this.type = type;
  }
  /**
   * Checks whether or not the droppable accepts a given draggable.
   *
   * @param draggable - The draggable to check
   * @returns true if the draggable can be dropped here
   */
  accepts(draggable) {
    const { accept } = this;
    if (!accept) {
      return true;
    }
    if (typeof accept === "function") {
      return accept(draggable);
    }
    if (!draggable.type) {
      return false;
    }
    if (Array.isArray(accept)) {
      return accept.includes(draggable.type);
    }
    return draggable.type === accept;
  }
  get isDropTarget() {
    var _a, _b;
    return ((_b = (_a = this.manager) == null ? void 0 : _a.dragOperation.target) == null ? void 0 : _b.id) === this.id;
  }
};
_init4 = __decoratorStart(_c2);
_accept = new WeakMap();
_type2 = new WeakMap();
_collisionDetector = new WeakMap();
_collisionPriority = new WeakMap();
_shape = new WeakMap();
__decorateElement(_init4, 4, "accept", _accept_dec, Droppable, _accept);
__decorateElement(_init4, 4, "type", _type_dec2, Droppable, _type2);
__decorateElement(_init4, 4, "collisionDetector", _collisionDetector_dec, Droppable, _collisionDetector);
__decorateElement(_init4, 4, "collisionPriority", _collisionPriority_dec, Droppable, _collisionPriority);
__decorateElement(_init4, 4, "shape", _shape_dec, Droppable, _shape);
__decorateElement(_init4, 2, "isDropTarget", _isDropTarget_dec, Droppable);
__decoratorMetadata(_init4, Droppable);

// src/core/manager/events.ts
var Monitor = class {
  constructor() {
    this.registry = /* @__PURE__ */ new Map();
  }
  /**
   * Adds an event listener for the specified event type.
   *
   * @param name - The name of the event to listen for
   * @param handler - The function to call when the event occurs
   * @returns A function to remove the event listener
   */
  addEventListener(name, handler) {
    const { registry } = this;
    const listeners = new Set(registry.get(name));
    listeners.add(handler);
    registry.set(name, listeners);
    return () => this.removeEventListener(name, handler);
  }
  /**
   * Removes an event listener for the specified event type.
   *
   * @param name - The name of the event
   * @param handler - The function to remove
   */
  removeEventListener(name, handler) {
    const { registry } = this;
    const listeners = new Set(registry.get(name));
    listeners.delete(handler);
    registry.set(name, listeners);
  }
  /**
   * Dispatches an event to all registered listeners.
   *
   * @param name - The name of the event to dispatch
   * @param args - Arguments to pass to the event handlers
   */
  dispatch(name, ...args) {
    const { registry } = this;
    const listeners = registry.get(name);
    if (!listeners) {
      return;
    }
    for (const listener of listeners) {
      listener(...args);
    }
  }
};
var DragDropMonitor = class extends Monitor {
  /**
   * Creates a new drag and drop monitor.
   *
   * @param manager - The drag and drop manager to monitor
   */
  constructor(manager) {
    super();
    this.manager = manager;
  }
  /**
   * Dispatches a drag and drop event.
   *
   * @param type - The type of event to dispatch
   * @param event - The event data to dispatch
   */
  dispatch(type, event) {
    const args = [event, this.manager];
    super.dispatch(type, ...args);
  }
};
function defaultPreventable(event, cancelable = true) {
  let defaultPrevented = false;
  return __spreadProps(__spreadValues({}, event), {
    cancelable,
    get defaultPrevented() {
      return defaultPrevented;
    },
    preventDefault() {
      if (!cancelable) {
        return;
      }
      defaultPrevented = true;
    }
  });
}

// src/core/collision/notifier.ts
var CollisionNotifier = class extends CorePlugin {
  constructor(manager) {
    super(manager);
    const isEqual = (a, b) => a.map(({ id }) => id).join("") === b.map(({ id }) => id).join("");
    let previousCollisions = [];
    this.destroy = state.effects(
      () => {
        const { dragOperation, collisionObserver } = manager;
        if (dragOperation.status.initializing) {
          previousCollisions = [];
          collisionObserver.enable();
        }
      },
      () => {
        const { collisionObserver, monitor } = manager;
        const { collisions } = collisionObserver;
        if (collisionObserver.isDisabled()) {
          return;
        }
        if (state.untracked(() => manager.dragOperation.ending)) {
          return;
        }
        if (Entity.pendingIdChanges) {
          return;
        }
        const event = defaultPreventable({
          collisions
        });
        monitor.dispatch("collision", event);
        if (event.defaultPrevented) {
          return;
        }
        if (isEqual(collisions, previousCollisions)) {
          return;
        } else {
          previousCollisions = collisions;
        }
        const [firstCollision] = collisions;
        state.untracked(() => {
          var _a;
          if ((firstCollision == null ? void 0 : firstCollision.id) !== ((_a = manager.dragOperation.target) == null ? void 0 : _a.id)) {
            collisionObserver.disable();
            manager.actions.setDropTarget(firstCollision == null ? void 0 : firstCollision.id).then(() => {
              collisionObserver.enable();
            });
          }
        });
      }
    );
  }
};

// src/core/collision/types.ts
var CollisionPriority = /* @__PURE__ */ ((CollisionPriority2) => {
  CollisionPriority2[CollisionPriority2["Lowest"] = 0] = "Lowest";
  CollisionPriority2[CollisionPriority2["Low"] = 1] = "Low";
  CollisionPriority2[CollisionPriority2["Normal"] = 2] = "Normal";
  CollisionPriority2[CollisionPriority2["High"] = 3] = "High";
  CollisionPriority2[CollisionPriority2["Highest"] = 4] = "Highest";
  return CollisionPriority2;
})(CollisionPriority || {});
var CollisionType = /* @__PURE__ */ ((CollisionType2) => {
  CollisionType2[CollisionType2["Collision"] = 0] = "Collision";
  CollisionType2[CollisionType2["ShapeIntersection"] = 1] = "ShapeIntersection";
  CollisionType2[CollisionType2["PointerIntersection"] = 2] = "PointerIntersection";
  return CollisionType2;
})(CollisionType || {});
var _dropped_dec, _dragging_dec, _initialized_dec, _initializing_dec, _initializationPending_dec, _idle_dec, _current_dec, _value_dec, _init5, _value;
_value_dec = [state.reactive], _current_dec = [state.derived], _idle_dec = [state.derived], _initializationPending_dec = [state.derived], _initializing_dec = [state.derived], _initialized_dec = [state.derived], _dragging_dec = [state.derived], _dropped_dec = [state.derived];
var Status = class {
  constructor() {
    __runInitializers(_init5, 5, this);
    __privateAdd(this, _value, __runInitializers(_init5, 8, this, "idle" /* Idle */)), __runInitializers(_init5, 11, this);
  }
  get current() {
    return this.value;
  }
  get idle() {
    return this.value === "idle" /* Idle */;
  }
  get initializationPending() {
    return this.value === "initialization-pending" /* InitializationPending */;
  }
  get initializing() {
    return this.value === "initializing" /* Initializing */;
  }
  get initialized() {
    const { value } = this;
    return value !== "idle" /* Idle */ && value !== "initialization-pending" /* InitializationPending */;
  }
  get dragging() {
    return this.value === "dragging" /* Dragging */;
  }
  get dropped() {
    return this.value === "dropped" /* Dropped */;
  }
  /**
   * Sets the current status value.
   *
   * @param value - The new status value
   */
  set(value) {
    this.value = value;
  }
};
_init5 = __decoratorStart(null);
_value = new WeakMap();
__decorateElement(_init5, 4, "value", _value_dec, Status, _value);
__decorateElement(_init5, 2, "current", _current_dec, Status);
__decorateElement(_init5, 2, "idle", _idle_dec, Status);
__decorateElement(_init5, 2, "initializationPending", _initializationPending_dec, Status);
__decorateElement(_init5, 2, "initializing", _initializing_dec, Status);
__decorateElement(_init5, 2, "initialized", _initialized_dec, Status);
__decorateElement(_init5, 2, "dragging", _dragging_dec, Status);
__decorateElement(_init5, 2, "dropped", _dropped_dec, Status);
__decoratorMetadata(_init5, Status);

// src/core/manager/actions.ts
var DragActions = class {
  /**
   * Creates a new instance of drag actions.
   *
   * @param manager - The drag and drop manager instance
   */
  constructor(manager) {
    this.manager = manager;
  }
  /**
   * Sets the source of the drag operation.
   *
   * @param source - The draggable entity or its unique identifier
   */
  setDragSource(source) {
    const { dragOperation } = this.manager;
    dragOperation.sourceIdentifier = typeof source === "string" || typeof source === "number" ? source : source.id;
  }
  /**
   * Sets the target of the drop operation.
   *
   * @param identifier - The unique identifier of the droppable entity or null/undefined
   * @returns A promise that resolves to true if the drop was prevented
   */
  setDropTarget(identifier) {
    return state.untracked(() => {
      const { dragOperation } = this.manager;
      const id = identifier != null ? identifier : null;
      if (dragOperation.targetIdentifier === id) {
        return Promise.resolve(false);
      }
      dragOperation.targetIdentifier = id;
      const event = defaultPreventable({
        operation: dragOperation.snapshot()
      });
      if (dragOperation.status.dragging) {
        this.manager.monitor.dispatch("dragover", event);
      }
      return this.manager.renderer.rendering.then(() => event.defaultPrevented);
    });
  }
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
  start(args) {
    return state.untracked(() => {
      const { dragOperation } = this.manager;
      if (args.source != null) {
        this.setDragSource(args.source);
      }
      const sourceInstance = dragOperation.source;
      if (!sourceInstance) {
        throw new Error("Cannot start a drag operation without a drag source");
      }
      if (!dragOperation.status.idle) {
        throw new Error(
          "Cannot start a drag operation while another is active"
        );
      }
      const controller = new AbortController();
      const { event: nativeEvent, coordinates } = args;
      state.batch(() => {
        dragOperation.status.set("initialization-pending" /* InitializationPending */);
        dragOperation.shape = null;
        dragOperation.canceled = false;
        dragOperation.ending = false;
        dragOperation.activatorEvent = nativeEvent != null ? nativeEvent : null;
        dragOperation.position.reset(coordinates);
      });
      const beforeStartEvent = defaultPreventable({
        operation: dragOperation.snapshot()
      });
      this.manager.monitor.dispatch("beforedragstart", beforeStartEvent);
      if (beforeStartEvent.defaultPrevented) {
        dragOperation.reset();
        controller.abort();
        return controller;
      }
      dragOperation.status.set("initializing" /* Initializing */);
      dragOperation.controller = controller;
      this.manager.renderer.rendering.then(() => {
        if (controller.signal.aborted) return;
        const { status } = dragOperation;
        if (status.current !== "initializing" /* Initializing */) return;
        state.batch(() => {
          dragOperation.status.set("dragging" /* Dragging */);
          this.manager.monitor.dispatch("dragstart", {
            nativeEvent,
            operation: dragOperation.snapshot(),
            cancelable: false
          });
        });
      });
      return controller;
    });
  }
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
  move(args) {
    return state.untracked(() => {
      var _a, _b;
      const { dragOperation } = this.manager;
      const { status, controller } = dragOperation;
      if (!status.dragging || !controller || controller.signal.aborted) {
        return;
      }
      const event = defaultPreventable(
        {
          nativeEvent: args.event,
          operation: dragOperation.snapshot(),
          by: args.by,
          to: args.to
        },
        (_a = args.cancelable) != null ? _a : true
      );
      if ((_b = args.propagate) != null ? _b : true) {
        this.manager.monitor.dispatch("dragmove", event);
      }
      queueMicrotask(() => {
        var _a2, _b2, _c3, _d, _e;
        if (event.defaultPrevented) {
          return;
        }
        const coordinates = (_e = args.to) != null ? _e : {
          x: dragOperation.position.current.x + ((_b2 = (_a2 = args.by) == null ? void 0 : _a2.x) != null ? _b2 : 0),
          y: dragOperation.position.current.y + ((_d = (_c3 = args.by) == null ? void 0 : _c3.y) != null ? _d : 0)
        };
        dragOperation.position.current = coordinates;
      });
    });
  }
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
  stop(args = {}) {
    return state.untracked(() => {
      var _a, _b;
      const { dragOperation } = this.manager;
      const { controller } = dragOperation;
      if (!controller || controller.signal.aborted) return;
      let promise;
      const suspend = () => {
        const output = {
          resume: () => {
          },
          abort: () => {
          }
        };
        promise = new Promise((resolve, reject) => {
          output.resume = resolve;
          output.abort = reject;
        });
        return output;
      };
      controller.abort();
      dragOperation.ending = true;
      const end = () => {
        this.manager.renderer.rendering.then(() => {
          dragOperation.status.set("dropped" /* Dropped */);
          const dropping = state.untracked(
            () => {
              var _a2;
              return ((_a2 = dragOperation.source) == null ? void 0 : _a2.status) === "dropping";
            }
          );
          const cleanup = () => {
            if (dragOperation.controller === controller) {
              dragOperation.controller = void 0;
            }
            dragOperation.reset();
          };
          if (dropping) {
            const { source } = dragOperation;
            const dispose = state.effect(() => {
              if ((source == null ? void 0 : source.status) === "idle") {
                dispose();
                cleanup();
              }
            });
          } else {
            this.manager.renderer.rendering.then(cleanup);
          }
        });
      };
      dragOperation.canceled = (_a = args.canceled) != null ? _a : false;
      this.manager.monitor.dispatch("dragend", {
        nativeEvent: args.event,
        operation: dragOperation.snapshot(),
        canceled: (_b = args.canceled) != null ? _b : false,
        suspend
      });
      if (promise) {
        promise.then(end).catch(() => dragOperation.reset());
      } else {
        end();
      }
    });
  }
};

// src/core/sensors/sensor.ts
var Sensor = class extends Plugin {
  /**
   * Creates a new sensor instance.
   *
   * @param manager - The drag drop manager instance
   * @param options - Optional sensor configuration
   */
  constructor(manager, options) {
    super(manager, options);
    this.manager = manager;
    this.options = options;
  }
};

// src/core/sensors/activation.ts
var ActivationController = class extends AbortController {
  constructor(constraints, onActivate) {
    super();
    this.constraints = constraints;
    this.onActivate = onActivate;
    this.activated = false;
    for (const constraint of constraints != null ? constraints : []) {
      constraint.controller = this;
    }
  }
  onEvent(event) {
    var _a;
    if (this.activated) return;
    if ((_a = this.constraints) == null ? void 0 : _a.length) {
      for (const constraint of this.constraints) {
        constraint.onEvent(event);
      }
    } else {
      this.activate(event);
    }
  }
  activate(event) {
    if (this.activated) return;
    this.activated = true;
    this.onActivate(event);
  }
  abort(event) {
    this.activated = false;
    super.abort(event);
  }
};
var _controller;
var ActivationConstraint = class {
  constructor(options) {
    this.options = options;
    __privateAdd(this, _controller);
  }
  set controller(controller) {
    __privateSet(this, _controller, controller);
    controller.signal.addEventListener("abort", () => this.abort());
  }
  /**
   * Called when the activation is triggered.
   */
  activate(event) {
    var _a;
    (_a = __privateGet(this, _controller)) == null ? void 0 : _a.activate(event);
  }
};
_controller = new WeakMap();

// src/core/modifiers/modifier.ts
var Modifier = class extends Plugin {
  /**
   * Creates a new modifier instance.
   *
   * @param manager - The drag and drop manager that owns this modifier
   * @param options - Optional configuration for the modifier
   */
  constructor(manager, options) {
    super(manager, options);
    this.manager = manager;
    this.options = options;
  }
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
  apply(operation) {
    return operation.transform;
  }
};

// src/core/manager/registry.ts
var DragDropRegistry = class {
  /**
   * Creates a new registry instance.
   *
   * @param manager - The drag and drop manager that owns this registry
   */
  constructor(manager) {
    /** Registry for draggable entities */
    this.draggables = new EntityRegistry();
    /** Registry for droppable entities */
    this.droppables = new EntityRegistry();
    this.plugins = new PluginRegistry(manager);
    this.sensors = new PluginRegistry(manager);
    this.modifiers = new PluginRegistry(manager);
  }
  register(input, options) {
    if (input instanceof Draggable) {
      return this.draggables.register(input.id, input);
    }
    if (input instanceof Droppable) {
      return this.droppables.register(input.id, input);
    }
    if (input.prototype instanceof Modifier) {
      return this.modifiers.register(input, options);
    }
    if (input.prototype instanceof Sensor) {
      return this.sensors.register(input, options);
    }
    if (input.prototype instanceof Plugin) {
      return this.plugins.register(input, options);
    }
    throw new Error("Invalid instance type");
  }
  unregister(input) {
    if (input instanceof Entity) {
      if (input instanceof Draggable) {
        return this.draggables.unregister(input.id, input);
      }
      if (input instanceof Droppable) {
        return this.droppables.unregister(input.id, input);
      }
      return () => {
      };
    }
    if (input.prototype instanceof Modifier) {
      return this.modifiers.unregister(input);
    }
    if (input.prototype instanceof Sensor) {
      return this.sensors.unregister(input);
    }
    if (input.prototype instanceof Plugin) {
      return this.plugins.unregister(input);
    }
    throw new Error("Invalid instance type");
  }
  /**
   * Destroys all registered entities and cleans up resources.
   *
   * @remarks
   * This method:
   * - Destroys all draggable and droppable entities
   * - Destroys all plugins, sensors, and modifiers
   * - Cleans up any associated resources
   */
  destroy() {
    this.draggables.destroy();
    this.droppables.destroy();
    this.plugins.destroy();
    this.sensors.destroy();
    this.modifiers.destroy();
  }
};
var _transform_dec, _target_dec, _source_dec, _modifiers_dec2, _targetIdentifier_dec, _sourceIdentifier_dec, _activatorEvent_dec, _ending_dec, _canceled_dec, _shape_dec2, _manager2, _previousSource, _shape2, _init6, _canceled, _ending, _activatorEvent, _sourceIdentifier, _targetIdentifier, _modifiers2, _transform;
_shape_dec2 = [state.derived], _canceled_dec = [state.reactive], _ending_dec = [state.reactive], _activatorEvent_dec = [state.reactive], _sourceIdentifier_dec = [state.reactive], _targetIdentifier_dec = [state.reactive], _modifiers_dec2 = [state.reactive], _source_dec = [state.derived], _target_dec = [state.derived], _transform_dec = [state.derived];
var DragOperation = class {
  /**
   * Creates a new drag operation instance.
   *
   * @param manager - The drag and drop manager that owns this operation
   */
  constructor(manager) {
    __runInitializers(_init6, 5, this);
    __privateAdd(this, _manager2);
    __privateAdd(this, _previousSource);
    __privateAdd(this, _shape2, new state.ValueHistory(
      void 0,
      (a, b) => a && b ? a.equals(b) : a === b
    ));
    /** Current status of the drag operation */
    this.status = new Status();
    __privateAdd(this, _canceled, __runInitializers(_init6, 8, this, false)), __runInitializers(_init6, 11, this);
    __privateAdd(this, _ending, __runInitializers(_init6, 12, this, false)), __runInitializers(_init6, 15, this);
    __privateAdd(this, _activatorEvent, __runInitializers(_init6, 16, this, null)), __runInitializers(_init6, 19, this);
    __privateAdd(this, _sourceIdentifier, __runInitializers(_init6, 20, this, null)), __runInitializers(_init6, 23, this);
    __privateAdd(this, _targetIdentifier, __runInitializers(_init6, 24, this, null)), __runInitializers(_init6, 27, this);
    __privateAdd(this, _modifiers2, __runInitializers(_init6, 28, this, [])), __runInitializers(_init6, 31, this);
    /** Current position of the dragged entity */
    this.position = new geometry.Position({ x: 0, y: 0 });
    __privateAdd(this, _transform, { x: 0, y: 0 });
    __privateSet(this, _manager2, manager);
  }
  get shape() {
    const { current, initial, previous } = __privateGet(this, _shape2);
    if (!current || !initial) {
      return null;
    }
    return { current, initial, previous };
  }
  /**
   * Sets the shape of the dragged entity.
   *
   * @param value - The new shape or null to reset
   */
  set shape(value) {
    if (!value) {
      __privateGet(this, _shape2).reset();
    } else {
      __privateGet(this, _shape2).current = value;
    }
  }
  get source() {
    var _a;
    const identifier = this.sourceIdentifier;
    if (identifier == null) return null;
    const value = __privateGet(this, _manager2).registry.draggables.get(identifier);
    if (value) {
      __privateSet(this, _previousSource, value);
    }
    return (_a = value != null ? value : __privateGet(this, _previousSource)) != null ? _a : null;
  }
  get target() {
    var _a;
    const identifier = this.targetIdentifier;
    return identifier != null ? (_a = __privateGet(this, _manager2).registry.droppables.get(identifier)) != null ? _a : null : null;
  }
  get transform() {
    const { x, y } = this.position.delta;
    let transform = { x, y };
    for (const modifier of this.modifiers) {
      transform = modifier.apply(__spreadProps(__spreadValues({}, this.snapshot()), {
        transform
      }));
    }
    __privateSet(this, _transform, transform);
    return transform;
  }
  /**
   * Creates a snapshot of the current drag operation state.
   *
   * @returns An immutable snapshot of the current operation state
   */
  snapshot() {
    return state.untracked(() => ({
      source: this.source,
      target: this.target,
      activatorEvent: this.activatorEvent,
      transform: __privateGet(this, _transform),
      shape: this.shape ? state.snapshot(this.shape) : null,
      position: state.snapshot(this.position),
      status: state.snapshot(this.status),
      canceled: this.canceled
    }));
  }
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
  reset() {
    state.batch(() => {
      this.status.set("idle" /* Idle */);
      this.ending = false;
      this.sourceIdentifier = null;
      this.targetIdentifier = null;
      __privateGet(this, _shape2).reset();
      this.position.reset({ x: 0, y: 0 });
      __privateSet(this, _transform, { x: 0, y: 0 });
      this.modifiers = [];
    });
  }
};
_init6 = __decoratorStart(null);
_manager2 = new WeakMap();
_previousSource = new WeakMap();
_shape2 = new WeakMap();
_canceled = new WeakMap();
_ending = new WeakMap();
_activatorEvent = new WeakMap();
_sourceIdentifier = new WeakMap();
_targetIdentifier = new WeakMap();
_modifiers2 = new WeakMap();
_transform = new WeakMap();
__decorateElement(_init6, 2, "shape", _shape_dec2, DragOperation);
__decorateElement(_init6, 4, "canceled", _canceled_dec, DragOperation, _canceled);
__decorateElement(_init6, 4, "ending", _ending_dec, DragOperation, _ending);
__decorateElement(_init6, 4, "activatorEvent", _activatorEvent_dec, DragOperation, _activatorEvent);
__decorateElement(_init6, 4, "sourceIdentifier", _sourceIdentifier_dec, DragOperation, _sourceIdentifier);
__decorateElement(_init6, 4, "targetIdentifier", _targetIdentifier_dec, DragOperation, _targetIdentifier);
__decorateElement(_init6, 4, "modifiers", _modifiers_dec2, DragOperation, _modifiers2);
__decorateElement(_init6, 2, "source", _source_dec, DragOperation);
__decorateElement(_init6, 2, "target", _target_dec, DragOperation);
__decorateElement(_init6, 2, "transform", _transform_dec, DragOperation);
__decoratorMetadata(_init6, DragOperation);

// src/core/manager/renderer.ts
var defaultRenderer = {
  get rendering() {
    return Promise.resolve();
  }
};

// src/core/manager/manager.ts
function resolveCustomizable(value, defaults) {
  if (typeof value === "function") {
    return value(defaults);
  }
  return value != null ? value : defaults;
}
var DragDropManager = class {
  /**
   * Creates a new drag and drop manager instance.
   *
   * @param config - Optional configuration for plugins, sensors, modifiers, and renderer
   */
  constructor(config) {
    /**
     * Cleans up resources and stops any active drag operations.
     */
    this.destroy = () => {
      if (!this.dragOperation.status.idle) {
        this.actions.stop({ canceled: true });
      }
      this.dragOperation.modifiers.forEach((modifier) => modifier.destroy());
      this.registry.destroy();
      this.collisionObserver.destroy();
    };
    var _a;
    const raw = config != null ? config : {};
    const plugins = resolveCustomizable(raw.plugins, []);
    const sensors = resolveCustomizable(raw.sensors, []);
    const modifiers = resolveCustomizable(raw.modifiers, []);
    const renderer = (_a = raw.renderer) != null ? _a : defaultRenderer;
    const monitor = new DragDropMonitor(this);
    const registry = new DragDropRegistry(this);
    this.registry = registry;
    this.monitor = monitor;
    this.renderer = renderer;
    this.actions = new DragActions(this);
    this.dragOperation = new DragOperation(this);
    this.collisionObserver = new CollisionObserver(this);
    this.plugins = [CollisionNotifier, ...plugins];
    this.modifiers = modifiers;
    this.sensors = sensors;
    const { destroy } = this;
    const cleanup = state.effects(() => {
      var _a2, _b, _c3;
      const currentModifiers = state.untracked(() => this.dragOperation.modifiers);
      const managerModifiers = this.modifiers;
      for (const modifier of currentModifiers) {
        if (!managerModifiers.includes(modifier)) {
          modifier.destroy();
        }
      }
      this.dragOperation.modifiers = (_c3 = (_b = (_a2 = this.dragOperation.source) == null ? void 0 : _a2.modifiers) == null ? void 0 : _b.map((modifier) => {
        const { plugin, options } = descriptor(modifier);
        return new plugin(this, options);
      })) != null ? _c3 : managerModifiers;
    });
    this.destroy = () => {
      cleanup();
      destroy();
    };
  }
  /**
   * Gets the list of active plugins.
   *
   * @returns Array of active plugin instances
   */
  get plugins() {
    return this.registry.plugins.values;
  }
  /**
   * Sets the list of plugins to be used by the manager.
   *
   * @param plugins - Array of plugin constructors or instances
   */
  set plugins(plugins) {
    this.registry.plugins.values = plugins;
  }
  /**
   * Gets the list of active modifiers.
   *
   * @returns Array of active modifier instances
   */
  get modifiers() {
    return this.registry.modifiers.values;
  }
  /**
   * Sets the list of modifiers to be used by the manager.
   *
   * @param modifiers - Array of modifier constructors or instances
   */
  set modifiers(modifiers) {
    this.registry.modifiers.values = modifiers;
  }
  /**
   * Gets the list of active sensors.
   *
   * @returns Array of active sensor instances
   */
  get sensors() {
    return this.registry.sensors.values;
  }
  /**
   * Sets the list of sensors to be used by the manager.
   *
   * @param sensors - Array of sensor constructors or instances
   */
  set sensors(sensors) {
    this.registry.sensors.values = sensors;
  }
};

exports.ActivationConstraint = ActivationConstraint;
exports.ActivationController = ActivationController;
exports.CollisionPriority = CollisionPriority;
exports.CollisionType = CollisionType;
exports.CorePlugin = CorePlugin;
exports.DragDropManager = DragDropManager;
exports.DragOperationStatus = Status;
exports.Draggable = Draggable;
exports.Droppable = Droppable;
exports.Modifier = Modifier;
exports.Plugin = Plugin;
exports.PluginRegistry = PluginRegistry;
exports.Sensor = Sensor;
exports.configurator = configurator;
exports.configure = configure;
exports.descriptor = descriptor;
exports.resolveCustomizable = resolveCustomizable;
exports.sortCollisions = sortCollisions;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map