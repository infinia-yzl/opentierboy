"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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

// src/index.ts
var src_exports = {};
__export(src_exports, {
  closestCenter: () => closestCenter,
  closestCorners: () => closestCorners,
  defaultCollisionDetection: () => defaultCollisionDetection,
  directionBiased: () => directionBiased,
  pointerDistance: () => pointerDistance,
  pointerIntersection: () => pointerIntersection,
  shapeIntersection: () => shapeIntersection
});
module.exports = __toCommonJS(src_exports);

// src/algorithms/pointerIntersection.ts
var import_abstract = require("@dnd-kit/abstract");
var import_geometry = require("@dnd-kit/geometry");
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
    const distance = import_geometry.Point.distance(droppable.shape.center, pointerCoordinates);
    return {
      id,
      value: 1 / distance,
      type: import_abstract.CollisionType.PointerIntersection,
      priority: import_abstract.CollisionPriority.High
    };
  }
  return null;
};

// src/algorithms/shapeIntersection.ts
var import_abstract2 = require("@dnd-kit/abstract");
var import_geometry2 = require("@dnd-kit/geometry");
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
    const distance = import_geometry2.Point.distance(droppable.shape.center, position.current);
    const intersectionRatio = intersectionArea / (shape.current.area + droppable.shape.area - intersectionArea);
    const value = intersectionRatio / distance;
    return {
      id: droppable.id,
      value,
      type: import_abstract2.CollisionType.ShapeIntersection,
      priority: import_abstract2.CollisionPriority.Normal
    };
  }
  return null;
};

// src/algorithms/default.ts
var defaultCollisionDetection = (args) => {
  var _a;
  return (_a = pointerIntersection(args)) != null ? _a : shapeIntersection(args);
};

// src/algorithms/closestCorners.ts
var import_abstract3 = require("@dnd-kit/abstract");
var import_geometry3 = require("@dnd-kit/geometry");
var closestCorners = (input) => {
  const { dragOperation, droppable } = input;
  const { shape, position } = dragOperation;
  if (!droppable.shape) {
    return null;
  }
  const shapeCorners = shape ? import_geometry3.Rectangle.from(shape.current.boundingRectangle).corners : void 0;
  const distance = import_geometry3.Rectangle.from(
    droppable.shape.boundingRectangle
  ).corners.reduce(
    (acc, corner, index) => {
      var _a;
      return acc + import_geometry3.Point.distance(
        import_geometry3.Point.from(corner),
        (_a = shapeCorners == null ? void 0 : shapeCorners[index]) != null ? _a : position.current
      );
    },
    0
  );
  const value = distance / 4;
  return {
    id: droppable.id,
    value: 1 / value,
    type: import_abstract3.CollisionType.Collision,
    priority: import_abstract3.CollisionPriority.Normal
  };
};

// src/algorithms/closestCenter.ts
var import_abstract4 = require("@dnd-kit/abstract");
var import_geometry4 = require("@dnd-kit/geometry");
var closestCenter = (input) => {
  var _a;
  const { dragOperation, droppable } = input;
  const { shape, position } = dragOperation;
  if (!droppable.shape) {
    return null;
  }
  const collision = defaultCollisionDetection(input);
  if (collision) {
    return collision;
  }
  const distance = import_geometry4.Point.distance(
    droppable.shape.center,
    (_a = shape == null ? void 0 : shape.current.center) != null ? _a : position.current
  );
  const value = 1 / distance;
  return {
    id: droppable.id,
    value,
    type: import_abstract4.CollisionType.Collision,
    priority: import_abstract4.CollisionPriority.Normal
  };
};

// src/algorithms/directionBiased.ts
var import_abstract5 = require("@dnd-kit/abstract");
var import_geometry5 = require("@dnd-kit/geometry");
var directionBiased = ({
  dragOperation,
  droppable
}) => {
  if (!droppable.shape) {
    return null;
  }
  const { position, shape } = dragOperation;
  const { direction } = position;
  if (!shape) {
    return null;
  }
  if (direction === null) {
    return defaultCollisionDetection({ dragOperation, droppable });
  }
  const { center } = shape.current;
  const rect = droppable.shape.boundingRectangle;
  const isBelow = rect.bottom >= center.y;
  const isAbove = rect.top <= center.y;
  const isLeft = rect.left <= center.x;
  const isRight = rect.right >= center.x;
  if (direction === "down" && isBelow || direction === "up" && isAbove || direction === "left" && isLeft || direction === "right" && isRight) {
    const distance = import_geometry5.Point.distance(droppable.shape.center, center);
    const value = distance === 0 ? 1 : 1 / distance;
    return {
      id: droppable.id,
      value,
      type: import_abstract5.CollisionType.Collision,
      priority: import_abstract5.CollisionPriority.Normal
    };
  }
  return null;
};

// src/algorithms/pointerDistance.ts
var import_abstract6 = require("@dnd-kit/abstract");
var import_geometry6 = require("@dnd-kit/geometry");
var pointerDistance = (input) => {
  const { dragOperation, droppable } = input;
  const { position } = dragOperation;
  if (!droppable.shape) {
    return null;
  }
  const distance = import_geometry6.Point.distance(droppable.shape.center, position.current);
  const value = 1 / distance;
  return {
    id: droppable.id,
    value,
    type: import_abstract6.CollisionType.Collision,
    priority: import_abstract6.CollisionPriority.Normal
  };
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  closestCenter,
  closestCorners,
  defaultCollisionDetection,
  directionBiased,
  pointerDistance,
  pointerIntersection,
  shapeIntersection
});
