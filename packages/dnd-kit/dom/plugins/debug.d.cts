import { Plugin } from '@dnd-kit/abstract';
import { DragDropManager } from '@dnd-kit/dom';

declare class Debug extends Plugin<DragDropManager> {
    constructor(manager: DragDropManager);
}

export { Debug };
