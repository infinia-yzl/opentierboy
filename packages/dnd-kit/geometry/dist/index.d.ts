import { ValueHistory } from '@dnd-kit/state';

declare enum Axis {
    Horizontal = "x",
    Vertical = "y"
}
declare const Axes: Axis[];

type Align = 'center' | 'start' | 'end';
interface Alignment {
    x: Align;
    y: Align;
}

type Coordinates = Record<Axis, number>;

interface BoundingRectangle {
    width: number;
    height: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
}

/**
 * A Point represents a location in a two-dimensional coordinate system.
 *
 */
declare class Point implements Coordinates {
    x: number;
    y: number;
    /**
     * @param {number} Coordinate of the point on the horizontal axis
     * @param {number} Coordinate of the point on the vertical axis
     */
    constructor(x: number, y: number);
    /**
     * Returns the delta between this point and another point.
     *
     * @param {Point} a - A point
     * @param {Point} b - Another point
     */
    static delta(a: Point, b: Point): Point;
    /**
     * Returns the distance (hypotenuse) between this point and another point.
     *
     * @param {Point} a - A point
     * @param {Point} b - Another point
     */
    static distance(a: Point, b: Point): number;
    /**
     * Returns true if both points are equal.
     *
     * @param {Point} a - A point
     * @param {Point} b - Another point
     */
    static equals(a: Point, b: Point): boolean;
    static from({ x, y }: Coordinates): Point;
}

/**
 * An abstract class representing a 2D geometric shape, such as
 * a polygon or circle. Shapes are used for collision detection
 * during drag and drop operations.
 */
declare abstract class Shape {
    /**
     * Get the bounding rectangle of the 2D shape.
     * @returns The bounding rectangle of the shape.
     */
    abstract get boundingRectangle(): BoundingRectangle;
    /**
     * Get the center point of the 2D shape.
     * @returns The center point of the shape.
     */
    abstract get center(): Point;
    /**
     * Get the total space taken up by the 2D shape.
     * @returns The area of the shape.
     */
    abstract get area(): number;
    /**
     * Get the scale transformation of the shape on the 2D plane.
     * @returns The scale of the shape.
     */
    abstract get scale(): {
        x: number;
        y: number;
    };
    /**
     * Get the inverse scale transformation of the shape on the 2D plane.
     * @returns The inverse scale of the shape.
     */
    abstract get inverseScale(): {
        x: number;
        y: number;
    };
    /**
     * Get the aspect ratio of the 2D shape.
     * @returns The aspect ratio of the shape.
     */
    abstract get aspectRatio(): number;
    /**
     * Returns whether or not this shape is equal to another shape.
     *
     * @param shape The other shape to compare with.
     * @returns Whether or not the two shapes are equal.
     */
    abstract equals(shape: Shape): boolean;
    /**
     * Returns the intersection area between this shape and another shape.
     *
     * @param shape The other shape to calculate the intersection area with.
     * @returns The intersection area between the two shapes.
     */
    abstract intersectionArea(shape: Shape): number;
    /**
     * Test a point for containment within this shape.
     *
     * @param point A point in world coordinates.
     */
    abstract containsPoint(point: Point): boolean;
}

declare class Rectangle implements Shape {
    left: number;
    top: number;
    width: number;
    height: number;
    constructor(left: number, top: number, width: number, height: number);
    scale: {
        x: number;
        y: number;
    };
    get inverseScale(): {
        x: number;
        y: number;
    };
    translate(x: number, y: number): Rectangle;
    get boundingRectangle(): BoundingRectangle;
    get center(): Point;
    get area(): number;
    equals(shape: Shape): boolean;
    containsPoint(point: Point): boolean;
    intersectionArea(shape: Shape): number;
    intersectionRatio(shape: Shape): number;
    get bottom(): number;
    get right(): number;
    get aspectRatio(): number;
    get corners(): {
        x: number;
        y: number;
    }[];
    static from({ top, left, width, height }: BoundingRectangle): Rectangle;
    static delta(a: BoundingRectangle, b: BoundingRectangle, alignment?: Alignment): Point;
    static intersectionRatio(a: BoundingRectangle, b: BoundingRectangle): number;
}

declare class Position extends ValueHistory<Point> {
    #private;
    constructor(initialValue: Coordinates);
    velocity: Point;
    get delta(): Point;
    get direction(): "right" | "left" | "down" | "up" | null;
    get current(): Coordinates;
    set current(coordinates: Coordinates);
    reset(coordinates?: Point): void;
}

type Distance = number | Coordinates | Pick<Coordinates, Axis.Horizontal> | Pick<Coordinates, Axis.Vertical>;

/**
 * Returns true if a set of relative coordinates exceeds a given distance.
 */
declare function exceedsDistance({ x, y }: Coordinates, distance: Distance): boolean;

export { type Alignment, Axes, Axis, type BoundingRectangle, type Coordinates, type Distance, Point, Position, Rectangle, Shape, exceedsDistance };
