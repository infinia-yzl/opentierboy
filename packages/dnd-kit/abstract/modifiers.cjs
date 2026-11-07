'use strict';

var abstract = require('@dnd-kit/abstract');

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
var _AxisModifier = class _AxisModifier extends abstract.Modifier {
  /**
   * Applies the axis restriction to the drag operation.
   *
   * @param operation - The current drag operation
   * @returns The modified transform with the axis restriction applied
   */
  apply({ transform }) {
    if (!this.options) {
      return transform;
    }
    const { axis, value } = this.options;
    return __spreadProps(__spreadValues({}, transform), {
      [axis]: value
    });
  }
};
/**
 * Creates a configured instance of the AxisModifier.
 *
 * @param options - The axis restriction options
 * @returns A configured AxisModifier instance
 */
_AxisModifier.configure = abstract.configurator(_AxisModifier);
var AxisModifier = _AxisModifier;
var RestrictToVerticalAxis = AxisModifier.configure({
  axis: "x",
  value: 0
});
var RestrictToHorizontalAxis = AxisModifier.configure({
  axis: "y",
  value: 0
});

// src/modifiers/boundingRectangle.ts
function restrictShapeToBoundingRectangle(shape, transform, boundingRect) {
  const value = __spreadValues({}, transform);
  if (shape.boundingRectangle.top + transform.y <= boundingRect.top) {
    value.y = boundingRect.top - shape.boundingRectangle.top;
  } else if (shape.boundingRectangle.bottom + transform.y >= boundingRect.top + boundingRect.height) {
    value.y = boundingRect.top + boundingRect.height - shape.boundingRectangle.bottom;
  }
  if (shape.boundingRectangle.left + transform.x <= boundingRect.left) {
    value.x = boundingRect.left - shape.boundingRectangle.left;
  } else if (shape.boundingRectangle.right + transform.x >= boundingRect.left + boundingRect.width) {
    value.x = boundingRect.left + boundingRect.width - shape.boundingRectangle.right;
  }
  return value;
}
var _SnapModifier = class _SnapModifier extends abstract.Modifier {
  /**
   * Applies the snap grid to the drag operation.
   *
   * @param operation - The current drag operation
   * @returns The modified transform with coordinates snapped to the grid
   */
  apply({ transform }) {
    var _a;
    const { size = 20 } = (_a = this.options) != null ? _a : {};
    const x = typeof size === "number" ? size : size.x;
    const y = typeof size === "number" ? size : size.y;
    return __spreadProps(__spreadValues({}, transform), {
      x: Math.ceil(transform.x / x) * x,
      y: Math.ceil(transform.y / y) * y
    });
  }
};
/**
 * Creates a configured instance of the SnapModifier.
 *
 * @param options - The snap grid options
 * @returns A configured SnapModifier instance
 */
_SnapModifier.configure = abstract.configurator(_SnapModifier);
var SnapModifier = _SnapModifier;

exports.AxisModifier = AxisModifier;
exports.RestrictToHorizontalAxis = RestrictToHorizontalAxis;
exports.RestrictToVerticalAxis = RestrictToVerticalAxis;
exports.SnapModifier = SnapModifier;
exports.restrictShapeToBoundingRectangle = restrictShapeToBoundingRectangle;
//# sourceMappingURL=modifiers.cjs.map
//# sourceMappingURL=modifiers.cjs.map