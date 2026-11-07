'use strict';

var state = require('@dnd-kit/state');
var abstract = require('@dnd-kit/abstract');
var utilities = require('@dnd-kit/dom/utilities');

// src/plugins/debug/debug.ts
var Debug = class extends abstract.Plugin {
  constructor(manager) {
    super(manager);
    const elements = /* @__PURE__ */ new Map();
    let draggableElement = null;
    let positionElement = null;
    const cleanup = state.effects(() => {
      const { dragOperation } = manager;
      const { x, y } = dragOperation.position.current;
      const { current: _, idle } = dragOperation.status;
      const { collisions } = manager.collisionObserver;
      const draggable = dragOperation.source;
      const topCollisions = collisions.slice(1, 3);
      const collidingIds = topCollisions.map(({ id }) => id);
      if (draggable && dragOperation.shape) {
        const element = draggableElement != null ? draggableElement : createDebugElement();
        const { boundingRectangle } = dragOperation.shape.current;
        if (!draggableElement) {
          draggableElement = element;
          const style = document.createElement("style");
          style.textContent = `dialog[data-dnd-kit-debug]::backdrop {display: none;}`;
          element.textContent = `${draggable.id}`;
          element.setAttribute("data-dnd-kit-debug", "");
          element.appendChild(style);
          element.style.backgroundColor = "rgba(118, 190, 250, 0.5)";
          element.style.color = "rgba(0,0,0,0.9)";
          document.body.appendChild(element);
        }
        const draggableOffset = utilities.getFixedPositionOffset();
        element.style.top = `${boundingRectangle.top + draggableOffset.y}px`;
        element.style.left = `${boundingRectangle.left + draggableOffset.x}px`;
        element.style.width = `${boundingRectangle.width}px`;
        element.style.height = `${boundingRectangle.height}px`;
        utilities.hidePopover(element);
        utilities.showPopover(element);
      } else {
        draggableElement == null ? void 0 : draggableElement.remove();
        draggableElement = null;
      }
      for (const [id, element] of elements) {
        if (!manager.registry.droppables.has(id)) {
          element.remove();
          elements.delete(id);
        }
      }
      for (const droppable of manager.registry.droppables) {
        const element = elements.get(droppable.id);
        if (droppable.shape) {
          const { boundingRectangle } = droppable.shape;
          const debugElement = element != null ? element : createDebugElement();
          if (!element) {
            elements.set(droppable.id, debugElement);
            document.body.appendChild(debugElement);
          }
          debugElement.style.backgroundColor = droppable.isDropTarget ? "rgba(13, 210, 36, 0.6)" : collidingIds.includes(droppable.id) ? "rgba(255, 193, 7, 0.5)" : "rgba(0, 0, 0, 0.1)";
          const droppableOffset = utilities.getFixedPositionOffset();
          debugElement.style.top = `${boundingRectangle.top + droppableOffset.y}px`;
          debugElement.style.left = `${boundingRectangle.left + droppableOffset.x}px`;
          debugElement.style.width = `${boundingRectangle.width}px`;
          debugElement.style.height = `${boundingRectangle.height}px`;
          debugElement.textContent = `${droppable.id}`;
        } else if (element) {
          element.remove();
          elements.delete(droppable.id);
        }
      }
      if (!idle) {
        if (!positionElement) {
          positionElement = createDebugElement();
          const horizontal = document.createElement("div");
          const vertical = document.createElement("div");
          horizontal.style.position = "absolute";
          horizontal.style.width = "25px";
          horizontal.style.height = "1px";
          horizontal.style.backgroundColor = "#000";
          vertical.style.position = "absolute";
          vertical.style.width = "1px";
          vertical.style.height = "25px";
          vertical.style.backgroundColor = "#000";
          positionElement.appendChild(horizontal);
          positionElement.appendChild(vertical);
          document.body.appendChild(positionElement);
        }
        const posOffset = utilities.getFixedPositionOffset();
        positionElement.style.top = `${y + posOffset.y}px`;
        positionElement.style.left = `${x + posOffset.x}px`;
        utilities.hidePopover(positionElement);
        queueMicrotask(() => positionElement && utilities.showPopover(positionElement));
      } else {
        positionElement == null ? void 0 : positionElement.remove();
        positionElement = null;
      }
    });
    this.destroy = () => {
      positionElement == null ? void 0 : positionElement.remove();
      draggableElement == null ? void 0 : draggableElement.remove();
      elements.forEach((element) => element.remove());
      cleanup();
    };
  }
};
function createDebugElement(tagName = "div") {
  const element = document.createElement(tagName);
  element.setAttribute("popover", "manual");
  element.style.all = "initial";
  element.style.position = "fixed";
  element.style.display = "flex";
  element.style.alignItems = "center";
  element.style.justifyContent = "center";
  element.style.border = "1px solid rgba(0, 0, 0, 0.1)";
  element.style.boxSizing = "border-box";
  element.style.pointerEvents = "none";
  element.style.zIndex = "calc(infinity)";
  element.style.color = "rgba(0,0,0,0.5)";
  element.style.fontFamily = "sans-serif";
  element.style.textShadow = "0 0 3px rgba(255,255,255,0.8)";
  element.style.pointerEvents = "none";
  return element;
}

exports.Debug = Debug;
//# sourceMappingURL=debug.cjs.map
//# sourceMappingURL=debug.cjs.map