import * as _dnd_kit_abstract from '@dnd-kit/abstract';
import { Modifier, DragDropManager, DragOperation } from '@dnd-kit/abstract';
import * as _dnd_kit_geometry from '@dnd-kit/geometry';
import { Shape, Coordinates, BoundingRectangle } from '@dnd-kit/geometry';

/**
 * Options for configuring an axis modifier.
 *
 * @property axis - The axis to restrict movement to ('x' or 'y')
 * @property value - The fixed value to set for the specified axis
 */
interface Options$1 {
    axis: 'x' | 'y';
    value: number;
}
/**
 * A modifier that restricts drag movement to a specific axis and value.
 *
 * @remarks
 * This modifier can be used to:
 * - Restrict movement to a specific axis
 * - Set a fixed value for the specified axis
 * - Create horizontal or vertical movement constraints
 */
declare class AxisModifier extends Modifier<DragDropManager<any, any>, Options$1> {
    /**
     * Applies the axis restriction to the drag operation.
     *
     * @param operation - The current drag operation
     * @returns The modified transform with the axis restriction applied
     */
    apply({ transform }: DragOperation): _dnd_kit_geometry.Coordinates;
    /**
     * Creates a configured instance of the AxisModifier.
     *
     * @param options - The axis restriction options
     * @returns A configured AxisModifier instance
     */
    static configure: (options: Options$1) => _dnd_kit_abstract.PluginDescriptor<any, _dnd_kit_abstract.Plugin<any, Options$1>, typeof AxisModifier>;
}
/**
 * A pre-configured modifier that restricts movement to the vertical axis.
 *
 * @remarks
 * This modifier fixes the x-axis value to 0, allowing only vertical movement.
 */
declare const RestrictToVerticalAxis: _dnd_kit_abstract.PluginDescriptor<any, _dnd_kit_abstract.Plugin<any, Options$1>, typeof AxisModifier>;
/**
 * A pre-configured modifier that restricts movement to the horizontal axis.
 *
 * @remarks
 * This modifier fixes the y-axis value to 0, allowing only horizontal movement.
 */
declare const RestrictToHorizontalAxis: _dnd_kit_abstract.PluginDescriptor<any, _dnd_kit_abstract.Plugin<any, Options$1>, typeof AxisModifier>;

/**
 * Restricts a shape's movement to stay within a bounding rectangle.
 *
 * @param shape - The shape to restrict
 * @param transform - The current transform coordinates
 * @param boundingRect - The bounding rectangle to restrict movement within
 * @returns The modified transform coordinates that keep the shape within bounds
 *
 * @remarks
 * This function:
 * - Prevents the shape from moving outside the bounding rectangle
 * - Adjusts the transform coordinates to keep the shape's edges within bounds
 * - Maintains the shape's position relative to the bounding rectangle
 *
 * @example
 * ```typescript
 * const shape = { boundingRectangle: { top: 0, left: 0, right: 100, bottom: 100 } };
 * const transform = { x: 50, y: 50 };
 * const bounds = { top: 0, left: 0, width: 200, height: 200 };
 *
 * const restricted = restrictShapeToBoundingRectangle(shape, transform, bounds);
 * ```
 */
declare function restrictShapeToBoundingRectangle(shape: Shape, transform: Coordinates, boundingRect: BoundingRectangle): {
    x: number;
    y: number;
};

/**
 * Options for configuring a snap modifier.
 *
 * @property size - The grid size to snap to, either a single number for both axes
 *                 or separate x and y values
 */
interface Options {
    size: number | {
        x: number;
        y: number;
    };
}
/**
 * A modifier that snaps drag movement to a grid.
 *
 * @remarks
 * This modifier:
 * - Snaps drag coordinates to the nearest grid point
 * - Supports different grid sizes for x and y axes
 * - Uses ceiling rounding to ensure consistent snapping behavior
 *
 * @example
 * ```typescript
 * // Snap to a 20x20 grid
 * const modifier = SnapModifier.configure({ size: 20 });
 *
 * // Snap to a 10x20 grid
 * const modifier = SnapModifier.configure({ size: { x: 10, y: 20 } });
 * ```
 */
declare class SnapModifier extends Modifier<DragDropManager<any, any>, Options> {
    /**
     * Applies the snap grid to the drag operation.
     *
     * @param operation - The current drag operation
     * @returns The modified transform with coordinates snapped to the grid
     */
    apply({ transform }: DragOperation): {
        x: number;
        y: number;
    };
    /**
     * Creates a configured instance of the SnapModifier.
     *
     * @param options - The snap grid options
     * @returns A configured SnapModifier instance
     */
    static configure: (options: Options) => _dnd_kit_abstract.PluginDescriptor<any, _dnd_kit_abstract.Plugin<any, Options>, typeof SnapModifier>;
}

export { AxisModifier, RestrictToHorizontalAxis, RestrictToVerticalAxis, SnapModifier, restrictShapeToBoundingRectangle };
