import { CollisionDetector } from '@dnd-kit/abstract';
export { CollisionDetector } from '@dnd-kit/abstract';

/**
 * Returns the droppable that has the greatest intersection area with the
 * pointer coordinates. If there are no pointer coordinates, or the pointer
 * is not intersecting with any droppable, return the greatest intersection area
 * between the collision shape and other intersecting droppable shapes.
 */
declare const defaultCollisionDetection: CollisionDetector;

/**
 * Returns the distance between the corners of the droppable shape and the drag operation shape.
 */
declare const closestCorners: CollisionDetector;

/**
 * Returns the distance between the droppable shape and the drag operation shape.
 */
declare const closestCenter: CollisionDetector;

/**
 * A high precision collision detection algorithm that detects
 * whether the pointer intersects with a given droppable element.
 *
 * Returns the distance between the pointer coordinates and the center of the
 * droppable element if the pointer is within the droppable element.
 *
 * Returns null if the pointer is outside of the droppable element.
 */
declare const pointerIntersection: CollisionDetector;

/**
 * Returns the droppable with the greatest intersection area with
 * the collision shape.
 */
declare const shapeIntersection: CollisionDetector;

declare const directionBiased: CollisionDetector;

/**
 * Returns the distance between the droppable shape and the drag operation coordinates.
 */
declare const pointerDistance: CollisionDetector;

export { closestCenter, closestCorners, defaultCollisionDetection, directionBiased, pointerDistance, pointerIntersection, shapeIntersection };
