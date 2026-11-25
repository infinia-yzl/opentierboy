"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : Symbol.for("Symbol." + name);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __pow = Math.pow;
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
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __decoratorStart = (base) => {
  var _a2;
  return [, , , __create((_a2 = base == null ? void 0 : base[__knownSymbol("metadata")]) != null ? _a2 : null)];
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

// src/index.ts
var src_exports = {};
__export(src_exports, {
  Axes: () => Axes,
  Axis: () => Axis,
  Point: () => Point,
  Position: () => Position,
  Rectangle: () => Rectangle,
  exceedsDistance: () => exceedsDistance
});
module.exports = __toCommonJS(src_exports);

// src/point/Point.ts
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

// src/shapes/Rectangle.ts
var Rectangle = class _Rectangle {
  constructor(left, top, width, height) {
    this.left = left;
    this.top = top;
    this.width = width;
    this.height = height;
    this.scale = {
      x: 1,
      y: 1
    };
  }
  get inverseScale() {
    return {
      x: 1 / this.scale.x,
      y: 1 / this.scale.y
    };
  }
  translate(x, y) {
    const { top, left, width, height, scale } = this;
    const newShape = new _Rectangle(left + x, top + y, width, height);
    newShape.scale = __spreadValues({}, scale);
    return newShape;
  }
  get boundingRectangle() {
    const { width, height, left, top, right, bottom } = this;
    return { width, height, left, top, right, bottom };
  }
  get center() {
    const { left, top, right, bottom } = this;
    return new Point((left + right) / 2, (top + bottom) / 2);
  }
  get area() {
    const { width, height } = this;
    return width * height;
  }
  equals(shape) {
    if (!(shape instanceof _Rectangle)) {
      return false;
    }
    const { left, top, width, height } = this;
    return left === shape.left && top === shape.top && width === shape.width && height === shape.height;
  }
  containsPoint(point) {
    const { top, left, bottom, right } = this;
    return top <= point.y && point.y <= bottom && left <= point.x && point.x <= right;
  }
  intersectionArea(shape) {
    if (shape instanceof _Rectangle) {
      return rectangleRectangleIntersection(this, shape);
    }
    return 0;
  }
  intersectionRatio(shape) {
    const { area } = this;
    const intersectionArea = this.intersectionArea(shape);
    const intersectionRatio = intersectionArea / (shape.area + area - intersectionArea);
    return intersectionRatio;
  }
  get bottom() {
    const { top, height } = this;
    return top + height;
  }
  get right() {
    const { left, width } = this;
    return left + width;
  }
  get aspectRatio() {
    const { width, height } = this;
    return width / height;
  }
  get corners() {
    return [
      { x: this.left, y: this.top },
      { x: this.right, y: this.top },
      { x: this.left, y: this.bottom },
      { x: this.right, y: this.bottom }
    ];
  }
  static from({ top, left, width, height }) {
    return new _Rectangle(left, top, width, height);
  }
  static delta(a, b, alignment = { x: "center", y: "center" }) {
    const getCoordinate = (rect, axis) => {
      const align = alignment[axis];
      const start = axis === "x" ? rect.left : rect.top;
      const size = axis === "x" ? rect.width : rect.height;
      if (align == "start") return start;
      if (align == "end") return start + size;
      return start + size / 2;
    };
    return Point.delta(
      { x: getCoordinate(a, "x"), y: getCoordinate(a, "y") },
      { x: getCoordinate(b, "x"), y: getCoordinate(b, "y") }
    );
  }
  static intersectionRatio(a, b) {
    return _Rectangle.from(a).intersectionRatio(_Rectangle.from(b));
  }
};
function rectangleRectangleIntersection(a, b) {
  const top = Math.max(b.top, a.top);
  const left = Math.max(b.left, a.left);
  const right = Math.min(b.left + b.width, a.left + a.width);
  const bottom = Math.min(b.top + b.height, a.top + a.height);
  const width = right - left;
  const height = bottom - top;
  if (left < right && top < bottom) {
    const intersectionArea = width * height;
    return intersectionArea;
  }
  return 0;
}

// src/position/position.ts
var import_state = require("@dnd-kit/state");
var _direction_dec, _delta_dec, _a, _timestamp, _init;
var Position = class extends (_a = import_state.ValueHistory, _delta_dec = [import_state.derived], _direction_dec = [import_state.derived], _a) {
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
    (0, import_state.batch)(() => {
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
_timestamp = new WeakMap();
__decorateElement(_init, 2, "delta", _delta_dec, Position);
__decorateElement(_init, 2, "direction", _direction_dec, Position);
__decoratorMetadata(_init, Position);

// src/distance/distance.ts
function exceedsDistance({ x, y }, distance) {
  const dx = Math.abs(x);
  const dy = Math.abs(y);
  if (typeof distance === "number") {
    return Math.sqrt(__pow(dx, 2) + __pow(dy, 2)) > distance;
  }
  if ("x" in distance && "y" in distance) {
    return dx > distance.x && dy > distance.y;
  }
  if ("x" in distance) {
    return dx > distance.x;
  }
  if ("y" in distance) {
    return dy > distance.y;
  }
  return false;
}

// src/types/axis.ts
var Axis = /* @__PURE__ */ ((Axis2) => {
  Axis2["Horizontal"] = "x";
  Axis2["Vertical"] = "y";
  return Axis2;
})(Axis || {});
var Axes = Object.values(Axis);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Axes,
  Axis,
  Point,
  Position,
  Rectangle,
  exceedsDistance
});
