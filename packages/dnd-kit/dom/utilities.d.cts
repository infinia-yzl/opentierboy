import { BoundingRectangle, Coordinates, Axis, Rectangle } from '@dnd-kit/geometry';

declare function getFinalKeyframe(element: Element, match: (keyframe: Keyframe) => boolean): [Keyframe, Animation] | null;

declare function getBoundingRectangle(element: Element): BoundingRectangle;

/**
 * Returns the bounding rectangle of the viewport.
 *
 * When the visual viewport is available, uses its dimensions and offset
 * to account for pinch-to-zoom. The returned rectangle is in layout viewport
 * coordinates, consistent with `clientX`/`clientY` and `getBoundingClientRect()`.
 *
 * @param element
 * @returns BoundingRectangle
 */
declare function getViewportBoundingRectangle(element: Element): BoundingRectangle;

declare function getVisibleBoundingRectangle(element: Element, boundingClientRect?: DOMRect, margin?: number): BoundingRectangle;

declare function getEventCoordinates(event: PointerEvent): Coordinates;

declare const canUseDOM: boolean;

declare function getDocument(target: Event['target'] | undefined): Document;

declare function getWindow(target: Event['target'] | null | undefined): typeof window;

/**
 * Recursively finds all same-origin Document objects:
 * - the current document
 * - any same-origin parent documents
 * - any same-origin child documents (iframes, frames)
 *
 * @param rootDoc - The starting document (defaults to current document)
 * @param seen - Internal set to prevent duplicate traversal
 * @returns An array of all discovered same-origin Document objects
 */
declare function getDocuments(rootDoc?: Document, seen?: Set<Document>): Document[];

/**
 * In Safari, `position: fixed` elements are anchored to the visual viewport
 * during pinch-to-zoom, rather than the layout viewport. Returns the offset
 * needed to compensate for this behavior.
 */
declare function getFixedPositionOffset(): {
    x: number;
    y: number;
};

declare function isSafari(): boolean;

declare function getRoot(target: Event['target'] | undefined): Document | ShadowRoot;

declare function prefersReducedMotion(window: Window): boolean;

declare function cloneElement(element: Element): Element;

declare function getElementFromPoint(root: Document | ShadowRoot, { x, y }: Coordinates): Element | null;

declare const ProxiedElements: WeakMap<Element, Element>;

declare function isInteractiveElement(element: Element): boolean;
declare function getInteractiveElement(element: Element): Element | null;

interface EventListenerDescriptor {
    type: string;
    listener(event: Event): void;
    options?: AddEventListenerOptions;
}
type EventListenerInput = EventListenerDescriptor[] | EventListenerDescriptor;
declare class Listeners {
    private entries;
    constructor();
    bind(target: EventTarget | EventTarget[], input: EventListenerInput): () => void;
    clear: () => void;
}

type PositionObserverCallback = (boundingClientRect: BoundingRectangle | null) => void;

declare class FrameObserver {
    #private;
    private callback;
    constructor(element: Element, callback: PositionObserverCallback, options?: {
        debug?: boolean;
    });
    disconnect: () => void;
}

declare const Observer: {
    new (callback: ResizeObserverCallback): ResizeObserver;
    prototype: ResizeObserver;
};
declare class ResizeNotifier extends Observer {
    #private;
    constructor(callback: ResizeObserverCallback);
}

declare function showPopover(element: Element): void;

declare function hidePopover(element: Element): void;

declare function supportsPopover(element: Element): element is Element & {
    showPopover(): void;
    hidePopover(): void;
};

interface ScrollPosition$1 {
    rect: {
        width: number;
        height: number;
        top: number;
        left: number;
        bottom: number;
        right: number;
    };
    position: {
        current: {
            x: number;
            y: number;
        };
        max: {
            x: number;
            y: number;
        };
    };
    isTop: boolean;
    isLeft: boolean;
    isBottom: boolean;
    isRight: boolean;
}
declare function getScrollPosition(scrollableElement: Element): ScrollPosition$1;

declare function canScroll(scrollableElement: Element, by?: Coordinates, scrollPosition?: ScrollPosition$1): {
    top: boolean;
    bottom: boolean;
    left: boolean;
    right: boolean;
    x: boolean;
    y: boolean;
};

interface Options {
    limit?: number;
    excludeElement?: boolean;
    escapeShadowDOM?: boolean;
}
declare function getScrollableAncestors(element: Node | null, options?: Options): Set<Element>;
declare function getFirstScrollableAncestor(node: Node | null): Element | null;

declare enum ScrollDirection {
    Idle = 0,
    Forward = 1,
    Reverse = -1
}
interface ScrollIntent {
    x: ScrollDirection;
    y: ScrollDirection;
}
declare function detectScrollIntent(scrollableElement: Element, coordinates: Coordinates, intent?: ScrollIntent, acceleration?: number, thresholdPercentage?: Record<Axis, number>, tolerance?: Record<Axis, number>, scrollPosition?: ScrollPosition$1): {
    direction: Record<Axis, ScrollDirection>;
    speed: {
        x: number;
        y: number;
    };
};

declare function isDocumentScrollingElement(element: Element | null): boolean;

type ScrollPosition = 'center' | 'nearest' | 'none';
interface ScrollIntoViewOptions {
    block?: ScrollPosition;
    inline?: ScrollPosition;
}
declare function scrollIntoViewIfNeeded(el: Element, { block, inline }?: ScrollIntoViewOptions): void;

type Callback = () => void;
declare class Scheduler<T extends (callback: Callback) => any> {
    private scheduler;
    constructor(scheduler: T);
    private pending;
    private tasks;
    private resolvers;
    schedule(task: () => void): Promise<void>;
    flush: () => void;
}
declare const scheduler: Scheduler<(callback: Callback) => void>;

declare function timeout(callback: () => void, duration: number): () => void;

interface Arguments {
    element: Element;
    keyframes: PropertyIndexedKeyframes | Keyframe[];
    options: KeyframeAnimationOptions;
}
declare function animateTransform({ element, keyframes, options }: Arguments): Promise<Animation>;

declare function computeTranslate(element: Element, translate?: string, projected?: boolean): {
    x: number;
    y: number;
    z: number;
};

interface Transform extends Coordinates {
    z?: number;
    scaleX: number;
    scaleY: number;
}
declare function parseTransform(computedStyles: {
    scale?: string;
    transform: string;
    translate?: string;
}): Transform | null;

declare function inverseTransform(rect: BoundingRectangle, parsedTransform: Transform, transformOrigin: string): BoundingRectangle;

declare function parseTranslate(translate?: string): {
    x: number;
    y: number;
    z: number;
} | null;

interface DOMRectangleOptions {
    getBoundingClientRect?: (element: Element) => BoundingRectangle;
    ignoreTransforms?: boolean;
    frameTransform?: Transform | null;
}
declare class DOMRectangle extends Rectangle {
    constructor(element: Element, options?: DOMRectangleOptions);
    intrinsicWidth: number;
    intrinsicHeight: number;
}

declare class Styles {
    private element;
    private initial;
    constructor(element: Element);
    set(properties: Record<string, string | number>, prefix?: string): void;
    remove(properties: string[], prefix?: string): void;
    reset(): void;
}

/**
 * Get the computed styles for an element.
 * @param element - The element to get the computed styles for.
 * @param cached - Whether to cache the computed styles.
 * @returns The computed styles for the element.
 */
declare function getComputedStyles(element: Element, cached?: boolean): CSSStyleDeclaration;

declare function isDocument(node: Node): node is Document;

declare function isElement(target: EventTarget | null): target is Element;

declare function isHTMLElement(node: Node | Window | null | undefined): node is HTMLElement;

declare function isKeyframeEffect(effect: AnimationEffect | null | undefined): effect is KeyframeEffect;

declare function isKeyboardEvent(event: Event | null | undefined): event is KeyboardEvent;

declare function isPointerEvent(event: Event | null | undefined): event is PointerEvent;

declare function isShadowRoot(target: EventTarget | null): target is ShadowRoot;

interface ViewTransition {
    ready: Promise<void>;
    updateCallbackDone: Promise<void>;
    finished: Promise<void>;
    skipTransition(): void;
}
declare function supportsViewTransition(document: Document): document is Document & {
    startViewTransition(updateCallback: () => void): ViewTransition;
};

declare function supportsStyle(element: Element): element is Element & {
    style: CSSStyleDeclaration;
};

declare function isTextInput(target: EventTarget | null): boolean;

declare function generateUniqueId(prefix: string): string;

declare function getFrameElement(el: Element | undefined): Element | null | undefined;

declare function getFrameTransform(el: Element | undefined, boundary?: Element | null): Transform;

export { DOMRectangle, type DOMRectangleOptions, Listeners, FrameObserver as PositionObserver, ProxiedElements, ResizeNotifier, Scheduler, ScrollDirection, Styles, type Transform, animateTransform, canScroll, canUseDOM, cloneElement, computeTranslate, detectScrollIntent, generateUniqueId, getBoundingRectangle, getComputedStyles, getDocument, getDocuments, getElementFromPoint, getEventCoordinates, getFinalKeyframe, getFirstScrollableAncestor, getFixedPositionOffset, getFrameElement, getFrameTransform, getInteractiveElement, getRoot, getScrollPosition, getScrollableAncestors, getViewportBoundingRectangle, getVisibleBoundingRectangle, getWindow, hidePopover, inverseTransform, isDocument, isDocumentScrollingElement, isElement, isHTMLElement, isInteractiveElement, isKeyboardEvent, isKeyframeEffect, isPointerEvent, isSafari, isShadowRoot, isTextInput, parseTransform, parseTranslate, prefersReducedMotion, scheduler, scrollIntoViewIfNeeded, showPopover, supportsPopover, supportsStyle, supportsViewTransition, timeout };
