import { signal, effect, untracked } from '@dnd-kit/state';
import { configurator, Modifier } from '@dnd-kit/abstract';
import { restrictShapeToBoundingRectangle } from '@dnd-kit/abstract/modifiers';
import { Rectangle } from '@dnd-kit/geometry';
import { getBoundingRectangle, getViewportBoundingRectangle } from '@dnd-kit/dom/utilities';

// src/modifiers/RestrictToWindow.ts
var RestrictToWindow = class extends Modifier {
  constructor(manager) {
    super(manager);
    const { dragOperation } = manager;
    const getWindowBoundingRectangle = () => untracked(() => {
      var _a;
      const { source } = dragOperation;
      this.windowBoundingRectangle = getViewportBoundingRectangle(
        (_a = source == null ? void 0 : source.element) != null ? _a : document.documentElement
      );
    });
    this.destroy = effect(() => {
      if (dragOperation.status.idle) {
        return;
      }
      getWindowBoundingRectangle();
      window.addEventListener("resize", getWindowBoundingRectangle);
      return () => {
        window.removeEventListener("resize", getWindowBoundingRectangle);
      };
    });
  }
  apply({ shape, transform }) {
    if (!this.windowBoundingRectangle || !shape) {
      return transform;
    }
    const { initial, current } = shape;
    const { height, width } = current.boundingRectangle;
    const left = initial.center.x - width / 2;
    const top = initial.center.y - height / 2;
    const restrictedTransform = restrictShapeToBoundingRectangle(
      new Rectangle(left, top, width, height),
      transform,
      this.windowBoundingRectangle
    );
    return restrictedTransform;
  }
};
var _RestrictToElement = class _RestrictToElement extends Modifier {
  constructor(manager, options) {
    super(manager, options);
    this.boundingRectangle = signal(null);
    this.destroy = effect(() => {
      if (!this.options) {
        return;
      }
      const { dragOperation } = manager;
      const { status } = dragOperation;
      if (status.initialized) {
        const { element } = this.options;
        const target = typeof element === "function" ? element(dragOperation) : element;
        if (!target) {
          return;
        }
        let timeout;
        const updateBoundingRectangle = () => {
          this.boundingRectangle.value = getBoundingRectangle(target);
        };
        const handleScroll = () => {
          if (timeout) {
            return;
          }
          timeout = setTimeout(() => {
            updateBoundingRectangle();
            timeout = void 0;
          }, 25);
        };
        const resizeObserver = new ResizeObserver(updateBoundingRectangle);
        resizeObserver.observe(target);
        document.addEventListener("scroll", handleScroll, {
          passive: true,
          capture: true
        });
        return () => {
          document.removeEventListener("scroll", handleScroll, {
            capture: true
          });
          resizeObserver.disconnect();
          this.boundingRectangle.value = null;
        };
      }
    });
  }
  apply(operation) {
    const { shape, transform } = operation;
    if (!shape) {
      return transform;
    }
    const boundingRectangle = this.boundingRectangle.value;
    if (!boundingRectangle) {
      return transform;
    }
    const { initial, current } = shape;
    const { height, width } = current.boundingRectangle;
    const left = initial.center.x - width / 2;
    const top = initial.center.y - height / 2;
    const restrictedTransform = restrictShapeToBoundingRectangle(
      new Rectangle(left, top, width, height),
      transform,
      boundingRectangle
    );
    return restrictedTransform;
  }
};
_RestrictToElement.configure = configurator(_RestrictToElement);
var RestrictToElement = _RestrictToElement;

export { RestrictToElement, RestrictToWindow };
//# sourceMappingURL=modifiers.js.map
//# sourceMappingURL=modifiers.js.map