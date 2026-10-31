'use strict';

var geometry = require('@dnd-kit/geometry');

var __typeError = (msg) => {
  throw TypeError(msg);
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);

// src/utilities/type-guards/isKeyframeEffect.ts
function isKeyframeEffect(effect) {
  if (!effect) return false;
  if (effect instanceof KeyframeEffect) return true;
  return "getKeyframes" in effect && typeof effect.getKeyframes === "function";
}

// src/utilities/animations/getFinalKeyframe.ts
function getFinalKeyframe(element, match) {
  const animations2 = element.getAnimations();
  let result = null;
  for (const animation of animations2) {
    if (animation.playState !== "running") continue;
    const { effect } = animation;
    const keyframes = isKeyframeEffect(effect) ? effect.getKeyframes() : [];
    const matchedKeyframes = keyframes.filter(match);
    if (matchedKeyframes.length > 0) {
      result = [matchedKeyframes[matchedKeyframes.length - 1], animation];
    }
  }
  return result;
}

// src/utilities/bounding-rectangle/getBoundingRectangle.ts
function getBoundingRectangle(element) {
  const { width, height, top, left, bottom, right } = element.getBoundingClientRect();
  return { width, height, top, left, bottom, right };
}

// src/utilities/type-guards/isWindow.ts
function isWindow(element) {
  const elementString = Object.prototype.toString.call(element);
  return elementString === "[object Window]" || // In Electron context the Window object serializes to [object global]
  elementString === "[object global]";
}

// src/utilities/type-guards/isNode.ts
function isNode(node) {
  return "nodeType" in node;
}

// src/utilities/execution-context/getWindow.ts
function getWindow(target) {
  var _a, _b, _c;
  if (!target) {
    return window;
  }
  if (isWindow(target)) {
    return target;
  }
  if (!isNode(target)) {
    return window;
  }
  if ("defaultView" in target) {
    return (_a = target.defaultView) != null ? _a : window;
  }
  return (_c = (_b = target.ownerDocument) == null ? void 0 : _b.defaultView) != null ? _c : window;
}

// src/utilities/type-guards/isDocument.ts
function isDocument(node) {
  const { Document: Document2 } = getWindow(node);
  return node instanceof Document2 || "nodeType" in node && node.nodeType === Node.DOCUMENT_NODE;
}

// src/utilities/type-guards/isHTMLElement.ts
function isHTMLElement(node) {
  if (!node || isWindow(node)) return false;
  return node instanceof getWindow(node).HTMLElement || "namespaceURI" in node && typeof node.namespaceURI === "string" && node.namespaceURI.endsWith("html");
}

// src/utilities/type-guards/isSVGElement.ts
function isSVGElement(node) {
  return node instanceof getWindow(node).SVGElement || "namespaceURI" in node && typeof node.namespaceURI === "string" && node.namespaceURI.endsWith("svg");
}

// src/utilities/execution-context/getDocument.ts
function getDocument(target) {
  if (!target) {
    return document;
  }
  if (isWindow(target)) {
    return target.document;
  }
  if (!isNode(target)) {
    return document;
  }
  if (isDocument(target)) {
    return target;
  }
  if (isHTMLElement(target) || isSVGElement(target)) {
    return target.ownerDocument;
  }
  return document;
}

// src/utilities/bounding-rectangle/getViewportBoundingRectangle.ts
function getViewportBoundingRectangle(element) {
  var _a, _b, _c, _d;
  const { documentElement } = getDocument(element);
  const vv = getWindow(element).visualViewport;
  const width = (_a = vv == null ? void 0 : vv.width) != null ? _a : documentElement.clientWidth;
  const height = (_b = vv == null ? void 0 : vv.height) != null ? _b : documentElement.clientHeight;
  const top = (_c = vv == null ? void 0 : vv.offsetTop) != null ? _c : 0;
  const left = (_d = vv == null ? void 0 : vv.offsetLeft) != null ? _d : 0;
  return {
    top,
    left,
    right: left + width,
    bottom: top + height,
    width,
    height
  };
}

// src/utilities/bounding-rectangle/isOverflowVisible.ts
function isOverflowVisible(element, style) {
  if (isDetailsElement(element) && element.open === false) {
    return false;
  }
  const { overflow, overflowX, overflowY } = getComputedStyle(element);
  return overflow === "visible" && overflowX === "visible" && overflowY === "visible";
}
function isDetailsElement(element) {
  return element.tagName === "DETAILS";
}

// src/utilities/bounding-rectangle/getVisibleBoundingRectangle.ts
function getVisibleBoundingRectangle(element, boundingClientRect = element.getBoundingClientRect(), margin = 0) {
  var _a, _b, _c, _d, _e;
  let rect = boundingClientRect;
  const { ownerDocument } = element;
  const ownerWindow = (_a = ownerDocument.defaultView) != null ? _a : window;
  let ancestor = element.parentElement;
  while (ancestor && ancestor !== ownerDocument.documentElement) {
    if (!isOverflowVisible(ancestor)) {
      const ancestorRect = ancestor.getBoundingClientRect();
      const marginTop = margin * (ancestorRect.bottom - ancestorRect.top);
      const marginRight = margin * (ancestorRect.right - ancestorRect.left);
      const marginBottom = margin * (ancestorRect.bottom - ancestorRect.top);
      const marginLeft = margin * (ancestorRect.right - ancestorRect.left);
      rect = {
        top: Math.max(rect.top, ancestorRect.top - marginTop),
        right: Math.min(rect.right, ancestorRect.right + marginRight),
        bottom: Math.min(rect.bottom, ancestorRect.bottom + marginBottom),
        left: Math.max(rect.left, ancestorRect.left - marginLeft),
        width: 0,
        // Will be calculated next
        height: 0
        // Will be calculated next
      };
      rect.width = rect.right - rect.left;
      rect.height = rect.bottom - rect.top;
    }
    ancestor = ancestor.parentElement;
  }
  const vv = ownerWindow.visualViewport;
  const viewportTop = (_b = vv == null ? void 0 : vv.offsetTop) != null ? _b : 0;
  const viewportLeft = (_c = vv == null ? void 0 : vv.offsetLeft) != null ? _c : 0;
  const viewportWidth = (_d = vv == null ? void 0 : vv.width) != null ? _d : ownerWindow.innerWidth;
  const viewportHeight = (_e = vv == null ? void 0 : vv.height) != null ? _e : ownerWindow.innerHeight;
  const viewportMarginY = margin * viewportHeight;
  const viewportMarginX = margin * viewportWidth;
  rect = {
    top: Math.max(rect.top, viewportTop - viewportMarginY),
    right: Math.min(
      rect.right,
      viewportLeft + viewportWidth + viewportMarginX
    ),
    bottom: Math.min(
      rect.bottom,
      viewportTop + viewportHeight + viewportMarginY
    ),
    left: Math.max(rect.left, viewportLeft - viewportMarginX),
    width: 0,
    // Will be calculated next
    height: 0
    // Will be calculated next
  };
  rect.width = rect.right - rect.left;
  rect.height = rect.bottom - rect.top;
  if (rect.width < 0) {
    rect.width = 0;
  }
  if (rect.height < 0) {
    rect.height = 0;
  }
  return rect;
}

// src/utilities/coordinates/getEventCoordinates.ts
function getEventCoordinates(event) {
  return {
    x: event.clientX,
    y: event.clientY
  };
}

// src/utilities/execution-context/canUseDOM.ts
var canUseDOM = typeof window !== "undefined" && typeof window.document !== "undefined" && typeof window.document.createElement !== "undefined";

// src/utilities/execution-context/getDocuments.ts
function getDocuments(rootDoc = document, seen = /* @__PURE__ */ new Set()) {
  if (seen.has(rootDoc)) return [];
  seen.add(rootDoc);
  const docs = [rootDoc];
  for (const frame of Array.from(
    rootDoc.querySelectorAll("iframe, frame")
  )) {
    try {
      const childDoc = frame.contentDocument;
      if (childDoc && !seen.has(childDoc)) {
        docs.push(...getDocuments(childDoc, seen));
      }
    } catch (e) {
    }
  }
  try {
    const win = rootDoc.defaultView;
    if (win && win !== window.top) {
      const parentWin = win.parent;
      if (parentWin && parentWin.document && parentWin.document !== rootDoc) {
        docs.push(...getDocuments(parentWin.document, seen));
      }
    }
  } catch (e) {
  }
  return docs;
}

// src/utilities/execution-context/isSafari.ts
function isSafari() {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

// src/utilities/execution-context/getFixedPositionOffset.ts
function getFixedPositionOffset() {
  var _a, _b;
  const vv = isSafari() ? window.visualViewport : null;
  return {
    x: (_a = vv == null ? void 0 : vv.offsetLeft) != null ? _a : 0,
    y: (_b = vv == null ? void 0 : vv.offsetTop) != null ? _b : 0
  };
}

// src/utilities/type-guards/isShadowRoot.ts
function isShadowRoot(target) {
  if (!target || !isNode(target)) return false;
  return target instanceof getWindow(target).ShadowRoot;
}

// src/utilities/execution-context/getRoot.ts
function getRoot(target) {
  if (target && isNode(target)) {
    let root = target.getRootNode();
    if (isShadowRoot(root)) {
      return root;
    } else if (root instanceof Document) {
      return root;
    }
  }
  return getDocument(target);
}

// src/utilities/execution-context/prefersReducedMotion.ts
function prefersReducedMotion(window2) {
  return window2.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// src/utilities/element/cloneElement.ts
function cloneElement(element) {
  const selector = "input, textarea, select, canvas, [contenteditable]";
  const clonedElement = element.cloneNode(true);
  const fields = Array.from(element.querySelectorAll(selector));
  const clonedFields = Array.from(clonedElement.querySelectorAll(selector));
  clonedFields.forEach((field, index) => {
    const originalField = fields[index];
    if (isField(field) && isField(originalField)) {
      if (field.type !== "file") {
        field.value = originalField.value;
      }
      if (field.type === "radio" && field.name) {
        field.name = `Cloned__${field.name}`;
      }
    }
    if (isCanvasElement(field) && isCanvasElement(originalField) && originalField.width > 0 && originalField.height > 0) {
      const destCtx = field.getContext("2d");
      destCtx == null ? void 0 : destCtx.drawImage(originalField, 0, 0);
    }
  });
  return clonedElement;
}
function isField(element) {
  return "value" in element;
}
function isCanvasElement(element) {
  return element.tagName === "CANVAS";
}

// src/utilities/element/getElementFromPoint.ts
function getElementFromPoint(root, { x, y }) {
  const element = root.elementFromPoint(x, y);
  if (isIFrameElement(element)) {
    const { contentDocument } = element;
    if (contentDocument) {
      const { left, top } = element.getBoundingClientRect();
      return getElementFromPoint(contentDocument, {
        x: x - left,
        y: y - top
      });
    }
  }
  return element;
}
function isIFrameElement(element) {
  return (element == null ? void 0 : element.tagName) === "IFRAME";
}

// src/utilities/element/proxiedElements.ts
var ProxiedElements = /* @__PURE__ */ new WeakMap();

// src/utilities/element/isInteractiveElement.ts
function isInteractiveElement(element) {
  return Boolean(getInteractiveElement(element));
}
function getInteractiveElement(element) {
  return element.closest(`
    input:not([disabled]),
    select:not([disabled]),
    textarea:not([disabled]),
    button:not([disabled]),
    a[href],
    [contenteditable]:not([contenteditable="false"])
  `);
}

// src/utilities/event-listeners/Listeners.ts
var Listeners = class {
  constructor() {
    this.entries = /* @__PURE__ */ new Set();
    this.clear = () => {
      for (const entry of this.entries) {
        const [target, { type, listener, options }] = entry;
        target.removeEventListener(type, listener, options);
      }
      this.entries.clear();
    };
  }
  bind(target, input) {
    const eventTargets = Array.isArray(target) ? target : [target];
    const listeners = Array.isArray(input) ? input : [input];
    const entries = [];
    for (const target2 of eventTargets) {
      for (const descriptor of listeners) {
        const { type, listener, options } = descriptor;
        const entry = [target2, descriptor];
        target2.addEventListener(type, listener, options);
        this.entries.add(entry);
        entries.push(entry);
      }
    }
    const allEntries = this.entries;
    return function cleanup() {
      for (const entry of entries) {
        const [target2, { type, listener, options }] = entry;
        target2.removeEventListener(type, listener, options);
        allEntries.delete(entry);
      }
    };
  }
};

// src/utilities/frame/getFrameElement.ts
function getFrameElement(el) {
  const refWindow = el == null ? void 0 : el.ownerDocument.defaultView;
  if (refWindow && refWindow.self !== refWindow.parent) {
    return refWindow.frameElement;
  }
}

// src/utilities/frame/getFrameElements.ts
function getFrameElements(el) {
  const frames = /* @__PURE__ */ new Set();
  let frame = getFrameElement(el);
  while (frame) {
    frames.add(frame);
    frame = getFrameElement(frame);
  }
  return frames;
}

// src/utilities/scheduling/timeout.ts
function timeout(callback, duration) {
  const id = setTimeout(callback, duration);
  return () => clearTimeout(id);
}

// src/utilities/scheduling/throttle.ts
function throttle(func, limit) {
  const time = () => performance.now();
  let cancel;
  let lastRan;
  return function(...args) {
    const context = this;
    if (!lastRan) {
      func.apply(context, args);
      lastRan = time();
    } else {
      cancel == null ? void 0 : cancel();
      cancel = timeout(
        () => {
          func.apply(context, args);
          lastRan = time();
        },
        limit - (time() - lastRan)
      );
    }
  };
}

// src/utilities/bounding-rectangle/isRectEqual.ts
function isRectEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.top == b.top && a.left == b.left && a.right == b.right && a.bottom == b.bottom;
}

// src/utilities/bounding-rectangle/isVisible.ts
function isVisible(element, boundingClientRect = element.getBoundingClientRect()) {
  const { width, height } = getVisibleBoundingRectangle(
    element,
    boundingClientRect
  );
  return width > 0 && height > 0;
}

// src/utilities/observers/ResizeNotifier.ts
var Observer = typeof ResizeObserver !== "undefined" ? ResizeObserver : class MockResizeObserver {
  observe() {
  }
  unobserve() {
  }
  disconnect() {
  }
};
var _initialized;
var ResizeNotifier = class extends Observer {
  constructor(callback) {
    super((entries) => {
      if (!__privateGet(this, _initialized)) {
        __privateSet(this, _initialized, true);
        return;
      }
      callback(entries, this);
    });
    __privateAdd(this, _initialized, false);
  }
};
_initialized = new WeakMap();

// src/utilities/observers/PositionObserver.ts
var threshold = Array.from({ length: 100 }, (_, index) => index / 100);
var THROTTLE_INTERVAL = 75;
var _visible, _previousBoundingClientRect, _resizeObserver, _positionObserver, _visibilityObserver, _debug, _disconnected, _observePosition, _PositionObserver_instances, notify_fn, updateDebug_fn;
var PositionObserver = class {
  constructor(element, callback, options = {
    debug: false,
    skipInitial: false
  }) {
    this.element = element;
    this.callback = callback;
    __privateAdd(this, _PositionObserver_instances);
    this.disconnect = () => {
      var _a, _b, _c;
      __privateSet(this, _disconnected, true);
      (_a = __privateGet(this, _resizeObserver)) == null ? void 0 : _a.disconnect();
      (_b = __privateGet(this, _positionObserver)) == null ? void 0 : _b.disconnect();
      __privateGet(this, _visibilityObserver).disconnect();
      (_c = __privateGet(this, _debug)) == null ? void 0 : _c.remove();
    };
    __privateAdd(this, _visible, true);
    __privateAdd(this, _previousBoundingClientRect);
    __privateAdd(this, _resizeObserver);
    __privateAdd(this, _positionObserver);
    __privateAdd(this, _visibilityObserver);
    __privateAdd(this, _debug);
    __privateAdd(this, _disconnected, false);
    __privateAdd(this, _observePosition, throttle(() => {
      var _a, _b, _c;
      const { element } = this;
      (_a = __privateGet(this, _positionObserver)) == null ? void 0 : _a.disconnect();
      if (__privateGet(this, _disconnected) || !__privateGet(this, _visible) || !element.isConnected) {
        return;
      }
      const root = (_b = element.ownerDocument) != null ? _b : document;
      const { innerHeight, innerWidth } = (_c = root.defaultView) != null ? _c : window;
      const clientRect = element.getBoundingClientRect();
      const visibleRect = getVisibleBoundingRectangle(element, clientRect);
      const { top, left, bottom, right } = visibleRect;
      const insetTop = -Math.floor(top);
      const insetLeft = -Math.floor(left);
      const insetRight = -Math.floor(innerWidth - right);
      const insetBottom = -Math.floor(innerHeight - bottom);
      const rootMargin = `${insetTop}px ${insetRight}px ${insetBottom}px ${insetLeft}px`;
      this.boundingClientRect = clientRect;
      __privateSet(this, _positionObserver, new IntersectionObserver(
        (entries) => {
          const [entry] = entries;
          const { intersectionRect } = entry;
          const intersectionRatio = entry.intersectionRatio !== 1 ? entry.intersectionRatio : geometry.Rectangle.intersectionRatio(
            intersectionRect,
            getVisibleBoundingRectangle(element)
          );
          if (intersectionRatio !== 1) {
            __privateGet(this, _observePosition).call(this);
          }
        },
        {
          threshold,
          rootMargin,
          root
        }
      ));
      __privateGet(this, _positionObserver).observe(element);
      __privateMethod(this, _PositionObserver_instances, notify_fn).call(this);
    }, THROTTLE_INTERVAL));
    this.boundingClientRect = element.getBoundingClientRect();
    __privateSet(this, _visible, isVisible(element, this.boundingClientRect));
    let initial = true;
    this.callback = (boundingClientRect) => {
      if (initial) {
        initial = false;
        if (options.skipInitial) return;
      }
      callback(boundingClientRect);
    };
    const root = element.ownerDocument;
    if (options == null ? void 0 : options.debug) {
      __privateSet(this, _debug, document.createElement("div"));
      __privateGet(this, _debug).style.background = "rgba(0,0,0,0.15)";
      __privateGet(this, _debug).style.position = "fixed";
      __privateGet(this, _debug).style.pointerEvents = "none";
      root.body.appendChild(__privateGet(this, _debug));
    }
    __privateSet(this, _visibilityObserver, new IntersectionObserver(
      (entries) => {
        var _a, _b;
        const entry = entries[entries.length - 1];
        const { boundingClientRect, isIntersecting: visible } = entry;
        const { width, height } = boundingClientRect;
        const previousVisible = __privateGet(this, _visible);
        __privateSet(this, _visible, visible);
        if (!width && !height) return;
        if (previousVisible && !visible) {
          (_a = __privateGet(this, _positionObserver)) == null ? void 0 : _a.disconnect();
          this.callback(null);
          (_b = __privateGet(this, _resizeObserver)) == null ? void 0 : _b.disconnect();
          __privateSet(this, _resizeObserver, void 0);
          if (__privateGet(this, _debug)) __privateGet(this, _debug).style.visibility = "hidden";
        } else {
          __privateGet(this, _observePosition).call(this);
        }
        if (visible && !__privateGet(this, _resizeObserver)) {
          __privateSet(this, _resizeObserver, new ResizeNotifier(__privateGet(this, _observePosition)));
          __privateGet(this, _resizeObserver).observe(element);
        }
      },
      {
        threshold,
        root
      }
    ));
    if (__privateGet(this, _visible) && !options.skipInitial) {
      this.callback(this.boundingClientRect);
    }
    __privateGet(this, _visibilityObserver).observe(element);
  }
};
_visible = new WeakMap();
_previousBoundingClientRect = new WeakMap();
_resizeObserver = new WeakMap();
_positionObserver = new WeakMap();
_visibilityObserver = new WeakMap();
_debug = new WeakMap();
_disconnected = new WeakMap();
_observePosition = new WeakMap();
_PositionObserver_instances = new WeakSet();
notify_fn = function() {
  if (__privateGet(this, _disconnected)) return;
  __privateMethod(this, _PositionObserver_instances, updateDebug_fn).call(this);
  if (isRectEqual(this.boundingClientRect, __privateGet(this, _previousBoundingClientRect)))
    return;
  this.callback(this.boundingClientRect);
  __privateSet(this, _previousBoundingClientRect, this.boundingClientRect);
};
updateDebug_fn = function() {
  if (__privateGet(this, _debug)) {
    const { top, left, width, height } = getVisibleBoundingRectangle(
      this.element
    );
    __privateGet(this, _debug).style.overflow = "hidden";
    __privateGet(this, _debug).style.visibility = "visible";
    __privateGet(this, _debug).style.top = `${Math.floor(top)}px`;
    __privateGet(this, _debug).style.left = `${Math.floor(left)}px`;
    __privateGet(this, _debug).style.width = `${Math.floor(width)}px`;
    __privateGet(this, _debug).style.height = `${Math.floor(height)}px`;
  }
};

// src/utilities/observers/FrameObserver.ts
var framePositionObservers = /* @__PURE__ */ new WeakMap();
var scrollListeners = /* @__PURE__ */ new WeakMap();
function addFrameListener(frame, callback) {
  let cached = framePositionObservers.get(frame);
  if (!cached) {
    const observer = new PositionObserver(
      frame,
      (boundingClientRect) => {
        const cached2 = framePositionObservers.get(frame);
        if (!cached2) return;
        cached2.callbacks.forEach((callback2) => callback2(boundingClientRect));
      },
      { skipInitial: true }
    );
    cached = { disconnect: observer.disconnect, callbacks: /* @__PURE__ */ new Set() };
  }
  cached.callbacks.add(callback);
  framePositionObservers.set(frame, cached);
  return () => {
    cached.callbacks.delete(callback);
    if (cached.callbacks.size === 0) {
      framePositionObservers.delete(frame);
      cached.disconnect();
    }
  };
}
function observeParentFrames(frames, callback) {
  const cleanup = /* @__PURE__ */ new Set();
  for (const frame of frames) {
    const remove = addFrameListener(frame, callback);
    cleanup.add(remove);
  }
  return () => cleanup.forEach((remove) => remove());
}
function addScrollListener(element, callback) {
  var _a;
  const doc = element.ownerDocument;
  if (!scrollListeners.has(doc)) {
    const controller = new AbortController();
    const listeners2 = /* @__PURE__ */ new Set();
    document.addEventListener(
      "scroll",
      (event) => listeners2.forEach((listener) => listener(event)),
      {
        capture: true,
        passive: true,
        signal: controller.signal
      }
    );
    scrollListeners.set(doc, { disconnect: () => controller.abort(), listeners: listeners2 });
  }
  const { listeners, disconnect } = (_a = scrollListeners.get(doc)) != null ? _a : {};
  if (!listeners || !disconnect) return () => {
  };
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0) {
      disconnect();
      scrollListeners.delete(doc);
    }
  };
}
var _elementObserver, _disconnected2, _frames, _handleScroll;
var FrameObserver = class {
  constructor(element, callback, options) {
    this.callback = callback;
    __privateAdd(this, _elementObserver);
    __privateAdd(this, _disconnected2, false);
    __privateAdd(this, _frames);
    __privateAdd(this, _handleScroll, throttle((event) => {
      if (__privateGet(this, _disconnected2)) return;
      if (!event.target) return;
      if ("contains" in event.target && typeof event.target.contains === "function") {
        for (const frame of __privateGet(this, _frames)) {
          if (event.target.contains(frame)) {
            this.callback(__privateGet(this, _elementObserver).boundingClientRect);
            break;
          }
        }
      }
    }, THROTTLE_INTERVAL));
    const frames = getFrameElements(element);
    const unobserveParentFrames = observeParentFrames(frames, callback);
    const removeScrollListener = addScrollListener(element, __privateGet(this, _handleScroll));
    __privateSet(this, _frames, frames);
    __privateSet(this, _elementObserver, new PositionObserver(element, callback, options));
    this.disconnect = () => {
      if (__privateGet(this, _disconnected2)) return;
      __privateSet(this, _disconnected2, true);
      unobserveParentFrames();
      removeScrollListener();
      __privateGet(this, _elementObserver).disconnect();
    };
  }
};
_elementObserver = new WeakMap();
_disconnected2 = new WeakMap();
_frames = new WeakMap();
_handleScroll = new WeakMap();

// src/utilities/popover/supportsPopover.ts
function supportsPopover(element) {
  return "showPopover" in element && "hidePopover" in element && typeof element.showPopover === "function" && typeof element.hidePopover === "function";
}

// src/utilities/popover/showPopover.ts
function showPopover(element) {
  try {
    if (supportsPopover(element) && element.isConnected && element.hasAttribute("popover") && // This selector can throw an error in browsers that don't support it
    !element.matches(":popover-open")) {
      element.showPopover();
    }
  } catch (error) {
  }
}

// src/utilities/popover/hidePopover.ts
function hidePopover(element) {
  try {
    if (supportsPopover(element) && element.isConnected && element.hasAttribute("popover") && // This selector can throw an error in browsers that don't support it
    element.matches(":popover-open")) {
      element.hidePopover();
    }
  } catch (error) {
  }
}

// src/utilities/scroll/documentScrollingElement.ts
function isDocumentScrollingElement(element) {
  if (!canUseDOM || !element) {
    return false;
  }
  return element === getDocument(element).scrollingElement;
}

// src/utilities/scroll/getScrollPosition.ts
function getScrollPosition(scrollableElement) {
  var _a, _b;
  const window2 = getWindow(scrollableElement);
  const rect = isDocumentScrollingElement(scrollableElement) ? getViewportBoundingRectangle(scrollableElement) : getBoundingRectangle(scrollableElement);
  const vv = window2.visualViewport;
  const dimensions = isDocumentScrollingElement(scrollableElement) ? {
    height: (_a = vv == null ? void 0 : vv.height) != null ? _a : window2.innerHeight,
    width: (_b = vv == null ? void 0 : vv.width) != null ? _b : window2.innerWidth
  } : {
    height: scrollableElement.clientHeight,
    width: scrollableElement.clientWidth
  };
  const position = {
    current: {
      x: scrollableElement.scrollLeft,
      y: scrollableElement.scrollTop
    },
    max: {
      x: scrollableElement.scrollWidth - dimensions.width,
      y: scrollableElement.scrollHeight - dimensions.height
    }
  };
  const isTop = position.current.y <= 0;
  const isLeft = position.current.x <= 0;
  const isBottom = position.current.y >= position.max.y;
  const isRight = position.current.x >= position.max.x;
  return {
    rect,
    position,
    isTop,
    isLeft,
    isBottom,
    isRight
  };
}

// src/utilities/scroll/canScroll.ts
function canScroll(scrollableElement, by, scrollPosition = getScrollPosition(scrollableElement)) {
  const { isTop, isBottom, isLeft, isRight, position } = scrollPosition;
  const { x, y } = by != null ? by : { x: 0, y: 0 };
  const top = !isTop && position.current.y + y > 0;
  const bottom = !isBottom && position.current.y + y < position.max.y;
  const left = !isLeft && position.current.x + x > 0;
  const right = !isRight && position.current.x + x < position.max.x;
  return {
    top,
    bottom,
    left,
    right,
    x: left || right,
    y: top || bottom
  };
}

// src/utilities/scheduling/scheduler.ts
var Scheduler = class {
  constructor(scheduler4) {
    this.scheduler = scheduler4;
    this.pending = false;
    this.tasks = /* @__PURE__ */ new Set();
    this.resolvers = /* @__PURE__ */ new Set();
    this.flush = () => {
      const { tasks, resolvers } = this;
      this.pending = false;
      this.tasks = /* @__PURE__ */ new Set();
      this.resolvers = /* @__PURE__ */ new Set();
      for (const task of tasks) {
        task();
      }
      for (const resolve of resolvers) {
        resolve();
      }
    };
  }
  schedule(task) {
    this.tasks.add(task);
    if (!this.pending) {
      this.pending = true;
      this.scheduler(this.flush);
    }
    return new Promise((resolve) => this.resolvers.add(resolve));
  }
};
var scheduler = new Scheduler((callback) => {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(callback);
  } else {
    callback();
  }
});

// src/utilities/styles/getComputedStyles.ts
var scheduler2 = new Scheduler((callback) => setTimeout(callback, 50));
var cachedStyles = /* @__PURE__ */ new Map();
var clear = cachedStyles.clear.bind(cachedStyles);
function getComputedStyles(element, cached = false) {
  if (!cached) return computeStyles(element);
  let styles = cachedStyles.get(element);
  if (styles) return styles;
  styles = computeStyles(element);
  cachedStyles.set(element, styles);
  scheduler2.schedule(clear);
  return styles;
}
function computeStyles(element) {
  return getWindow(element).getComputedStyle(element);
}

// src/utilities/scroll/isFixed.ts
function isFixed(node, computedStyle = getComputedStyles(node, true)) {
  return computedStyle.position === "fixed" || computedStyle.position === "sticky";
}

// src/utilities/scroll/isScrollable.ts
function isScrollable(element, computedStyle = getComputedStyles(element, true)) {
  const overflowRegex = /(auto|scroll|overlay)/;
  const properties = ["overflow", "overflowX", "overflowY"];
  return properties.some((property) => {
    const value = computedStyle[property];
    return typeof value === "string" ? overflowRegex.test(value) : false;
  });
}

// src/utilities/scroll/getScrollableAncestors.ts
var defaultOptions = {
  excludeElement: true,
  escapeShadowDOM: true
};
function getScrollableAncestors(element, options = defaultOptions) {
  const { limit, excludeElement, escapeShadowDOM } = options;
  const scrollParents = /* @__PURE__ */ new Set();
  function findScrollableAncestors(node) {
    if (limit != null && scrollParents.size >= limit) {
      return scrollParents;
    }
    if (!node) {
      return scrollParents;
    }
    if (isDocument(node) && node.scrollingElement != null && !scrollParents.has(node.scrollingElement)) {
      scrollParents.add(node.scrollingElement);
      return scrollParents;
    }
    if (escapeShadowDOM && isShadowRoot(node)) {
      return findScrollableAncestors(node.host);
    }
    if (!isHTMLElement(node)) {
      if (isSVGElement(node)) {
        return findScrollableAncestors(node.parentElement);
      }
      return scrollParents;
    }
    if (scrollParents.has(node)) {
      return scrollParents;
    }
    const computedStyle = getComputedStyles(node, true);
    if (excludeElement && node === element) ; else if (isScrollable(node, computedStyle)) {
      scrollParents.add(node);
    }
    if (isFixed(node, computedStyle)) {
      const { scrollingElement } = node.ownerDocument;
      if (scrollingElement) scrollParents.add(scrollingElement);
      return scrollParents;
    }
    return findScrollableAncestors(node.parentNode);
  }
  if (!element) {
    return scrollParents;
  }
  return findScrollableAncestors(element);
}
function getFirstScrollableAncestor(node) {
  const [firstScrollableAncestor] = getScrollableAncestors(node, { limit: 1 });
  return firstScrollableAncestor != null ? firstScrollableAncestor : null;
}

// src/utilities/frame/getFrameTransform.ts
function getFrameTransform(el, boundary = window.frameElement) {
  const transform = {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1
  };
  if (!el) return transform;
  let frame = getFrameElement(el);
  while (frame) {
    if (frame === boundary) {
      return transform;
    }
    const rect = getBoundingRectangle(frame);
    const { x: scaleX, y: scaleY } = getScale(frame, rect);
    transform.x = transform.x + rect.left;
    transform.y = transform.y + rect.top;
    transform.scaleX = transform.scaleX * scaleX;
    transform.scaleY = transform.scaleY * scaleY;
    frame = getFrameElement(frame);
  }
  return transform;
}
function getScale(element, boundingRectangle = getBoundingRectangle(element)) {
  const width = Math.round(boundingRectangle.width);
  const height = Math.round(boundingRectangle.height);
  if (isHTMLElement(element)) {
    return {
      x: width / element.offsetWidth,
      y: height / element.offsetHeight
    };
  }
  const styles = getComputedStyles(element, true);
  return {
    x: (parseFloat(styles.width) || width) / width,
    y: (parseFloat(styles.height) || height) / height
  };
}

// src/utilities/transform/parseScale.ts
function parseScale(scale) {
  if (!scale || scale === "none") {
    return null;
  }
  const values = scale.split(" ");
  const x = parseFloat(values[0]);
  const y = parseFloat(values[1]);
  if (isNaN(x) && isNaN(y)) {
    return null;
  }
  return {
    x: isNaN(x) ? y : x,
    y: isNaN(y) ? x : y
  };
}

// src/utilities/transform/parseTranslate.ts
function parseTranslate(translate) {
  if (!translate || translate === "none") {
    return null;
  }
  const [x, y, z = "0"] = translate.split(" ");
  const output = { x: parseFloat(x), y: parseFloat(y), z: parseInt(z, 10) };
  if (isNaN(output.x) && isNaN(output.y)) {
    return null;
  }
  return {
    x: isNaN(output.x) ? 0 : output.x,
    y: isNaN(output.y) ? 0 : output.y,
    z: isNaN(output.z) ? 0 : output.z
  };
}

// src/utilities/transform/parseTransform.ts
function parseTransform(computedStyles) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i;
  const { scale, transform, translate } = computedStyles;
  const parsedScale = parseScale(scale);
  const parsedTranslate = parseTranslate(translate);
  const parsedMatrix = parseTransformMatrix(transform);
  if (!parsedMatrix && !parsedScale && !parsedTranslate) {
    return null;
  }
  const normalizedScale = {
    x: (_a = parsedScale == null ? void 0 : parsedScale.x) != null ? _a : 1,
    y: (_b = parsedScale == null ? void 0 : parsedScale.y) != null ? _b : 1
  };
  const normalizedTranslate = {
    x: (_c = parsedTranslate == null ? void 0 : parsedTranslate.x) != null ? _c : 0,
    y: (_d = parsedTranslate == null ? void 0 : parsedTranslate.y) != null ? _d : 0
  };
  const normalizedMatrix = {
    x: (_e = parsedMatrix == null ? void 0 : parsedMatrix.x) != null ? _e : 0,
    y: (_f = parsedMatrix == null ? void 0 : parsedMatrix.y) != null ? _f : 0,
    scaleX: (_g = parsedMatrix == null ? void 0 : parsedMatrix.scaleX) != null ? _g : 1,
    scaleY: (_h = parsedMatrix == null ? void 0 : parsedMatrix.scaleY) != null ? _h : 1
  };
  return {
    x: normalizedTranslate.x + normalizedMatrix.x,
    y: normalizedTranslate.y + normalizedMatrix.y,
    z: (_i = parsedTranslate == null ? void 0 : parsedTranslate.z) != null ? _i : 0,
    scaleX: normalizedScale.x * normalizedMatrix.scaleX,
    scaleY: normalizedScale.y * normalizedMatrix.scaleY
  };
}
function parseTransformMatrix(transform) {
  if (transform.startsWith("matrix3d(")) {
    const transformArray = transform.slice(9, -1).split(/, /);
    return {
      x: +transformArray[12],
      y: +transformArray[13],
      scaleX: +transformArray[0],
      scaleY: +transformArray[5]
    };
  } else if (transform.startsWith("matrix(")) {
    const transformArray = transform.slice(7, -1).split(/, /);
    return {
      x: +transformArray[4],
      y: +transformArray[5],
      scaleX: +transformArray[0],
      scaleY: +transformArray[3]
    };
  }
  return null;
}

// src/utilities/scroll/detectScrollIntent.ts
var ScrollDirection = /* @__PURE__ */ ((ScrollDirection2) => {
  ScrollDirection2[ScrollDirection2["Idle"] = 0] = "Idle";
  ScrollDirection2[ScrollDirection2["Forward"] = 1] = "Forward";
  ScrollDirection2[ScrollDirection2["Reverse"] = -1] = "Reverse";
  return ScrollDirection2;
})(ScrollDirection || {});
var defaultThreshold = {
  x: 0.2,
  y: 0.2
};
var defaultTolerance = {
  x: 10,
  y: 10
};
function detectScrollIntent(scrollableElement, coordinates, intent, acceleration = 25, thresholdPercentage = defaultThreshold, tolerance = defaultTolerance, scrollPosition = getScrollPosition(scrollableElement)) {
  const { x, y } = coordinates;
  const { rect, isTop, isBottom, isLeft, isRight } = scrollPosition;
  const frameTransform = getFrameTransform(scrollableElement);
  const computedStyles = getComputedStyles(scrollableElement, true);
  const parsedTransform = parseTransform(computedStyles);
  const isXAxisInverted = parsedTransform !== null ? (parsedTransform == null ? void 0 : parsedTransform.scaleX) < 0 : false;
  const isYAxisInverted = parsedTransform !== null ? (parsedTransform == null ? void 0 : parsedTransform.scaleY) < 0 : false;
  const scrollContainerRect = new geometry.Rectangle(
    rect.left * frameTransform.scaleX + frameTransform.x,
    rect.top * frameTransform.scaleY + frameTransform.y,
    rect.width * frameTransform.scaleX,
    rect.height * frameTransform.scaleY
  );
  const direction = {
    x: 0 /* Idle */,
    y: 0 /* Idle */
  };
  const speed = {
    x: 0,
    y: 0
  };
  const threshold2 = {
    height: scrollContainerRect.height * thresholdPercentage.y,
    width: scrollContainerRect.width * thresholdPercentage.x
  };
  if (threshold2.height > 0 && (!isTop || isYAxisInverted && !isBottom) && y <= scrollContainerRect.top + threshold2.height && (intent == null ? void 0 : intent.y) !== 1 /* Forward */ && x >= scrollContainerRect.left - tolerance.x && x <= scrollContainerRect.right + tolerance.x) {
    direction.y = isYAxisInverted ? 1 /* Forward */ : -1 /* Reverse */;
    speed.y = acceleration * Math.abs(
      (scrollContainerRect.top + threshold2.height - y) / threshold2.height
    );
  } else if (threshold2.height > 0 && (!isBottom || isYAxisInverted && !isTop) && y >= scrollContainerRect.bottom - threshold2.height && (intent == null ? void 0 : intent.y) !== -1 /* Reverse */ && x >= scrollContainerRect.left - tolerance.x && x <= scrollContainerRect.right + tolerance.x) {
    direction.y = isYAxisInverted ? -1 /* Reverse */ : 1 /* Forward */;
    speed.y = acceleration * Math.abs(
      (scrollContainerRect.bottom - threshold2.height - y) / threshold2.height
    );
  }
  if (threshold2.width > 0 && (!isRight || isXAxisInverted && !isLeft) && x >= scrollContainerRect.right - threshold2.width && (intent == null ? void 0 : intent.x) !== -1 /* Reverse */ && y >= scrollContainerRect.top - tolerance.y && y <= scrollContainerRect.bottom + tolerance.y) {
    direction.x = isXAxisInverted ? -1 /* Reverse */ : 1 /* Forward */;
    speed.x = acceleration * Math.abs(
      (scrollContainerRect.right - threshold2.width - x) / threshold2.width
    );
  } else if (threshold2.width > 0 && (!isLeft || isXAxisInverted && !isRight) && x <= scrollContainerRect.left + threshold2.width && (intent == null ? void 0 : intent.x) !== 1 /* Forward */ && y >= scrollContainerRect.top - tolerance.y && y <= scrollContainerRect.bottom + tolerance.y) {
    direction.x = isXAxisInverted ? 1 /* Forward */ : -1 /* Reverse */;
    speed.x = acceleration * Math.abs(
      (scrollContainerRect.left + threshold2.width - x) / threshold2.width
    );
  }
  return {
    direction,
    speed
  };
}

// src/utilities/scroll/scrollIntoViewIfNeeded.ts
function scrollIntoViewIfNeeded(el, { block = "nearest", inline = "nearest" } = {}) {
  if (!isHTMLElement(el)) {
    return;
  }
  const scrollableAncestors = getScrollableAncestors(el);
  const processedAncestors = [];
  for (const ancestor of scrollableAncestors) {
    if (!isHTMLElement(ancestor)) {
      continue;
    }
    const { top, left } = getOffsetRelativeTo(el, ancestor);
    let adjustedTop = top;
    let adjustedLeft = left;
    for (const inner of processedAncestors) {
      adjustedTop -= inner.scrollTop;
      adjustedLeft -= inner.scrollLeft;
    }
    if (block !== "none") {
      const overTop = adjustedTop < ancestor.scrollTop;
      const overBottom = adjustedTop + el.offsetHeight > ancestor.scrollTop + ancestor.clientHeight;
      if (overTop !== overBottom) {
        if (block === "center") {
          ancestor.scrollTop = adjustedTop - ancestor.clientHeight / 2 + el.offsetHeight / 2;
        } else if (overTop) {
          ancestor.scrollTop = adjustedTop;
        } else {
          ancestor.scrollTop = adjustedTop + el.offsetHeight - ancestor.clientHeight;
        }
      }
    }
    if (inline !== "none") {
      const overLeft = adjustedLeft < ancestor.scrollLeft;
      const overRight = adjustedLeft + el.offsetWidth > ancestor.scrollLeft + ancestor.clientWidth;
      if (overLeft !== overRight) {
        if (inline === "center") {
          ancestor.scrollLeft = adjustedLeft - ancestor.clientWidth / 2 + el.offsetWidth / 2;
        } else if (overLeft) {
          ancestor.scrollLeft = adjustedLeft;
        } else {
          ancestor.scrollLeft = adjustedLeft + el.offsetWidth - ancestor.clientWidth;
        }
      }
    }
    processedAncestors.push(ancestor);
  }
}
function getDocumentOffset(element) {
  let top = 0;
  let left = 0;
  let current = element;
  while (current) {
    top += current.offsetTop;
    left += current.offsetLeft;
    const offsetParent = current.offsetParent;
    if (!isHTMLElement(offsetParent)) {
      break;
    }
    top += offsetParent.clientTop;
    left += offsetParent.clientLeft;
    current = offsetParent;
  }
  return { top, left };
}
function getOffsetRelativeTo(element, ancestor) {
  const elOffset = getDocumentOffset(element);
  const ancestorOffset = getDocumentOffset(ancestor);
  return {
    top: elOffset.top - ancestorOffset.top - ancestor.clientTop,
    left: elOffset.left - ancestorOffset.left - ancestor.clientLeft
  };
}

// src/utilities/transform/applyTransform.ts
function applyTransform(rect, parsedTransform, transformOrigin) {
  const { scaleX, scaleY, x: translateX, y: translateY } = parsedTransform;
  const x = rect.left + translateX + (1 - scaleX) * parseFloat(transformOrigin);
  const y = rect.top + translateY + (1 - scaleY) * parseFloat(transformOrigin.slice(transformOrigin.indexOf(" ") + 1));
  const w = scaleX ? rect.width * scaleX : rect.width;
  const h = scaleY ? rect.height * scaleY : rect.height;
  return {
    width: w,
    height: h,
    top: y,
    right: x + w,
    bottom: y + h,
    left: x
  };
}

// src/utilities/transform/inverseTransform.ts
function inverseTransform(rect, parsedTransform, transformOrigin) {
  const { scaleX, scaleY, x: translateX, y: translateY } = parsedTransform;
  const x = rect.left - translateX - (1 - scaleX) * parseFloat(transformOrigin);
  const y = rect.top - translateY - (1 - scaleY) * parseFloat(transformOrigin.slice(transformOrigin.indexOf(" ") + 1));
  const w = scaleX ? rect.width / scaleX : rect.width;
  const h = scaleY ? rect.height / scaleY : rect.height;
  return {
    width: w,
    height: h,
    top: y,
    right: x + w,
    bottom: y + h,
    left: x
  };
}

// src/utilities/transform/animateTransform.ts
function animateTransform({ element, keyframes, options }) {
  return element.animate(keyframes, options).finished;
}

// src/utilities/transform/computeTranslate.ts
function computeTranslate(element, translate = getComputedStyles(element).translate, projected = true) {
  if (projected) {
    const keyframe = getFinalKeyframe(
      element,
      (keyframe2) => "translate" in keyframe2
    );
    if (keyframe) {
      const { translate: translate2 = "" } = keyframe[0];
      if (typeof translate2 === "string") {
        const finalTranslate = parseTranslate(translate2);
        if (finalTranslate) {
          return finalTranslate;
        }
      }
    }
  }
  if (translate) {
    const finalTranslate = parseTranslate(translate);
    if (finalTranslate) {
      return finalTranslate;
    }
  }
  return { x: 0, y: 0, z: 0 };
}

// src/utilities/animations/forceFinishAnimations.ts
var scheduler3 = new Scheduler((callback) => setTimeout(callback, 0));
var animations = /* @__PURE__ */ new Map();
var clear2 = animations.clear.bind(animations);
function getDocumentAnimations(element) {
  const document2 = element.ownerDocument;
  let documentAnimations = animations.get(document2);
  if (documentAnimations) return documentAnimations;
  documentAnimations = document2.getAnimations();
  animations.set(document2, documentAnimations);
  scheduler3.schedule(clear2);
  const elementAnimations = documentAnimations.filter(
    (animation) => isKeyframeEffect(animation.effect) && animation.effect.target === element
  );
  animations.set(element, elementAnimations);
  return documentAnimations;
}
function forceFinishAnimations(element, options) {
  const animations2 = getDocumentAnimations(element).filter((animation) => {
    var _a, _b;
    if (isKeyframeEffect(animation.effect)) {
      const { target } = animation.effect;
      const isValidTarget = (_b = target && ((_a = options.isValidTarget) == null ? void 0 : _a.call(options, target))) != null ? _b : true;
      if (isValidTarget) {
        return animation.effect.getKeyframes().some((keyframe) => {
          for (const property of options.properties) {
            if (keyframe[property]) return true;
          }
        });
      }
    }
  }).map((animation) => {
    const { effect, currentTime } = animation;
    const duration = effect == null ? void 0 : effect.getComputedTiming().duration;
    if (animation.pending || animation.playState === "finished") return;
    if (typeof duration == "number" && typeof currentTime == "number" && currentTime < duration) {
      animation.currentTime = duration;
      return () => {
        animation.currentTime = currentTime;
      };
    }
  });
  if (animations2.length > 0) {
    return () => animations2.forEach((reset) => reset == null ? void 0 : reset());
  }
}

// src/utilities/shapes/DOMRectangle.ts
var DOMRectangle = class extends geometry.Rectangle {
  constructor(element, options = {}) {
    var _a, _b, _c, _d;
    const {
      frameTransform = getFrameTransform(element),
      ignoreTransforms,
      getBoundingClientRect = getBoundingRectangle
    } = options;
    const resetAnimations = forceFinishAnimations(element, {
      properties: ["transform", "translate", "scale", "width", "height"],
      isValidTarget: (target) => (target !== element || isSafari()) && target.contains(element)
    });
    const boundingRectangle = getBoundingClientRect(element);
    let { top, left, width, height } = boundingRectangle;
    let updated;
    const computedStyles = getComputedStyles(element);
    const parsedTransform = parseTransform(computedStyles);
    const scale = {
      x: (_a = parsedTransform == null ? void 0 : parsedTransform.scaleX) != null ? _a : 1,
      y: (_b = parsedTransform == null ? void 0 : parsedTransform.scaleY) != null ? _b : 1
    };
    const projectedTransform = getProjectedTransform(element, computedStyles);
    resetAnimations == null ? void 0 : resetAnimations();
    if (parsedTransform) {
      updated = inverseTransform(
        boundingRectangle,
        parsedTransform,
        computedStyles.transformOrigin
      );
      if (ignoreTransforms || projectedTransform) {
        top = updated.top;
        left = updated.left;
        width = updated.width;
        height = updated.height;
      }
    }
    const intrinsic = {
      width: (_c = updated == null ? void 0 : updated.width) != null ? _c : width,
      height: (_d = updated == null ? void 0 : updated.height) != null ? _d : height
    };
    if (projectedTransform && !ignoreTransforms && updated) {
      const projected = applyTransform(
        updated,
        projectedTransform,
        computedStyles.transformOrigin
      );
      top = projected.top;
      left = projected.left;
      width = projected.width;
      height = projected.height;
      scale.x = projectedTransform.scaleX;
      scale.y = projectedTransform.scaleY;
    }
    if (frameTransform) {
      if (!ignoreTransforms) {
        left *= frameTransform.scaleX;
        width *= frameTransform.scaleX;
        top *= frameTransform.scaleY;
        height *= frameTransform.scaleY;
      }
      left += frameTransform.x;
      top += frameTransform.y;
    }
    super(left, top, width, height);
    this.scale = scale;
    this.intrinsicWidth = intrinsic.width;
    this.intrinsicHeight = intrinsic.height;
  }
};
function getProjectedTransform(element, computedStyles) {
  const animations2 = element.getAnimations();
  if (!animations2.length) return null;
  let latestTransform;
  let latestTranslate;
  let latestScale;
  let hasAnimatedProperty = false;
  for (const animation of animations2) {
    if (animation.playState !== "running") continue;
    const keyframes = isKeyframeEffect(animation.effect) ? animation.effect.getKeyframes() : [];
    const keyframe = keyframes[keyframes.length - 1];
    if (!keyframe) continue;
    const { transform, translate, scale } = keyframe;
    if (typeof transform === "string" && transform) {
      latestTransform = transform;
      hasAnimatedProperty = true;
    }
    if (typeof translate === "string" && translate) {
      latestTranslate = translate;
      hasAnimatedProperty = true;
    }
    if (typeof scale === "string" && scale) {
      latestScale = scale;
      hasAnimatedProperty = true;
    }
  }
  if (!hasAnimatedProperty) return null;
  return parseTransform({
    transform: latestTransform != null ? latestTransform : computedStyles.transform,
    translate: latestTranslate != null ? latestTranslate : computedStyles.translate,
    scale: latestScale != null ? latestScale : computedStyles.scale
  });
}

// src/utilities/type-guards/supportsStyle.ts
function supportsStyle(element) {
  return "style" in element && typeof element.style === "object" && element.style !== null && "setProperty" in element.style && "removeProperty" in element.style && typeof element.style.setProperty === "function" && typeof element.style.removeProperty === "function";
}

// src/utilities/styles/Styles.ts
var Styles = class {
  constructor(element) {
    this.element = element;
    this.initial = /* @__PURE__ */ new Map();
  }
  set(properties, prefix = "") {
    const { element } = this;
    if (!supportsStyle(element)) {
      return;
    }
    for (const [key, value] of Object.entries(properties)) {
      const property = `${prefix}${key}`;
      if (!this.initial.has(property)) {
        this.initial.set(property, element.style.getPropertyValue(property));
      }
      element.style.setProperty(
        property,
        typeof value === "string" ? value : `${value}px`
      );
    }
  }
  remove(properties, prefix = "") {
    const { element } = this;
    if (!supportsStyle(element)) {
      return;
    }
    for (const key of properties) {
      const property = `${prefix}${key}`;
      element.style.removeProperty(property);
    }
  }
  reset() {
    const { element } = this;
    if (!supportsStyle(element)) {
      return;
    }
    for (const [key, value] of this.initial) {
      element.style.setProperty(key, value);
    }
    if (element.getAttribute("style") === "") {
      element.removeAttribute("style");
    }
  }
};

// src/utilities/type-guards/isElement.ts
function isElement(target) {
  if (!target) return false;
  return target instanceof getWindow(target).Element || isNode(target) && target.nodeType === Node.ELEMENT_NODE;
}

// src/utilities/type-guards/isKeyboardEvent.ts
function isKeyboardEvent(event) {
  if (!event) return false;
  const { KeyboardEvent } = getWindow(event.target);
  return event instanceof KeyboardEvent;
}

// src/utilities/type-guards/isPointerEvent.ts
function isPointerEvent(event) {
  if (!event) return false;
  const { PointerEvent } = getWindow(event.target);
  return event instanceof PointerEvent;
}

// src/utilities/type-guards/supportsViewTransition.ts
function supportsViewTransition(document2) {
  return "startViewTransition" in document2;
}

// src/utilities/type-guards/isTextInput.ts
function isTextInput(target) {
  if (!isElement(target)) return false;
  const { tagName } = target;
  return tagName === "INPUT" || tagName === "TEXTAREA" || isContentEditable(target);
}
function isContentEditable(element) {
  return element.hasAttribute("contenteditable") && element.getAttribute("contenteditable") !== "false";
}

// src/utilities/misc/generateUniqueId.ts
var ids = {};
function generateUniqueId(prefix) {
  const id = ids[prefix] == null ? 0 : ids[prefix] + 1;
  ids[prefix] = id;
  return `${prefix}-${id}`;
}

exports.DOMRectangle = DOMRectangle;
exports.Listeners = Listeners;
exports.PositionObserver = FrameObserver;
exports.ProxiedElements = ProxiedElements;
exports.ResizeNotifier = ResizeNotifier;
exports.Scheduler = Scheduler;
exports.ScrollDirection = ScrollDirection;
exports.Styles = Styles;
exports.animateTransform = animateTransform;
exports.canScroll = canScroll;
exports.canUseDOM = canUseDOM;
exports.cloneElement = cloneElement;
exports.computeTranslate = computeTranslate;
exports.detectScrollIntent = detectScrollIntent;
exports.generateUniqueId = generateUniqueId;
exports.getBoundingRectangle = getBoundingRectangle;
exports.getComputedStyles = getComputedStyles;
exports.getDocument = getDocument;
exports.getDocuments = getDocuments;
exports.getElementFromPoint = getElementFromPoint;
exports.getEventCoordinates = getEventCoordinates;
exports.getFinalKeyframe = getFinalKeyframe;
exports.getFirstScrollableAncestor = getFirstScrollableAncestor;
exports.getFixedPositionOffset = getFixedPositionOffset;
exports.getFrameElement = getFrameElement;
exports.getFrameTransform = getFrameTransform;
exports.getInteractiveElement = getInteractiveElement;
exports.getRoot = getRoot;
exports.getScrollPosition = getScrollPosition;
exports.getScrollableAncestors = getScrollableAncestors;
exports.getViewportBoundingRectangle = getViewportBoundingRectangle;
exports.getVisibleBoundingRectangle = getVisibleBoundingRectangle;
exports.getWindow = getWindow;
exports.hidePopover = hidePopover;
exports.inverseTransform = inverseTransform;
exports.isDocument = isDocument;
exports.isDocumentScrollingElement = isDocumentScrollingElement;
exports.isElement = isElement;
exports.isHTMLElement = isHTMLElement;
exports.isInteractiveElement = isInteractiveElement;
exports.isKeyboardEvent = isKeyboardEvent;
exports.isKeyframeEffect = isKeyframeEffect;
exports.isPointerEvent = isPointerEvent;
exports.isSafari = isSafari;
exports.isShadowRoot = isShadowRoot;
exports.isTextInput = isTextInput;
exports.parseTransform = parseTransform;
exports.parseTranslate = parseTranslate;
exports.prefersReducedMotion = prefersReducedMotion;
exports.scheduler = scheduler;
exports.scrollIntoViewIfNeeded = scrollIntoViewIfNeeded;
exports.showPopover = showPopover;
exports.supportsPopover = supportsPopover;
exports.supportsStyle = supportsStyle;
exports.supportsViewTransition = supportsViewTransition;
exports.timeout = timeout;
//# sourceMappingURL=utilities.cjs.map
//# sourceMappingURL=utilities.cjs.map