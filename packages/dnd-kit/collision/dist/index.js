// src/algorithms/pointerIntersection.ts
import { CollisionPriority, CollisionType } from "@dnd-kit/abstract";
import { Point } from "@dnd-kit/geometry";
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

// src/algorithms/shapeIntersection.ts
import { CollisionPriority as CollisionPriority2, CollisionType as CollisionType2 } from "@dnd-kit/abstract";
import { Point as Point2 } from "@dnd-kit/geometry";
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
    const distance = Point2.distance(droppable.shape.center, position.current);
    const intersectionRatio = intersectionArea / (shape.current.area + droppable.shape.area - intersectionArea);
    const value = intersectionRatio / distance;
    return {
      id: droppable.id,
      value,
      type: CollisionType2.ShapeIntersection,
      priority: CollisionPriority2.Normal
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
import { CollisionPriority as CollisionPriority3, CollisionType as CollisionType3 } from "@dnd-kit/abstract";
import { Point as Point3, Rectangle } from "@dnd-kit/geometry";
var closestCorners = (input) => {
  const { dragOperation, droppable } = input;
  const { shape, position } = dragOperation;
  if (!droppable.shape) {
    return null;
  }
  const shapeCorners = shape ? Rectangle.from(shape.current.boundingRectangle).corners : void 0;
  const distance = Rectangle.from(
    droppable.shape.boundingRectangle
  ).corners.reduce(
    (acc, corner, index) => {
      var _a;
      return acc + Point3.distance(
        Point3.from(corner),
        (_a = shapeCorners == null ? void 0 : shapeCorners[index]) != null ? _a : position.current
      );
    },
    0
  );
  const value = distance / 4;
  return {
    id: droppable.id,
    value: 1 / value,
    type: CollisionType3.Collision,
    priority: CollisionPriority3.Normal
  };
};

// src/algorithms/closestCenter.ts
import { CollisionPriority as CollisionPriority4, CollisionType as CollisionType4 } from "@dnd-kit/abstract";
import { Point as Point4 } from "@dnd-kit/geometry";
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
  const distance = Point4.distance(
    droppable.shape.center,
    (_a = shape == null ? void 0 : shape.current.center) != null ? _a : position.current
  );
  const value = 1 / distance;
  return {
    id: droppable.id,
    value,
    type: CollisionType4.Collision,
    priority: CollisionPriority4.Normal
  };
};

// src/algorithms/directionBiased.ts
import { CollisionPriority as CollisionPriority5, CollisionType as CollisionType5 } from "@dnd-kit/abstract";
import { Point as Point5 } from "@dnd-kit/geometry";
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
    const distance = Point5.distance(droppable.shape.center, center);
    const value = distance === 0 ? 1 : 1 / distance;
    return {
      id: droppable.id,
      value,
      type: CollisionType5.Collision,
      priority: CollisionPriority5.Normal
    };
  }
  return null;
};

// src/algorithms/pointerDistance.ts
import { CollisionPriority as CollisionPriority6, CollisionType as CollisionType6 } from "@dnd-kit/abstract";
import { Point as Point6 } from "@dnd-kit/geometry";
var pointerDistance = (input) => {
  const { dragOperation, droppable } = input;
  const { position } = dragOperation;
  if (!droppable.shape) {
    return null;
  }
  const distance = Point6.distance(droppable.shape.center, position.current);
  const value = 1 / distance;
  return {
    id: droppable.id,
    value,
    type: CollisionType6.Collision,
    priority: CollisionPriority6.Normal
  };
};
export {
  closestCenter,
  closestCorners,
  defaultCollisionDetection,
  directionBiased,
  pointerDistance,
  pointerIntersection,
  shapeIntersection
};
