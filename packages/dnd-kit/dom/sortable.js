import { WeakStore, effect, batch, untracked, reactive } from '@dnd-kit/state';
import { Plugin, resolveCustomizable } from '@dnd-kit/abstract';
import { closestCorners, defaultCollisionDetection } from '@dnd-kit/collision';
import { Scroller, Draggable, Droppable, Feedback } from '@dnd-kit/dom';
import { isKeyboardEvent, DOMRectangle, getVisibleBoundingRectangle, scrollIntoViewIfNeeded, getComputedStyles, computeTranslate, prefersReducedMotion, getWindow, animateTransform, ProxiedElements } from '@dnd-kit/dom/utilities';
import { Rectangle } from '@dnd-kit/geometry';

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
  return [, , , __create((_a = void 0 ) != null ? _a : null)];
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
  var fn, it, done, ctx, access, k = flags & 7, s = false, p = false;
  var j = array.length + 1 , key = __decoratorStrings[k + 5];
  var initializers = (array[j - 1] = []), extraInitializers = array[j] || (array[j] = []);
  var desc = ((target = target.prototype), __getOwnPropDesc({ get [name]() {
    return __privateGet(this, extra);
  }, set [name](x) {
    return __privateSet(this, extra, x);
  } }, name));
  for (var i = decorators.length - 1; i >= 0; i--) {
    ctx = __decoratorContext(k, name, done = {}, array[3], extraInitializers);
    {
      ctx.static = s, ctx.private = p, access = ctx.access = { has: (x) => name in x };
      access.get = (x) => x[name];
      access.set = (x, y) => x[name] = y;
    }
    it = (0, decorators[i])({ get: desc.get, set: desc.set } , ctx), done._ = 1;
    if (it === void 0) __expectFn(it) && (desc[key] = it );
    else if (typeof it !== "object" || it === null) __typeError("Object expected");
    else __expectFn(fn = it.get) && (desc.get = fn), __expectFn(fn = it.set) && (desc.set = fn), __expectFn(fn = it.init) && initializers.unshift(fn);
  }
  return desc && __defProp(target, name, desc), target;
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), member.set(obj, value), value);

// src/sortable/utilities.ts
function isSortable(element) {
  return element instanceof SortableDroppable || element instanceof SortableDraggable;
}
function isSortableOperation(operation) {
  return isSortable(operation.source) && isSortable(operation.target);
}

// src/sortable/plugins/SortableKeyboardPlugin.ts
var TOLERANCE = 10;
var SortableKeyboardPlugin = class extends Plugin {
  constructor(manager) {
    super(manager);
    const cleanupEffect = effect(() => {
      const { dragOperation } = manager;
      if (!isKeyboardEvent(dragOperation.activatorEvent)) {
        return;
      }
      if (!isSortable(dragOperation.source)) {
        return;
      }
      if (dragOperation.status.initialized) {
        const scroller = manager.registry.plugins.get(Scroller);
        if (scroller) {
          scroller.disable();
          return () => scroller.enable();
        }
      }
    });
    const unsubscribe = manager.monitor.addEventListener(
      "dragmove",
      (event, manager2) => {
        queueMicrotask(() => {
          if (this.disabled || event.defaultPrevented || !event.nativeEvent) {
            return;
          }
          const { dragOperation } = manager2;
          if (!isKeyboardEvent(event.nativeEvent)) {
            return;
          }
          if (!isSortable(dragOperation.source)) {
            return;
          }
          if (!dragOperation.shape) {
            return;
          }
          const { actions, collisionObserver, registry } = manager2;
          const { by } = event;
          if (!by) {
            return;
          }
          const direction = getDirection(by);
          const { source, target } = dragOperation;
          const { center } = dragOperation.shape.current;
          const potentialTargets = [];
          const cleanup = [];
          batch(() => {
            for (const droppable of registry.droppables) {
              const { id: id2 } = droppable;
              if (!droppable.accepts(source) || id2 === (target == null ? void 0 : target.id) && isSortable(droppable) || !droppable.element) {
                continue;
              }
              let previousShape = droppable.shape;
              const shape = new DOMRectangle(droppable.element, {
                getBoundingClientRect: (element) => getVisibleBoundingRectangle(element, void 0, 0.2)
              });
              if (!shape.height || !shape.width) continue;
              if (direction == "down" && center.y + TOLERANCE < shape.center.y || direction == "up" && center.y - TOLERANCE > shape.center.y || direction == "left" && center.x - TOLERANCE > shape.center.x || direction == "right" && center.x + TOLERANCE < shape.center.x) {
                potentialTargets.push(droppable);
                droppable.shape = shape;
                cleanup.push(() => droppable.shape = previousShape);
              }
            }
          });
          event.preventDefault();
          collisionObserver.disable();
          const collisions = collisionObserver.computeCollisions(
            potentialTargets,
            closestCorners
          );
          batch(() => cleanup.forEach((clean) => clean()));
          const [firstCollision] = collisions;
          if (!firstCollision) {
            return;
          }
          const { id } = firstCollision;
          const { index, group } = source.sortable;
          actions.setDropTarget(id).then(() => {
            const { source: source2, target: target2, shape } = dragOperation;
            if (!source2 || !isSortable(source2) || !shape) {
              return;
            }
            const {
              index: newIndex,
              group: newGroup,
              target: targetElement
            } = source2.sortable;
            const updated = index !== newIndex || group !== newGroup;
            const element = updated ? targetElement : target2 == null ? void 0 : target2.element;
            if (!element) return;
            scrollIntoViewIfNeeded(element);
            const updatedShape = new DOMRectangle(element);
            if (!updatedShape) {
              return;
            }
            const delta = Rectangle.delta(
              updatedShape,
              Rectangle.from(shape.current.boundingRectangle),
              source2.alignment
            );
            actions.move({
              by: delta
            });
            if (updated) {
              actions.setDropTarget(source2.id).then(() => collisionObserver.enable());
            } else {
              collisionObserver.enable();
            }
          });
        });
      }
    );
    this.destroy = () => {
      unsubscribe();
      cleanupEffect();
    };
  }
};
function getDirection(delta) {
  const { x, y } = delta;
  if (x > 0) {
    return "right";
  } else if (x < 0) {
    return "left";
  } else if (y > 0) {
    return "down";
  } else if (y < 0) {
    return "up";
  }
}

// ../helpers/dist/index.js
var __defProp2 = Object.defineProperty;
var __defProps2 = Object.defineProperties;
var __getOwnPropDescs2 = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols2 = Object.getOwnPropertySymbols;
var __hasOwnProp2 = Object.prototype.hasOwnProperty;
var __propIsEnum2 = Object.prototype.propertyIsEnumerable;
var __defNormalProp2 = (obj, key, value) => key in obj ? __defProp2(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues2 = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp2.call(b, prop))
      __defNormalProp2(a, prop, b[prop]);
  if (__getOwnPropSymbols2)
    for (var prop of __getOwnPropSymbols2(b)) {
      if (__propIsEnum2.call(b, prop))
        __defNormalProp2(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps2 = (a, b) => __defProps2(a, __getOwnPropDescs2(b));
function arrayMove(array, from, to) {
  if (from === to) {
    return array;
  }
  const newArray = array.slice();
  newArray.splice(to, 0, newArray.splice(from, 1)[0]);
  return newArray;
}
function getRecordKey(items, id) {
  const key = String(id);
  return Object.prototype.hasOwnProperty.call(items, key) ? key : void 0;
}
function hasSortableIndices(source) {
  return "initialIndex" in source && typeof source.initialIndex === "number" && "index" in source && typeof source.index === "number";
}
function mutate(items, event, mutation) {
  var _a, _b;
  const { source, target, canceled } = event.operation;
  if (!source || !target || canceled) {
    if ("preventDefault" in event) event.preventDefault();
    return items;
  }
  const findIndex = (item, id) => item === id || item !== null && typeof item === "object" && "id" in item && item.id === id;
  if (Array.isArray(items)) {
    const sourceIndex2 = items.findIndex((item) => findIndex(item, source.id));
    const targetIndex2 = items.findIndex((item) => findIndex(item, target.id));
    if (sourceIndex2 === -1 || targetIndex2 === -1) {
      if (hasSortableIndices(source)) {
        const from = source.initialIndex;
        const to = source.index;
        if (from === to || from < 0 || from >= items.length) {
          if ("preventDefault" in event) event.preventDefault();
          return items;
        }
        return mutation(items, from, to);
      }
      return items;
    }
    if (!canceled && "index" in source && typeof source.index === "number") {
      const projectedSourceIndex = source.index;
      if (projectedSourceIndex !== sourceIndex2) {
        return mutation(items, sourceIndex2, projectedSourceIndex);
      }
    }
    return mutation(items, sourceIndex2, targetIndex2);
  }
  const entries = Object.entries(items);
  let sourceIndex = -1;
  let sourceParent;
  let targetIndex = -1;
  let targetParent;
  for (const [id, children] of entries) {
    if (sourceIndex === -1) {
      sourceIndex = children.findIndex((item) => findIndex(item, source.id));
      if (sourceIndex !== -1) {
        sourceParent = id;
      }
    }
    if (targetIndex === -1) {
      targetIndex = children.findIndex((item) => findIndex(item, target.id));
      if (targetIndex !== -1) {
        targetParent = id;
      }
    }
    if (sourceIndex !== -1 && targetIndex !== -1) {
      break;
    }
  }
  if (sourceIndex === -1 && hasSortableIndices(source)) {
    const srcParent = source.initialGroup == null ? void 0 : getRecordKey(items, source.initialGroup);
    const srcIndex = source.initialIndex;
    const tgtParent = source.group == null ? void 0 : getRecordKey(items, source.group);
    const tgtIndex = source.index;
    if (srcParent == null || tgtParent == null) {
      if ("preventDefault" in event) event.preventDefault();
      return items;
    }
    if (srcParent === tgtParent && srcIndex === tgtIndex) {
      if ("preventDefault" in event) event.preventDefault();
      return items;
    }
    if (srcParent === tgtParent) {
      return __spreadProps2(__spreadValues2({}, items), {
        [srcParent]: mutation(items[srcParent], srcIndex, tgtIndex)
      });
    }
    const sourceItem2 = items[srcParent][srcIndex];
    return __spreadProps2(__spreadValues2({}, items), {
      [srcParent]: [
        ...items[srcParent].slice(0, srcIndex),
        ...items[srcParent].slice(srcIndex + 1)
      ],
      [tgtParent]: [
        ...items[tgtParent].slice(0, tgtIndex),
        sourceItem2,
        ...items[tgtParent].slice(tgtIndex)
      ]
    });
  }
  if (!source.manager) return items;
  const { dragOperation } = source.manager;
  const position = (_b = (_a = dragOperation.shape) == null ? void 0 : _a.current.center) != null ? _b : dragOperation.position.current;
  if (targetParent == null) {
    const targetKey = getRecordKey(items, target.id);
    if (targetKey != null) {
      const insertionIndex = target.shape && position.y > target.shape.center.y ? items[targetKey].length : 0;
      targetParent = targetKey;
      targetIndex = insertionIndex;
    }
  }
  if (sourceParent == null || targetParent == null || sourceParent === targetParent && sourceIndex === targetIndex) {
    if (sourceParent != null && sourceParent === targetParent && sourceIndex === targetIndex && hasSortableIndices(source)) {
      const sourceGroupParent = source.group == null ? void 0 : getRecordKey(items, source.group);
      const hasGroupChanged = source.group != null && sourceGroupParent !== sourceParent;
      const hasIndexChanged = source.index !== sourceIndex;
      if (hasGroupChanged || hasIndexChanged) {
        const reconciledTargetParent = source.group == null ? sourceParent : sourceGroupParent;
        if (reconciledTargetParent != null) {
          if (sourceParent === reconciledTargetParent) {
            return __spreadProps2(__spreadValues2({}, items), {
              [sourceParent]: mutation(
                items[sourceParent],
                sourceIndex,
                source.index
              )
            });
          }
          const sourceItem2 = items[sourceParent][sourceIndex];
          return __spreadProps2(__spreadValues2({}, items), {
            [sourceParent]: [
              ...items[sourceParent].slice(0, sourceIndex),
              ...items[sourceParent].slice(sourceIndex + 1)
            ],
            [reconciledTargetParent]: [
              ...items[reconciledTargetParent].slice(0, source.index),
              sourceItem2,
              ...items[reconciledTargetParent].slice(source.index)
            ]
          });
        }
      }
    }
    if ("preventDefault" in event) event.preventDefault();
    return items;
  }
  if (sourceParent === targetParent) {
    return __spreadProps2(__spreadValues2({}, items), {
      [sourceParent]: mutation(items[sourceParent], sourceIndex, targetIndex)
    });
  }
  const isBelowTarget = target.shape && Math.round(position.y) > Math.round(target.shape.center.y);
  const modifier = isBelowTarget ? 1 : 0;
  const sourceItem = items[sourceParent][sourceIndex];
  return __spreadProps2(__spreadValues2({}, items), {
    [sourceParent]: [
      ...items[sourceParent].slice(0, sourceIndex),
      ...items[sourceParent].slice(sourceIndex + 1)
    ],
    [targetParent]: [
      ...items[targetParent].slice(0, targetIndex + modifier),
      sourceItem,
      ...items[targetParent].slice(targetIndex + modifier)
    ]
  });
}
function move(items, event) {
  return mutate(items, event, arrayMove);
}

// src/sortable/plugins/OptimisticSortingPlugin.helpers.ts
function getSortableIndices(instances) {
  const sortableIndices = /* @__PURE__ */ new Map();
  for (const [, group] of instances) {
    for (const sortable of group) {
      sortableIndices.set(sortable.id, sortable.index);
    }
  }
  return sortableIndices;
}
function hasChanged(snapshotIndices, instances, newInstances) {
  var _a;
  for (const [group, sortables] of instances) {
    for (const sortable of sortables) {
      const index = snapshotIndices.get(sortable.id);
      if (sortable.index !== index || sortable.group !== group || !((_a = newInstances.get(group)) == null ? void 0 : _a.has(sortable))) {
        return true;
      }
    }
  }
  return false;
}

// src/sortable/plugins/OptimisticSortingPlugin.ts
var defaultGroup = "__default__";
var OptimisticSortingPlugin = class extends Plugin {
  constructor(manager) {
    super(manager);
    const getSortableInstances = () => {
      const sortableInstances = /* @__PURE__ */ new Map();
      for (const droppable of manager.registry.droppables) {
        if (droppable instanceof SortableDroppable) {
          const { sortable } = droppable;
          const { group } = sortable;
          let instances = sortableInstances.get(group);
          if (!instances) {
            instances = /* @__PURE__ */ new Set();
            sortableInstances.set(group, instances);
          }
          instances.add(sortable);
        }
      }
      return sortableInstances;
    };
    const unsubscribe = [
      manager.monitor.addEventListener("dragover", (event, manager2) => {
        if (this.disabled) {
          return;
        }
        const { dragOperation } = manager2;
        const { source, target } = dragOperation;
        if (!isSortable(source) || !isSortable(target)) {
          return;
        }
        if (source.sortable === target.sortable) {
          return;
        }
        const instances = getSortableInstances();
        const sortableIndices = getSortableIndices(instances);
        const sameGroup = source.sortable.group === target.sortable.group;
        const sourceInstances = instances.get(source.sortable.group);
        const targetInstances = sameGroup ? sourceInstances : instances.get(target.sortable.group);
        if (!sourceInstances || !targetInstances) return;
        queueMicrotask(() => {
          if (event.defaultPrevented) return;
          manager2.renderer.rendering.then(() => {
            var _a, _b;
            const newInstances = getSortableInstances();
            if (hasChanged(sortableIndices, instances, newInstances)) {
              return;
            }
            const sourceElement = source.sortable.element;
            const targetElement = target.sortable.element;
            if (!targetElement || !sourceElement) {
              return;
            }
            if (!sameGroup && target.id === source.sortable.group) {
              return;
            }
            const orderedSourceSortables = sort(sourceInstances);
            const orderedTargetSortables = sameGroup ? orderedSourceSortables : sort(targetInstances);
            const sourceGroup = (_a = source.sortable.group) != null ? _a : defaultGroup;
            const targetGroup = (_b = target.sortable.group) != null ? _b : defaultGroup;
            const state = {
              [sourceGroup]: orderedSourceSortables,
              [targetGroup]: orderedTargetSortables
            };
            const newState = move(state, event);
            if (state === newState) return;
            const sourceIndex = newState[targetGroup].indexOf(source.sortable);
            const targetIndex = newState[targetGroup].indexOf(target.sortable);
            manager2.collisionObserver.disable();
            reorder(sourceElement, sourceIndex, targetElement, targetIndex);
            batch(() => {
              for (const [index, sortable] of newState[sourceGroup].entries()) {
                sortable.index = index;
              }
              if (!sameGroup) {
                for (const [index, sortable] of newState[targetGroup].entries()) {
                  sortable.group = target.sortable.group;
                  sortable.index = index;
                }
              }
            });
            manager2.actions.setDropTarget(source.id).then(() => manager2.collisionObserver.enable());
          });
        });
      }),
      manager.monitor.addEventListener("dragend", (event, manager2) => {
        if (!event.canceled) {
          return;
        }
        const { dragOperation } = manager2;
        const { source } = dragOperation;
        if (!isSortable(source)) {
          return;
        }
        if (source.sortable.initialIndex === source.sortable.index && source.sortable.initialGroup === source.sortable.group) {
          return;
        }
        queueMicrotask(() => {
          const instances = getSortableInstances();
          const sortableIndices = getSortableIndices(instances);
          const initialGroupInstances = instances.get(
            source.sortable.initialGroup
          );
          if (!initialGroupInstances) return;
          manager2.renderer.rendering.then(() => {
            const newInstances = getSortableInstances();
            if (hasChanged(sortableIndices, instances, newInstances)) {
              return;
            }
            const currentSortables = sort(initialGroupInstances);
            const initialSortables = sort(
              initialGroupInstances,
              sortByInitialIndex
            );
            const sourceElement = source.sortable.element;
            const initialPosition = initialSortables.indexOf(source.sortable);
            const target = currentSortables[initialPosition];
            const targetElement = target == null ? void 0 : target.element;
            if (!target || !targetElement || !sourceElement) {
              return;
            }
            reorder(sourceElement, target.index, targetElement, source.index);
            batch(() => {
              for (const sortableInstances of instances.values()) {
                const entries = Array.from(sortableInstances).values();
                for (const sortable of entries) {
                  sortable.index = sortable.initialIndex;
                  sortable.group = sortable.initialGroup;
                }
              }
            });
          });
        });
      })
    ];
    this.destroy = () => {
      for (const unsubscribeListener of unsubscribe) {
        unsubscribeListener();
      }
    };
  }
};
function reorder(sourceElement, sourceIndex, targetElement, targetIndex) {
  const position = targetIndex < sourceIndex ? "afterend" : "beforebegin";
  targetElement.insertAdjacentElement(position, sourceElement);
}
function sortByIndex(a, b) {
  return a.index - b.index;
}
function sortByInitialIndex(a, b) {
  return a.initialIndex - b.initialIndex;
}
function sort(instances, sortFn = sortByIndex) {
  return Array.from(instances).sort(sortFn);
}

// src/sortable/sortable.ts
var defaultPlugins = [
  SortableKeyboardPlugin,
  OptimisticSortingPlugin
];
var defaultSortableTransition = {
  duration: 250,
  easing: "cubic-bezier(0.25, 1, 0.5, 1)",
  idle: false
};
function resolveSortableTransition(transition) {
  return transition === null ? null : __spreadValues(__spreadValues({}, defaultSortableTransition), transition);
}
function normalizeDisabled(disabled) {
  var _a, _b;
  if (typeof disabled === "boolean") {
    return {
      draggable: disabled,
      droppable: disabled
    };
  }
  return {
    draggable: (_a = disabled == null ? void 0 : disabled.draggable) != null ? _a : false,
    droppable: (_b = disabled == null ? void 0 : disabled.droppable) != null ? _b : false
  };
}
var store = new WeakStore();
var _group_dec, _index_dec, _init, _index, _previousGroup, _previousIndex, _group, _element;
_index_dec = [reactive], _group_dec = [reactive];
var Sortable2 = class {
  constructor(_a, manager) {
    __privateAdd(this, _index, __runInitializers(_init, 8, this)), __runInitializers(_init, 11, this);
    __privateAdd(this, _previousGroup);
    __privateAdd(this, _previousIndex);
    __privateAdd(this, _group, __runInitializers(_init, 12, this)), __runInitializers(_init, 15, this);
    __privateAdd(this, _element);
    this.register = () => {
      batch(() => {
        var _a, _b;
        (_a = this.manager) == null ? void 0 : _a.registry.register(this.droppable);
        (_b = this.manager) == null ? void 0 : _b.registry.register(this.draggable);
      });
      return () => this.unregister();
    };
    this.unregister = () => {
      batch(() => {
        var _a, _b;
        (_a = this.manager) == null ? void 0 : _a.registry.unregister(this.droppable);
        (_b = this.manager) == null ? void 0 : _b.registry.unregister(this.draggable);
      });
    };
    this.destroy = () => {
      batch(() => {
        this.droppable.destroy();
        this.draggable.destroy();
      });
    };
    var _b = _a, {
      effects: inputEffects = () => [],
      disabled,
      group,
      index,
      sensors,
      type,
      transition = defaultSortableTransition,
      plugins: pluginsInput
    } = _b, input = __objRest(_b, [
      "effects",
      "disabled",
      "group",
      "index",
      "sensors",
      "type",
      "transition",
      "plugins"
    ]);
    const plugins = resolveCustomizable(pluginsInput, defaultPlugins);
    const disabledState = normalizeDisabled(disabled);
    this.droppable = new SortableDroppable(
      __spreadProps(__spreadValues({}, input), { disabled: disabledState.droppable }),
      manager,
      this
    );
    this.draggable = new SortableDraggable(
      __spreadProps(__spreadValues({}, input), {
        disabled: disabledState.draggable,
        plugins,
        effects: () => [
          () => {
            var _a2, _b2, _c;
            const status = (_a2 = this.manager) == null ? void 0 : _a2.dragOperation.status;
            if ((status == null ? void 0 : status.initializationPending) && this.id === ((_c = (_b2 = this.manager) == null ? void 0 : _b2.dragOperation.source) == null ? void 0 : _c.id)) {
              store.clear(this.manager);
            }
            if (status == null ? void 0 : status.dragging) {
              store.set(
                this.manager,
                this.id,
                untracked(() => ({
                  initialIndex: this.index,
                  initialGroup: this.group
                }))
              );
            }
          },
          () => {
            const { index: index2, group: group2, manager: _ } = this;
            const previousIndex = __privateGet(this, _previousIndex);
            const previousGroup = __privateGet(this, _previousGroup);
            if (index2 !== previousIndex || group2 !== previousGroup) {
              __privateSet(this, _previousIndex, index2);
              __privateSet(this, _previousGroup, group2);
              this.animate();
            }
          },
          () => {
            var _a2, _b2;
            const { target } = this;
            const { isDragSource } = this.draggable;
            const feedback = (_b2 = (_a2 = this.draggable.pluginConfig(Feedback)) == null ? void 0 : _a2.feedback) != null ? _b2 : "default";
            if (feedback === "move" && isDragSource) {
              this.droppable.disabled = !target;
            }
          },
          ...inputEffects()
        ],
        type,
        sensors
      }),
      manager,
      this
    );
    __privateSet(this, _element, input.element);
    this.manager = manager;
    this.index = index;
    __privateSet(this, _previousIndex, index);
    this.group = group;
    __privateSet(this, _previousGroup, group);
    this.type = type;
    this.transition = transition;
  }
  get initialIndex() {
    var _a, _b;
    return (_b = (_a = store.get(this.manager, this.id)) == null ? void 0 : _a.initialIndex) != null ? _b : this.index;
  }
  get initialGroup() {
    var _a, _b;
    return (_b = (_a = store.get(this.manager, this.id)) == null ? void 0 : _a.initialGroup) != null ? _b : this.group;
  }
  animate() {
    untracked(() => {
      const { manager, transition } = this;
      const { shape } = this.droppable;
      if (!manager) return;
      const { idle } = manager.dragOperation.status;
      if (!shape || !transition || idle && !transition.idle) {
        return;
      }
      manager.renderer.rendering.then(() => {
        const { element } = this;
        if (!element) {
          return;
        }
        for (const animation of element.getAnimations()) {
          if ("transitionProperty" in animation && (animation.transitionProperty === "transform" || animation.transitionProperty === "translate" || animation.transitionProperty === "scale")) {
            animation.cancel();
          }
        }
        const updatedShape = this.refreshShape();
        if (!updatedShape) {
          return;
        }
        const delta = {
          x: shape.boundingRectangle.left - updatedShape.boundingRectangle.left,
          y: shape.boundingRectangle.top - updatedShape.boundingRectangle.top
        };
        const { translate } = getComputedStyles(element);
        const currentTranslate = computeTranslate(element, translate, false);
        const finalTranslate = computeTranslate(element, translate);
        if (delta.x || delta.y) {
          const resolvedTransition = prefersReducedMotion(getWindow(element)) ? __spreadProps(__spreadValues({}, transition), { duration: 0 }) : transition;
          animateTransform({
            element,
            keyframes: {
              translate: [
                `${currentTranslate.x + delta.x}px ${currentTranslate.y + delta.y}px ${currentTranslate.z}`,
                `${finalTranslate.x}px ${finalTranslate.y}px ${finalTranslate.z}`
              ]
            },
            options: resolvedTransition
          }).then(() => {
            if (!manager.dragOperation.status.dragging) {
              this.droppable.shape = void 0;
            }
          });
        }
      });
    });
  }
  get manager() {
    return this.draggable.manager;
  }
  set manager(manager) {
    batch(() => {
      this.draggable.manager = manager;
      this.droppable.manager = manager;
    });
  }
  set element(element) {
    batch(() => {
      const previousElement = __privateGet(this, _element);
      const droppableElement = this.droppable.element;
      const draggableElement = this.draggable.element;
      if (!droppableElement || droppableElement === previousElement) {
        this.droppable.element = element;
      }
      if (!draggableElement || draggableElement === previousElement) {
        this.draggable.element = element;
      }
      __privateSet(this, _element, element);
    });
  }
  get element() {
    var _a, _b;
    const element = __privateGet(this, _element);
    if (!element) return;
    return (_b = (_a = ProxiedElements.get(element)) != null ? _a : element) != null ? _b : this.droppable.element;
  }
  set target(target) {
    this.droppable.element = target;
  }
  get target() {
    return this.droppable.element;
  }
  set source(source) {
    this.draggable.element = source;
  }
  get source() {
    return this.draggable.element;
  }
  get disabled() {
    const { disabled: draggable } = this.draggable;
    const { disabled: droppable } = this.droppable;
    return draggable === droppable ? draggable : { draggable, droppable };
  }
  set plugins(value) {
    this.draggable.plugins = resolveCustomizable(value, defaultPlugins);
  }
  set disabled(value) {
    const disabled = normalizeDisabled(value);
    batch(() => {
      this.droppable.disabled = disabled.droppable;
      this.draggable.disabled = disabled.draggable;
    });
  }
  set data(data) {
    batch(() => {
      this.droppable.data = data;
      this.draggable.data = data;
    });
  }
  set handle(handle) {
    this.draggable.handle = handle;
  }
  set id(id) {
    this.droppable.id = id;
    this.draggable.id = id;
  }
  get id() {
    return this.droppable.id;
  }
  set sensors(value) {
    this.draggable.sensors = value;
  }
  set modifiers(value) {
    this.draggable.modifiers = value;
  }
  set collisionPriority(value) {
    this.droppable.collisionPriority = value;
  }
  set collisionDetector(value) {
    this.droppable.collisionDetector = value != null ? value : defaultCollisionDetection;
  }
  set alignment(value) {
    this.draggable.alignment = value;
  }
  get alignment() {
    return this.draggable.alignment;
  }
  set type(type) {
    batch(() => {
      this.droppable.type = type;
      this.draggable.type = type;
    });
  }
  get type() {
    return this.draggable.type;
  }
  set accept(value) {
    this.droppable.accept = value;
  }
  get accept() {
    return this.droppable.accept;
  }
  get isDropTarget() {
    return this.droppable.isDropTarget;
  }
  /**
   * A boolean indicating whether the sortable item is the source of a drag operation.
   */
  get isDragSource() {
    return this.draggable.isDragSource;
  }
  /**
   * A boolean indicating whether the sortable item is being dragged.
   */
  get isDragging() {
    return this.draggable.isDragging;
  }
  /**
   * A boolean indicating whether the sortable item is being dropped.
   */
  get isDropping() {
    return this.draggable.isDropping;
  }
  get status() {
    return this.draggable.status;
  }
  refreshShape() {
    return this.droppable.refreshShape();
  }
  accepts(draggable) {
    return this.droppable.accepts(draggable);
  }
};
_init = __decoratorStart();
_index = new WeakMap();
_previousGroup = new WeakMap();
_previousIndex = new WeakMap();
_group = new WeakMap();
_element = new WeakMap();
__decorateElement(_init, 4, "index", _index_dec, Sortable2, _index);
__decorateElement(_init, 4, "group", _group_dec, Sortable2, _group);
__decoratorMetadata(_init, Sortable2);
var SortableDraggable = class extends Draggable {
  constructor(input, manager, sortable) {
    super(input, manager);
    this.sortable = sortable;
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
};
var SortableDroppable = class extends Droppable {
  constructor(input, manager, sortable) {
    super(input, manager);
    this.sortable = sortable;
  }
  get index() {
    return this.sortable.index;
  }
  get group() {
    return this.sortable.group;
  }
};

export { OptimisticSortingPlugin, Sortable2 as Sortable, SortableDraggable, SortableDroppable, SortableKeyboardPlugin, defaultSortableTransition, isSortable, isSortableOperation, resolveSortableTransition };
//# sourceMappingURL=sortable.js.map
//# sourceMappingURL=sortable.js.map