'use strict';

var react$1 = require('react');
var state = require('@dnd-kit/state');
var sortable = require('@dnd-kit/dom/sortable');
var react = require('@dnd-kit/react');
var hooks = require('@dnd-kit/react/hooks');
var utilities = require('@dnd-kit/react/utilities');

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
function useSortable(input) {
  const {
    accept,
    collisionDetector,
    collisionPriority,
    id,
    data,
    element,
    handle,
    index,
    group,
    disabled,
    modifiers,
    sensors,
    target,
    type,
    plugins
  } = input;
  const transition = sortable.resolveSortableTransition(input.transition);
  const sortable$1 = react.useInstance((manager) => {
    return new sortable.Sortable(
      __spreadProps(__spreadValues({}, input), {
        transition,
        register: false,
        handle: utilities.currentValue(handle),
        element: utilities.currentValue(element),
        target: utilities.currentValue(target)
      }),
      manager
    );
  });
  const trackedSortable = hooks.useDeepSignal(sortable$1, shouldUpdateSynchronously);
  hooks.useOnValueChange(id, () => sortable$1.id = id);
  hooks.useIsomorphicLayoutEffect(() => {
    state.batch(() => {
      sortable$1.group = group;
      sortable$1.index = index;
    });
  }, [sortable$1, group, index]);
  hooks.useOnValueChange(type, () => sortable$1.type = type);
  hooks.useOnValueChange(
    accept,
    () => sortable$1.accept = accept,
    void 0,
    state.deepEqual
  );
  hooks.useOnValueChange(data, () => data && (sortable$1.data = data));
  hooks.useOnValueChange(
    index,
    () => {
      var _a;
      if (((_a = sortable$1.manager) == null ? void 0 : _a.dragOperation.status.idle) && (transition == null ? void 0 : transition.idle)) {
        sortable$1.refreshShape();
      }
    },
    hooks.useImmediateEffect
  );
  hooks.useOnElementChange(handle, (handle2) => sortable$1.handle = handle2);
  hooks.useOnElementChange(element, (element2) => sortable$1.element = element2);
  hooks.useOnElementChange(target, (target2) => sortable$1.target = target2);
  hooks.useOnValueChange(
    disabled,
    () => sortable$1.disabled = disabled != null ? disabled : false,
    void 0,
    state.deepEqual
  );
  hooks.useOnValueChange(
    sensors,
    () => sortable$1.sensors = sensors,
    void 0,
    state.deepEqual
  );
  hooks.useOnValueChange(
    collisionDetector,
    () => sortable$1.collisionDetector = collisionDetector
  );
  hooks.useOnValueChange(
    collisionPriority,
    () => sortable$1.collisionPriority = collisionPriority
  );
  hooks.useOnValueChange(
    plugins,
    () => sortable$1.plugins = plugins,
    void 0,
    state.deepEqual
  );
  hooks.useOnValueChange(
    transition,
    () => sortable$1.transition = transition,
    void 0,
    state.deepEqual
  );
  hooks.useOnValueChange(
    modifiers,
    () => sortable$1.modifiers = modifiers,
    void 0,
    state.deepEqual
  );
  hooks.useOnValueChange(
    input.alignment,
    () => sortable$1.alignment = input.alignment
  );
  return {
    sortable: trackedSortable,
    get isDragging() {
      return trackedSortable.isDragging;
    },
    get isDropping() {
      return trackedSortable.isDropping;
    },
    get isDragSource() {
      return trackedSortable.isDragSource;
    },
    get isDropTarget() {
      return trackedSortable.isDropTarget;
    },
    handleRef: react$1.useCallback(
      (element2) => {
        sortable$1.handle = element2 != null ? element2 : void 0;
      },
      [sortable$1]
    ),
    ref: react$1.useCallback(
      (element2) => {
        var _a, _b;
        if (!element2 && ((_a = sortable$1.element) == null ? void 0 : _a.isConnected) && !((_b = sortable$1.manager) == null ? void 0 : _b.dragOperation.status.idle)) {
          return;
        }
        sortable$1.element = element2 != null ? element2 : void 0;
      },
      [sortable$1]
    ),
    sourceRef: react$1.useCallback(
      (element2) => {
        var _a, _b;
        if (!element2 && ((_a = sortable$1.source) == null ? void 0 : _a.isConnected) && !((_b = sortable$1.manager) == null ? void 0 : _b.dragOperation.status.idle)) {
          return;
        }
        sortable$1.source = element2 != null ? element2 : void 0;
      },
      [sortable$1]
    ),
    targetRef: react$1.useCallback(
      (element2) => {
        var _a, _b;
        if (!element2 && ((_a = sortable$1.target) == null ? void 0 : _a.isConnected) && !((_b = sortable$1.manager) == null ? void 0 : _b.dragOperation.status.idle)) {
          return;
        }
        sortable$1.target = element2 != null ? element2 : void 0;
      },
      [sortable$1]
    )
  };
}
function shouldUpdateSynchronously(key, oldValue, newValue) {
  if (key === "isDragSource" && !newValue && oldValue) return true;
  return false;
}

Object.defineProperty(exports, "isSortable", {
  enumerable: true,
  get: function () { return sortable.isSortable; }
});
Object.defineProperty(exports, "isSortableOperation", {
  enumerable: true,
  get: function () { return sortable.isSortableOperation; }
});
exports.useSortable = useSortable;
//# sourceMappingURL=sortable.cjs.map
//# sourceMappingURL=sortable.cjs.map