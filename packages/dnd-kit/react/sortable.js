import { useCallback } from 'react';
import { batch, deepEqual } from '@dnd-kit/state';
import { resolveSortableTransition, Sortable } from '@dnd-kit/dom/sortable';
export { isSortable, isSortableOperation } from '@dnd-kit/dom/sortable';
import { useInstance } from '@dnd-kit/react';
import { useDeepSignal, useOnValueChange, useIsomorphicLayoutEffect, useImmediateEffect, useOnElementChange } from '@dnd-kit/react/hooks';
import { currentValue } from '@dnd-kit/react/utilities';

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
  const transition = resolveSortableTransition(input.transition);
  const sortable = useInstance((manager) => {
    return new Sortable(
      __spreadProps(__spreadValues({}, input), {
        transition,
        register: false,
        handle: currentValue(handle),
        element: currentValue(element),
        target: currentValue(target)
      }),
      manager
    );
  });
  const trackedSortable = useDeepSignal(sortable, shouldUpdateSynchronously);
  useOnValueChange(id, () => sortable.id = id);
  useIsomorphicLayoutEffect(() => {
    batch(() => {
      sortable.group = group;
      sortable.index = index;
    });
  }, [sortable, group, index]);
  useOnValueChange(type, () => sortable.type = type);
  useOnValueChange(
    accept,
    () => sortable.accept = accept,
    void 0,
    deepEqual
  );
  useOnValueChange(data, () => data && (sortable.data = data));
  useOnValueChange(
    index,
    () => {
      var _a;
      if (((_a = sortable.manager) == null ? void 0 : _a.dragOperation.status.idle) && (transition == null ? void 0 : transition.idle)) {
        sortable.refreshShape();
      }
    },
    useImmediateEffect
  );
  useOnElementChange(handle, (handle2) => sortable.handle = handle2);
  useOnElementChange(element, (element2) => sortable.element = element2);
  useOnElementChange(target, (target2) => sortable.target = target2);
  useOnValueChange(
    disabled,
    () => sortable.disabled = disabled != null ? disabled : false,
    void 0,
    deepEqual
  );
  useOnValueChange(
    sensors,
    () => sortable.sensors = sensors,
    void 0,
    deepEqual
  );
  useOnValueChange(
    collisionDetector,
    () => sortable.collisionDetector = collisionDetector
  );
  useOnValueChange(
    collisionPriority,
    () => sortable.collisionPriority = collisionPriority
  );
  useOnValueChange(
    plugins,
    () => sortable.plugins = plugins,
    void 0,
    deepEqual
  );
  useOnValueChange(
    transition,
    () => sortable.transition = transition,
    void 0,
    deepEqual
  );
  useOnValueChange(
    modifiers,
    () => sortable.modifiers = modifiers,
    void 0,
    deepEqual
  );
  useOnValueChange(
    input.alignment,
    () => sortable.alignment = input.alignment
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
    handleRef: useCallback(
      (element2) => {
        sortable.handle = element2 != null ? element2 : void 0;
      },
      [sortable]
    ),
    ref: useCallback(
      (element2) => {
        var _a, _b;
        if (!element2 && ((_a = sortable.element) == null ? void 0 : _a.isConnected) && !((_b = sortable.manager) == null ? void 0 : _b.dragOperation.status.idle)) {
          return;
        }
        sortable.element = element2 != null ? element2 : void 0;
      },
      [sortable]
    ),
    sourceRef: useCallback(
      (element2) => {
        var _a, _b;
        if (!element2 && ((_a = sortable.source) == null ? void 0 : _a.isConnected) && !((_b = sortable.manager) == null ? void 0 : _b.dragOperation.status.idle)) {
          return;
        }
        sortable.source = element2 != null ? element2 : void 0;
      },
      [sortable]
    ),
    targetRef: useCallback(
      (element2) => {
        var _a, _b;
        if (!element2 && ((_a = sortable.target) == null ? void 0 : _a.isConnected) && !((_b = sortable.manager) == null ? void 0 : _b.dragOperation.status.idle)) {
          return;
        }
        sortable.target = element2 != null ? element2 : void 0;
      },
      [sortable]
    )
  };
}
function shouldUpdateSynchronously(key, oldValue, newValue) {
  if (key === "isDragSource" && !newValue && oldValue) return true;
  return false;
}

export { useSortable };
//# sourceMappingURL=sortable.js.map
//# sourceMappingURL=sortable.js.map