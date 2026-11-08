import * as _dnd_kit_geometry from '@dnd-kit/geometry';
import { BoundingRectangle } from '@dnd-kit/geometry';
import * as _dnd_kit_abstract from '@dnd-kit/abstract';
import { Modifier, DragOperation } from '@dnd-kit/abstract';
import { DragDropManager } from '@dnd-kit/dom';

declare class RestrictToWindow extends Modifier<DragDropManager> {
    constructor(manager: DragDropManager);
    windowBoundingRectangle: BoundingRectangle | undefined;
    apply({ shape, transform }: DragOperation): _dnd_kit_geometry.Coordinates;
}

interface Options {
    element?: Element | null | ((operation: DragDropManager['dragOperation']) => Element | null);
}
declare class RestrictToElement extends Modifier<DragDropManager, Options> {
    private boundingRectangle;
    constructor(manager: DragDropManager, options?: Options);
    apply(operation: DragDropManager['dragOperation']): {
        x: number;
        y: number;
    };
    static configure: (options: Options) => _dnd_kit_abstract.PluginDescriptor<any, _dnd_kit_abstract.Plugin<any, Options>, typeof RestrictToElement>;
}

export { RestrictToElement, RestrictToWindow };
