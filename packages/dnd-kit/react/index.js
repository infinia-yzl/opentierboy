import { createContext, memo, forwardRef, useState, useRef, useMemo, startTransition, useImperativeHandle, useEffect, useInsertionEffect, useContext, useCallback, createElement } from 'react';
import { DragDropManager, resolveCustomizable, defaultPreset, Draggable, Feedback, Droppable } from '@dnd-kit/dom';
export { KeyboardSensor, PointerSensor } from '@dnd-kit/dom';
import { useIsomorphicLayoutEffect, useLatest, useOnValueChange, useDeepSignal, useOnElementChange, useComputed } from '@dnd-kit/react/hooks';
import { deepEqual, ValueHistory, derived, batch } from '@dnd-kit/state';
import { jsxs, jsx } from 'react/jsx-runtime';
import { currentValue } from '@dnd-kit/react/utilities';
import { CollisionPriority, CollisionType } from '@dnd-kit/abstract';

var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
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
var defaultManager = new DragDropManager();
var DragDropContext = createContext(
  defaultManager
);
var Renderer = memo(
  forwardRef(({ children }, ref) => {
    const [transitionCount, setTransitionCount] = useState(0);
    const rendering = useRef(null);
    const resolver = useRef(null);
    const renderer = useMemo(
      () => ({
        renderer: {
          get rendering() {
            var _a2;
            return (_a2 = rendering.current) != null ? _a2 : Promise.resolve();
          }
        },
        trackRendering(callback) {
          if (!rendering.current) {
            rendering.current = new Promise((resolve) => {
              resolver.current = resolve;
            });
          }
          startTransition(() => {
            callback();
            setTransitionCount((count) => count + 1);
          });
        }
      }),
      []
    );
    useIsomorphicLayoutEffect(() => {
      var _a2;
      (_a2 = resolver.current) == null ? void 0 : _a2.call(resolver);
      rendering.current = null;
    }, [children, transitionCount]);
    useImperativeHandle(ref, () => renderer);
    return null;
  })
);
var options = [void 0, deepEqual];
function DragDropProvider(_a2) {
  var _b = _a2, {
    children,
    onCollision,
    onBeforeDragStart,
    onDragStart,
    onDragMove,
    onDragOver,
    onDragEnd
  } = _b, input = __objRest(_b, [
    "children",
    "onCollision",
    "onBeforeDragStart",
    "onDragStart",
    "onDragMove",
    "onDragOver",
    "onDragEnd"
  ]);
  const rendererRef = useRef(null);
  const {
    plugins: pluginsInput,
    modifiers: modifiersInput,
    sensors: sensorsInput
  } = input;
  const plugins = resolveCustomizable(pluginsInput, defaultPreset.plugins);
  const sensors = resolveCustomizable(sensorsInput, defaultPreset.sensors);
  const modifiers = resolveCustomizable(
    modifiersInput,
    defaultPreset.modifiers
  );
  const handleBeforeDragStart = useLatest(onBeforeDragStart);
  const handleDragStart = useLatest(onDragStart);
  const handleDragOver = useLatest(onDragOver);
  const handleDragMove = useLatest(onDragMove);
  const handleDragEnd = useLatest(onDragEnd);
  const handleCollision = useLatest(onCollision);
  const manager = useStableInstance(() => {
    var _a3;
    return (_a3 = input.manager) != null ? _a3 : new DragDropManager(input);
  });
  useEffect(() => {
    if (!rendererRef.current) throw new Error("Renderer not found");
    const { renderer, trackRendering } = rendererRef.current;
    const { monitor } = manager;
    manager.renderer = renderer;
    const listeners = [
      monitor.addEventListener("beforedragstart", (event) => {
        const callback = handleBeforeDragStart.current;
        if (callback) {
          trackRendering(() => callback(event, manager));
        }
      }),
      monitor.addEventListener(
        "dragstart",
        (event) => {
          var _a3;
          return (_a3 = handleDragStart.current) == null ? void 0 : _a3.call(handleDragStart, event, manager);
        }
      ),
      monitor.addEventListener("dragover", (event) => {
        const callback = handleDragOver.current;
        if (callback) {
          trackRendering(() => callback(event, manager));
        }
      }),
      monitor.addEventListener("dragmove", (event) => {
        const callback = handleDragMove.current;
        if (callback) {
          trackRendering(() => callback(event, manager));
        }
      }),
      monitor.addEventListener("dragend", (event) => {
        const callback = handleDragEnd.current;
        if (callback) {
          trackRendering(() => callback(event, manager));
        }
      }),
      monitor.addEventListener(
        "collision",
        (event) => {
          var _a3;
          return (_a3 = handleCollision.current) == null ? void 0 : _a3.call(handleCollision, event, manager);
        }
      )
    ];
    return () => listeners.forEach((dispose) => dispose());
  }, [manager]);
  useOnValueChange(
    plugins,
    () => manager && (manager.plugins = plugins),
    ...options
  );
  useOnValueChange(
    sensors,
    () => manager && (manager.sensors = sensors),
    ...options
  );
  useOnValueChange(
    modifiers,
    () => manager && (manager.modifiers = modifiers),
    ...options
  );
  return /* @__PURE__ */ jsxs(DragDropContext.Provider, { value: manager, children: [
    /* @__PURE__ */ jsx(Renderer, { ref: rendererRef, children }),
    children
  ] });
}
function useStableInstance(create) {
  const ref = useRef(null);
  if (!ref.current) {
    ref.current = create();
  }
  useInsertionEffect(() => {
    return () => {
      var _a2;
      return (_a2 = ref.current) == null ? void 0 : _a2.destroy();
    };
  }, []);
  return ref.current;
}
function useDragDropManager() {
  return useContext(DragDropContext);
}

// src/core/hooks/useInstance.ts
function useInstance(initializer) {
  var _a2;
  const manager = (_a2 = useDragDropManager()) != null ? _a2 : void 0;
  const [instance] = useState(() => initializer(manager));
  if (instance.manager !== manager) {
    instance.manager = manager;
  }
  useIsomorphicLayoutEffect(instance.register, [manager, instance]);
  return instance;
}

// src/core/draggable/useDraggable.ts
function useDraggable(input) {
  const { disabled, data, element, handle, id, modifiers, sensors, plugins } = input;
  const draggable = useInstance(
    (manager) => new Draggable(
      __spreadProps(__spreadValues({}, input), {
        register: false,
        handle: currentValue(handle),
        element: currentValue(element)
      }),
      manager
    )
  );
  const trackedDraggable = useDeepSignal(draggable, shouldUpdateSynchronously);
  useOnValueChange(id, () => draggable.id = id);
  useOnElementChange(handle, (handle2) => draggable.handle = handle2);
  useOnElementChange(element, (element2) => draggable.element = element2);
  useOnValueChange(data, () => data && (draggable.data = data));
  useOnValueChange(disabled, () => draggable.disabled = disabled === true);
  useOnValueChange(
    sensors,
    () => draggable.sensors = sensors,
    void 0,
    deepEqual
  );
  useOnValueChange(
    modifiers,
    () => draggable.modifiers = modifiers,
    void 0,
    deepEqual
  );
  useOnValueChange(
    plugins,
    () => draggable.plugins = plugins,
    void 0,
    deepEqual
  );
  useOnValueChange(
    input.alignment,
    () => draggable.alignment = input.alignment
  );
  return {
    draggable: trackedDraggable,
    get isDragging() {
      return trackedDraggable.isDragging;
    },
    get isDropping() {
      return trackedDraggable.isDropping;
    },
    get isDragSource() {
      return trackedDraggable.isDragSource;
    },
    handleRef: useCallback(
      (element2) => {
        draggable.handle = element2 != null ? element2 : void 0;
      },
      [draggable]
    ),
    ref: useCallback(
      (element2) => {
        var _a2, _b;
        if (!element2 && ((_a2 = draggable.element) == null ? void 0 : _a2.isConnected) && !((_b = draggable.manager) == null ? void 0 : _b.dragOperation.status.idle)) {
          return;
        }
        draggable.element = element2 != null ? element2 : void 0;
      },
      [draggable]
    )
  };
}
function shouldUpdateSynchronously(key, oldValue, newValue) {
  if (key === "isDragSource" && !newValue && oldValue) return true;
  return false;
}
function DragOverlay({
  children,
  className,
  dropAnimation,
  style,
  tag,
  disabled
}) {
  var _a2;
  const ref = useRef(null);
  const manager = useDragDropManager();
  const source = (_a2 = useComputed(() => manager == null ? void 0 : manager.dragOperation.source, [manager]).value) != null ? _a2 : null;
  const isDisabled = typeof disabled === "function" ? disabled(source) : disabled;
  useEffect(() => {
    if (!ref.current || !manager || isDisabled) return;
    const feedback = manager.plugins.find(
      (plugin) => plugin instanceof Feedback
    );
    if (!feedback) return;
    feedback.overlay = ref.current;
    return () => {
      feedback.overlay = void 0;
    };
  }, [manager, isDisabled]);
  useEffect(() => {
    if (!manager) return;
    const feedback = manager.plugins.find(
      (plugin) => plugin instanceof Feedback
    );
    if (!feedback) return;
    feedback.dropAnimation = dropAnimation;
    return () => {
      feedback.dropAnimation = void 0;
    };
  }, [manager, dropAnimation]);
  const patchedManager = useMemo(() => {
    if (!manager) return null;
    const patchedRegistry = new Proxy(manager.registry, {
      get(target, property) {
        if (property === "register" || property === "unregister") {
          return noop;
        }
        return target[property];
      }
    });
    return new Proxy(manager, {
      get(target, property) {
        if (property === "registry") {
          return patchedRegistry;
        }
        return target[property];
      }
    });
  }, [manager]);
  return /* @__PURE__ */ jsx(DragDropContext.Provider, { value: patchedManager, children: createElement(
    tag || "div",
    { ref, className, style, "data-dnd-overlay": true },
    renderChildren()
  ) });
  function renderChildren() {
    if (!source || isDisabled) return null;
    if (typeof children === "function") {
      return /* @__PURE__ */ jsx(Children, { source, children });
    }
    return children;
  }
}
function noop() {
  return () => {
  };
}
function Children({
  children,
  source
}) {
  return children(useDeepSignal(source));
}
var __create = Object.create;
var __defProp2 = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : Symbol.for("Symbol." + name);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp2 = (obj, key, value) => key in obj ? __defProp2(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __decoratorStart = (base) => {
  var _a2;
  return [, , , __create((_a2 = base == null ? void 0 : base[__knownSymbol("metadata")]) != null ? _a2 : null)];
};
var __decoratorStrings = ["class", "method", "getter", "setter", "accessor", "field", "value", "get", "set"];
var __expectFn = (fn) => fn !== void 0 && typeof fn !== "function" ? __typeError("Function expected") : fn;
var __decoratorContext = (kind, name, done, metadata, fns) => ({ kind: __decoratorStrings[kind], name, metadata, addInitializer: (fn) => done._ ? __typeError("Already initialized") : fns.push(__expectFn(fn || null)) });
var __decoratorMetadata = (array, target) => __defNormalProp2(target, __knownSymbol("metadata"), array[3]);
var __runInitializers = (array, flags, self, value) => {
  for (var i = 0, fns = array[flags >> 1], n = fns && fns.length; i < n; i++) fns[i].call(self) ;
  return value;
};
var __decorateElement = (array, flags, name, decorators, target, extra) => {
  var it, done, ctx, access, k = flags & 7, s = false, p = false;
  var j = 2 , key = __decoratorStrings[k + 5];
  var extraInitializers = array[j] || (array[j] = []);
  var desc = ((target = target.prototype), __getOwnPropDesc(target , name));
  for (var i = decorators.length - 1; i >= 0; i--) {
    ctx = __decoratorContext(k, name, done = {}, array[3], extraInitializers);
    {
      ctx.static = s, ctx.private = p, access = ctx.access = { has: (x) => name in x };
      access.get = (x) => x[name];
    }
    it = (0, decorators[i])(desc[key]  , ctx), done._ = 1;
    __expectFn(it) && (desc[key] = it );
  }
  return desc && __defProp2(target, name, desc), target;
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), member.set(obj, value), value);
var Point = class _Point {
  /**
   * @param {number} Coordinate of the point on the horizontal axis
   * @param {number} Coordinate of the point on the vertical axis
   */
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
  /**
   * Returns the delta between this point and another point.
   *
   * @param {Point} a - A point
   * @param {Point} b - Another point
   */
  static delta(a, b) {
    return new _Point(a.x - b.x, a.y - b.y);
  }
  /**
   * Returns the distance (hypotenuse) between this point and another point.
   *
   * @param {Point} a - A point
   * @param {Point} b - Another point
   */
  static distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  /**
   * Returns true if both points are equal.
   *
   * @param {Point} a - A point
   * @param {Point} b - Another point
   */
  static equals(a, b) {
    return a.x === b.x && a.y === b.y;
  }
  static from({ x, y }) {
    return new _Point(x, y);
  }
};
var _direction_dec;
var _delta_dec;
var _a;
var _timestamp;
var _init;
var Position = class extends (_a = ValueHistory, _delta_dec = [derived], _direction_dec = [derived], _a) {
  constructor(initialValue) {
    const point = Point.from(initialValue);
    super(point, (a, b) => Point.equals(a, b));
    __runInitializers(_init, 5, this);
    __privateAdd(this, _timestamp, 0);
    this.velocity = { x: 0, y: 0 };
  }
  get delta() {
    return Point.delta(this.current, this.initial);
  }
  get direction() {
    const { current, previous } = this;
    if (!previous) return null;
    const delta = {
      x: current.x - previous.x,
      y: current.y - previous.y
    };
    if (!delta.x && !delta.y) {
      return null;
    }
    if (Math.abs(delta.x) > Math.abs(delta.y)) {
      return delta.x > 0 ? "right" : "left";
    }
    return delta.y > 0 ? "down" : "up";
  }
  get current() {
    return super.current;
  }
  set current(coordinates) {
    const { current } = this;
    const point = Point.from(coordinates);
    const delta = {
      x: point.x - current.x,
      y: point.y - current.y
    };
    const timestamp = Date.now();
    const timeDelta = timestamp - __privateGet(this, _timestamp);
    const velocity = (delta2) => Math.round(delta2 / timeDelta * 100);
    batch(() => {
      __privateSet(this, _timestamp, timestamp);
      this.velocity = {
        x: velocity(delta.x),
        y: velocity(delta.y)
      };
      super.current = point;
    });
  }
  reset(coordinates = this.defaultValue) {
    super.reset(Point.from(coordinates));
    this.velocity = { x: 0, y: 0 };
  }
};
_init = __decoratorStart(_a);
_timestamp = /* @__PURE__ */ new WeakMap();
__decorateElement(_init, 2, "delta", _delta_dec, Position);
__decorateElement(_init, 2, "direction", _direction_dec, Position);
__decoratorMetadata(_init, Position);
var Axis = /* @__PURE__ */ ((Axis2) => {
  Axis2["Horizontal"] = "x";
  Axis2["Vertical"] = "y";
  return Axis2;
})(Axis || {});
Object.values(Axis);
var pointerIntersection = ({
  dragOperation,
  droppable
}) => {
  const pointerCoordinates = dragOperation.position.current;
  if (!pointerCoordinates) {
    return null;
  }
  const { id } = droppable;
  if (!droppable.shape) {
    return null;
  }
  if (droppable.shape.containsPoint(pointerCoordinates)) {
    const distance = Point.distance(droppable.shape.center, pointerCoordinates);
    return {
      id,
      value: 1 / distance,
      type: CollisionType.PointerIntersection,
      priority: CollisionPriority.High
    };
  }
  return null;
};
var shapeIntersection = ({
  dragOperation,
  droppable
}) => {
  const { shape } = dragOperation;
  if (!droppable.shape || !(shape == null ? void 0 : shape.current)) {
    return null;
  }
  const intersectionArea = shape.current.intersectionArea(droppable.shape);
  if (intersectionArea) {
    const { position } = dragOperation;
    const distance = Point.distance(droppable.shape.center, position.current);
    const intersectionRatio = intersectionArea / (shape.current.area + droppable.shape.area - intersectionArea);
    const value = intersectionRatio / distance;
    return {
      id: droppable.id,
      value,
      type: CollisionType.ShapeIntersection,
      priority: CollisionPriority.Normal
    };
  }
  return null;
};
var defaultCollisionDetection = (args) => {
  var _a2;
  return (_a2 = pointerIntersection(args)) != null ? _a2 : shapeIntersection(args);
};

// src/core/droppable/useDroppable.ts
function useDroppable(input) {
  const { collisionDetector, data, disabled, element, id, accept, type } = input;
  const droppable = useInstance(
    (manager) => new Droppable(
      __spreadProps(__spreadValues({}, input), {
        register: false,
        element: currentValue(element)
      }),
      manager
    )
  );
  const trackedDroppalbe = useDeepSignal(droppable);
  useOnValueChange(id, () => droppable.id = id);
  useOnElementChange(element, (element2) => droppable.element = element2);
  useOnValueChange(
    accept,
    () => droppable.accept = accept,
    void 0,
    deepEqual
  );
  useOnValueChange(
    collisionDetector,
    () => droppable.collisionDetector = collisionDetector != null ? collisionDetector : defaultCollisionDetection
  );
  useOnValueChange(data, () => data && (droppable.data = data));
  useOnValueChange(disabled, () => droppable.disabled = disabled === true);
  useOnValueChange(type, () => droppable.type = type);
  return {
    droppable: trackedDroppalbe,
    get isDropTarget() {
      return trackedDroppalbe.isDropTarget;
    },
    ref: useCallback(
      (element2) => {
        var _a2, _b;
        if (!element2 && ((_a2 = droppable.element) == null ? void 0 : _a2.isConnected) && !((_b = droppable.manager) == null ? void 0 : _b.dragOperation.status.idle)) {
          return;
        }
        droppable.element = element2 != null ? element2 : void 0;
      },
      [droppable]
    )
  };
}
function useDragDropMonitor(handlers) {
  const manager = useDragDropManager();
  useEffect(() => {
    if (!manager) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "useDndMonitor hook was called outside of a DragDropProvider. Make sure your app is wrapped in a DragDropProvider component."
        );
      }
      return;
    }
    const cleanupFns = Object.entries(handlers).reduce(
      (acc, [handlerName, handler]) => {
        if (handler) {
          const eventName = handlerName.replace(/^on/, "").toLowerCase();
          const unsubscribe = manager.monitor.addEventListener(
            eventName,
            handler
          );
          acc.push(unsubscribe);
        }
        return acc;
      },
      []
    );
    return () => cleanupFns.forEach((cleanup) => cleanup == null ? void 0 : cleanup());
  }, [manager, handlers]);
}
function useDragOperation() {
  const manager = useDragDropManager();
  const source = useComputed(() => manager == null ? void 0 : manager.dragOperation.source, [manager]);
  const target = useComputed(() => manager == null ? void 0 : manager.dragOperation.target, [manager]);
  return {
    get source() {
      return source.value;
    },
    get target() {
      return target.value;
    }
  };
}

export { DragDropProvider, DragOverlay, useDragDropManager, useDragDropMonitor, useDragOperation, useDraggable, useDroppable, useInstance };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map