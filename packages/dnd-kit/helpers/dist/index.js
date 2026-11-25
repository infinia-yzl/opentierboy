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

// src/move.ts
function arrayMove(array, from, to) {
  if (from === to) {
    return array;
  }
  const newArray = array.slice();
  newArray.splice(to, 0, newArray.splice(from, 1)[0]);
  return newArray;
}
function arraySwap(array, from, to) {
  if (from === to) {
    return array;
  }
  const newArray = array.slice();
  const item = newArray[from];
  newArray[from] = newArray[to];
  newArray[to] = item;
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
      return __spreadProps(__spreadValues({}, items), {
        [srcParent]: mutation(items[srcParent], srcIndex, tgtIndex)
      });
    }
    const sourceItem2 = items[srcParent][srcIndex];
    return __spreadProps(__spreadValues({}, items), {
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
            return __spreadProps(__spreadValues({}, items), {
              [sourceParent]: mutation(
                items[sourceParent],
                sourceIndex,
                source.index
              )
            });
          }
          const sourceItem2 = items[sourceParent][sourceIndex];
          return __spreadProps(__spreadValues({}, items), {
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
    return __spreadProps(__spreadValues({}, items), {
      [sourceParent]: mutation(items[sourceParent], sourceIndex, targetIndex)
    });
  }
  const isBelowTarget = target.shape && Math.round(position.y) > Math.round(target.shape.center.y);
  const modifier = isBelowTarget ? 1 : 0;
  const sourceItem = items[sourceParent][sourceIndex];
  return __spreadProps(__spreadValues({}, items), {
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
function swap(items, event) {
  return mutate(items, event, arraySwap);
}
export {
  arrayMove,
  arraySwap,
  move,
  swap
};
