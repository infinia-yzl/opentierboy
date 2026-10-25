import { configurator, Plugin, Sensor, ActivationController, CorePlugin, DragDropManager as DragDropManager$1, resolveCustomizable, Draggable as Draggable$1, Droppable as Droppable$1, ActivationConstraint, descriptor } from '@dnd-kit/abstract';
export { resolveCustomizable } from '@dnd-kit/abstract';
import { ScrollDirection, getRoot, Listeners, isElement, scrollIntoViewIfNeeded, DOMRectangle, getDocument, isHTMLElement, getFrameTransform, getEventCoordinates, getDocuments, scheduler, getInteractiveElement, isTextInput, getScrollPosition, canScroll, detectScrollIntent, getElementFromPoint, getScrollableAncestors, isKeyboardEvent, isPointerEvent, generateUniqueId, isSafari, isDocument, isShadowRoot, Styles, getComputedStyles, parseTransform, parseTranslate, getFixedPositionOffset, supportsPopover, showPopover, getWindow, prefersReducedMotion, getFrameElement, cloneElement, supportsStyle, getFinalKeyframe, animateTransform, ProxiedElements, PositionObserver } from '@dnd-kit/dom/utilities';
import { untracked, effect, computed, deepEqual, signal, batch, effects, reactive, derived } from '@dnd-kit/state';
import { Axes, Point, Rectangle, exceedsDistance } from '@dnd-kit/geometry';
import { defaultCollisionDetection } from '@dnd-kit/collision';

var __create = Object.create;
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : Symbol.for("Symbol." + name);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __objRest = (source, exclude) => {
  var target = {};
  for (var prop in source)
    if (__hasOwnProp.call(source, prop) && exclude.indexOf(prop) < 0)
      target[prop] = source[prop];
  if (source != null && __getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(source)) {
      if (exclude.indexOf(prop) < 0 && __propIsEnum.call(source, prop))
        target[prop] = source[prop];
    }
  return target;
};
var __decoratorStart = (base) => {
  var _a5;
  return [, , , __create((_a5 = base == null ? void 0 : base[__knownSymbol("metadata")]) != null ? _a5 : null)];
};
var __decoratorStrings = ["class", "method", "getter", "setter", "accessor", "field", "value", "get", "set"];
var __expectFn = (fn) => fn !== void 0 && typeof fn !== "function" ? __typeError("Function expected") : fn;
var __decoratorContext = (kind, name, done, metadata, fns) => ({ kind: __decoratorStrings[kind], name, metadata, addInitializer: (fn) => done._ ? __typeError("Already initialized") : fns.push(__expectFn(fn || null)) });
var __decoratorMetadata = (array, target) => __defNormalProp(target, __knownSymbol("metadata"), array[3]);
var __runInitializers = (array, flags, self, value) => {
  for (var i = 0, fns = array[flags >> 1], n = fns && fns.length; i < n; i++) flags & 1 ? fns[i].call(self) : value = fns[i].call(self, value);
  return value;
};
var __decorateElement = (array, flags, name, decorators, target, extra) => {
  var fn, it, done, ctx, access, k = flags & 7, s = !!(flags & 8), p = !!(flags & 16);
  var j = k > 3 ? array.length + 1 : k ? s ? 1 : 2 : 0, key = __decoratorStrings[k + 5];
  var initializers = k > 3 && (array[j - 1] = []), extraInitializers = array[j] || (array[j] = []);
  var desc = k && (!p && !s && (target = target.prototype), k < 5 && (k > 3 || !p) && __getOwnPropDesc(k < 4 ? target : { get [name]() {
    return __privateGet(this, extra);
  }, set [name](x) {
    return __privateSet(this, extra, x);
  } }, name));
  k ? p && k < 4 && __name(extra, (k > 2 ? "set " : k > 1 ? "get " : "") + name) : __name(target, name);
  for (var i = decorators.length - 1; i >= 0; i--) {
    ctx = __decoratorContext(k, name, done = {}, array[3], extraInitializers);
    if (k) {
      ctx.static = s, ctx.private = p, access = ctx.access = { has: p ? (x) => __privateIn(target, x) : (x) => name in x };
      if (k ^ 3) access.get = p ? (x) => (k ^ 1 ? __privateGet : __privateMethod)(x, target, k ^ 4 ? extra : desc.get) : (x) => x[name];
      if (k > 2) access.set = p ? (x, y) => __privateSet(x, target, y, k ^ 4 ? extra : desc.set) : (x, y) => x[name] = y;
    }
    it = (0, decorators[i])(k ? k < 4 ? p ? extra : desc[key] : k > 4 ? void 0 : { get: desc.get, set: desc.set } : target, ctx), done._ = 1;
    if (k ^ 4 || it === void 0) __expectFn(it) && (k > 4 ? initializers.unshift(it) : k ? p ? extra = it : desc[key] = it : target = it);
    else if (typeof it !== "object" || it === null) __typeError("Object expected");
    else __expectFn(fn = it.get) && (desc.get = fn), __expectFn(fn = it.set) && (desc.set = fn), __expectFn(fn = it.init) && initializers.unshift(fn);
  }
  return k || __decoratorMetadata(array, target), desc && __defProp(target, name, desc), p ? k ^ 4 ? extra : desc : target;
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateIn = (member, obj) => Object(obj) !== obj ? __typeError('Cannot use the "in" operator on this value') : member.has(obj);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);

// src/core/plugins/accessibility/defaults.ts
var defaultAttributes = {
  role: "button",
  roleDescription: "draggable"};
var defaultDescriptionIdPrefix = `dnd-kit-description`;
var defaultAnnouncementIdPrefix = `dnd-kit-announcement`;
var defaultScreenReaderInstructions = {
  draggable: `To pick up a draggable item, press the space bar. While dragging, use the arrow keys to move the item in a given direction. Press space again to drop the item in its new position, or press escape to cancel.`
};
var defaultAnnouncements = {
  dragstart({ operation: { source } }) {
    if (!source) return;
    return `Picked up draggable item ${source.id}.`;
  },
  dragover({ operation: { source, target } }) {
    if (!source || source.id === (target == null ? void 0 : target.id)) return;
    if (target) {
      return `Draggable item ${source.id} was moved over droppable target ${target.id}.`;
    }
    return `Draggable item ${source.id} is no longer over a droppable target.`;
  },
  dragend({ operation: { source, target }, canceled }) {
    if (!source) return;
    if (canceled) {
      return `Dragging was cancelled. Draggable item ${source.id} was dropped.`;
    }
    if (target) {
      return `Draggable item ${source.id} was dropped over droppable target ${target.id}`;
    }
    return `Draggable item ${source.id} was dropped.`;
  }
};

// src/core/plugins/accessibility/utilities.ts
function isFocusable(element) {
  const tagName = element.tagName.toLowerCase();
  return ["input", "select", "textarea", "a", "button"].includes(tagName);
}
function supportsPressedState(element) {
  var _a5;
  return ((_a5 = element.getAttribute("role")) != null ? _a5 : "button") === "button";
}

// src/core/plugins/accessibility/HiddenText.ts
function createHiddenText(id, value) {
  const element = document.createElement("div");
  element.id = id;
  element.style.setProperty("display", "none");
  element.textContent = value;
  return element;
}

// src/core/plugins/accessibility/LiveRegion.ts
function createLiveRegion(id) {
  const element = document.createElement("div");
  element.id = id;
  element.setAttribute("role", "status");
  element.setAttribute("aria-live", "polite");
  element.setAttribute("aria-atomic", "true");
  element.style.setProperty("position", "fixed");
  element.style.setProperty("width", "1px");
  element.style.setProperty("height", "1px");
  element.style.setProperty("margin", "-1px");
  element.style.setProperty("border", "0");
  element.style.setProperty("padding", "0");
  element.style.setProperty("overflow", "hidden");
  element.style.setProperty("clip", "rect(0 0 0 0)");
  element.style.setProperty("clip-path", "inset(100%)");
  element.style.setProperty("white-space", "nowrap");
  return element;
}

// src/core/plugins/accessibility/Accessibility.ts
var debouncedEvents = ["dragover", "dragmove"];
var Accessibility = class extends Plugin {
  constructor(manager, options) {
    super(manager);
    const {
      id,
      idPrefix: {
        description: descriptionPrefix = defaultDescriptionIdPrefix,
        announcement: announcementPrefix = defaultAnnouncementIdPrefix
      } = {},
      announcements = defaultAnnouncements,
      screenReaderInstructions = defaultScreenReaderInstructions,
      debounce: debounceMs = 500
    } = options != null ? options : {};
    const descriptionId = id ? `${descriptionPrefix}-${id}` : generateUniqueId(descriptionPrefix);
    const announcementId = id ? `${announcementPrefix}-${id}` : generateUniqueId(announcementPrefix);
    let hiddenTextElement;
    let liveRegionElement;
    let liveRegionTextNode;
    let latestAnnouncement;
    const updateAnnouncement = (value = latestAnnouncement) => {
      if (!liveRegionTextNode || !value) return;
      if ((liveRegionTextNode == null ? void 0 : liveRegionTextNode.nodeValue) !== value) {
        liveRegionTextNode.nodeValue = value;
      }
    };
    const scheduleUpdateAnnouncement = () => scheduler.schedule(updateAnnouncement);
    const debouncedUpdateAnnouncement = debounce(
      scheduleUpdateAnnouncement,
      debounceMs
    );
    const eventListeners = Object.entries(announcements).map(
      ([eventName, getAnnouncement]) => {
        return this.manager.monitor.addEventListener(
          eventName,
          (event, manager2) => {
            const element = liveRegionTextNode;
            if (!element) return;
            const announcement = getAnnouncement == null ? void 0 : getAnnouncement(event, manager2);
            if (announcement && element.nodeValue !== announcement) {
              latestAnnouncement = announcement;
              if (debouncedEvents.includes(eventName)) {
                debouncedUpdateAnnouncement();
              } else {
                scheduleUpdateAnnouncement();
                debouncedUpdateAnnouncement.cancel();
              }
            }
          }
        );
      }
    );
    const initialize = () => {
      let elements = [];
      if (!(hiddenTextElement == null ? void 0 : hiddenTextElement.isConnected)) {
        hiddenTextElement = createHiddenText(
          descriptionId,
          screenReaderInstructions.draggable
        );
        elements.push(hiddenTextElement);
      }
      if (!(liveRegionElement == null ? void 0 : liveRegionElement.isConnected)) {
        liveRegionElement = createLiveRegion(announcementId);
        liveRegionTextNode = document.createTextNode("");
        liveRegionElement.appendChild(liveRegionTextNode);
        elements.push(liveRegionElement);
      }
      if (elements.length > 0) {
        document.body.append(...elements);
      }
    };
    const mutations = /* @__PURE__ */ new Set();
    function executeMutations() {
      for (const operation of mutations) {
        operation();
      }
    }
    this.registerEffect(() => {
      var _a5;
      mutations.clear();
      for (const draggable of this.manager.registry.draggables.value) {
        const activator = (_a5 = draggable.handle) != null ? _a5 : draggable.element;
        if (activator) {
          if (!hiddenTextElement || !liveRegionElement) {
            mutations.add(initialize);
          }
          if ((!isFocusable(activator) || isSafari()) && !activator.hasAttribute("tabindex")) {
            mutations.add(() => activator.setAttribute("tabindex", "0"));
          }
          if (!activator.hasAttribute("role") && !(activator.tagName.toLowerCase() === "button")) {
            mutations.add(
              () => activator.setAttribute("role", defaultAttributes.role)
            );
          }
          if (!activator.hasAttribute("aria-roledescription")) {
            mutations.add(
              () => activator.setAttribute(
                "aria-roledescription",
                defaultAttributes.roleDescription
              )
            );
          }
          if (!activator.hasAttribute("aria-describedby")) {
            mutations.add(
              () => activator.setAttribute("aria-describedby", descriptionId)
            );
          }
          const stateAttributes = supportsPressedState(activator) ? ["aria-pressed", "aria-grabbed"] : ["aria-grabbed"];
          for (const key of stateAttributes) {
            const value = String(draggable.isDragging);
            if (activator.getAttribute(key) !== value) {
              mutations.add(() => activator.setAttribute(key, value));
            }
          }
          const disabled = String(draggable.disabled);
          if (activator.getAttribute("aria-disabled") !== disabled) {
            mutations.add(
              () => activator.setAttribute("aria-disabled", disabled)
            );
          }
        }
      }
      if (mutations.size > 0) {
        scheduler.schedule(executeMutations);
      }
    });
    this.destroy = () => {
      super.destroy();
      hiddenTextElement == null ? void 0 : hiddenTextElement.remove();
      liveRegionElement == null ? void 0 : liveRegionElement.remove();
      eventListeners.forEach((unsubscribe) => unsubscribe());
    };
  }
};
function debounce(fn, wait) {
  let timeout;
  const debounced = () => {
    clearTimeout(timeout);
    timeout = setTimeout(fn, wait);
  };
  debounced.cancel = () => clearTimeout(timeout);
  return debounced;
}
var styleRegistry = /* @__PURE__ */ new Map();
function isAttached(root) {
  return isShadowRoot(root) ? root.host.isConnected : root.defaultView != null;
}
var _roots_dec, _targetRoot_dec, _sourceRoot_dec, _additionalRoots_dec, _registeredRules_dec, _a, _init, _registeredRules, _additionalRoots, _retainedRoots, _injections, _StyleInjector_instances, syncStyles_fn, inject_fn, injectStyleElement_fn, injectAdoptedSheet_fn;
var _StyleInjector = class _StyleInjector extends (_a = CorePlugin, _registeredRules_dec = [reactive], _additionalRoots_dec = [reactive], _sourceRoot_dec = [derived], _targetRoot_dec = [derived], _roots_dec = [derived], _a) {
  constructor(manager, options) {
    super(manager, options);
    __runInitializers(_init, 5, this);
    __privateAdd(this, _StyleInjector_instances);
    __privateAdd(this, _registeredRules, __runInitializers(_init, 8, this, /* @__PURE__ */ new Map())), __runInitializers(_init, 11, this);
    __privateAdd(this, _additionalRoots, __runInitializers(_init, 12, this, /* @__PURE__ */ new Set())), __runInitializers(_init, 15, this);
    /**
     * Roots that have taken part in a drag operation, where retained rules stay
     * injected between drag operations.
     */
    __privateAdd(this, _retainedRoots, /* @__PURE__ */ new Set());
    __privateAdd(this, _injections, /* @__PURE__ */ new Map());
    this.registerEffect(__privateMethod(this, _StyleInjector_instances, syncStyles_fn));
  }
  /**
   * Registers CSS rules to be injected into the active drag operation's
   * document and shadow roots. The StyleInjector handles tracking
   * which roots need the styles and cleaning up when they're no longer needed.
   *
   * Returns a cleanup function that unregisters the rules.
   */
  register(cssRules, options) {
    untracked(() => {
      var _a5;
      const rules = new Map(this.registeredRules);
      rules.set(cssRules, (_a5 = options == null ? void 0 : options.retain) != null ? _a5 : false);
      this.registeredRules = rules;
    });
    return () => {
      untracked(() => {
        const rules = new Map(this.registeredRules);
        rules.delete(cssRules);
        this.registeredRules = rules;
      });
    };
  }
  /**
   * Adds an additional root to track for style injection.
   * Returns a cleanup function that removes the root.
   */
  addRoot(root) {
    untracked(() => {
      const roots = new Set(this.additionalRoots);
      roots.add(root);
      this.additionalRoots = roots;
    });
    return () => {
      untracked(() => {
        const roots = new Set(this.additionalRoots);
        roots.delete(root);
        this.additionalRoots = roots;
      });
    };
  }
  get sourceRoot() {
    var _a5;
    const { source } = this.manager.dragOperation;
    return getRoot((_a5 = source == null ? void 0 : source.element) != null ? _a5 : null);
  }
  get targetRoot() {
    var _a5;
    const { target } = this.manager.dragOperation;
    return getRoot((_a5 = target == null ? void 0 : target.element) != null ? _a5 : null);
  }
  get roots() {
    const { status } = this.manager.dragOperation;
    if (status.initializing || status.initialized) {
      const roots = [this.sourceRoot, this.targetRoot].filter(
        (root) => root != null
      );
      return /* @__PURE__ */ new Set([...roots, ...this.additionalRoots]);
    }
    return /* @__PURE__ */ new Set();
  }
  destroy() {
    for (const injected of __privateGet(this, _injections).values()) {
      for (const cleanup of injected.values()) {
        cleanup();
      }
    }
    __privateGet(this, _injections).clear();
    __privateGet(this, _retainedRoots).clear();
    super.destroy();
  }
};
_init = __decoratorStart(_a);
_registeredRules = new WeakMap();
_additionalRoots = new WeakMap();
_retainedRoots = new WeakMap();
_injections = new WeakMap();
_StyleInjector_instances = new WeakSet();
/**
 * Injects and removes only the rules whose target roots changed, so that a
 * stylesheet that is still needed is never removed and added back.
 */
syncStyles_fn = function() {
  const { roots, registeredRules } = this;
  for (const root of roots) {
    __privateGet(this, _retainedRoots).add(root);
  }
  const wanted = /* @__PURE__ */ new Map();
  for (const root of __privateGet(this, _retainedRoots)) {
    const active = roots.has(root);
    if (!active && !isAttached(root)) {
      __privateGet(this, _retainedRoots).delete(root);
      continue;
    }
    for (const [cssRules, retain] of registeredRules) {
      if (!active && !retain) continue;
      let rules = wanted.get(root);
      if (!rules) {
        rules = /* @__PURE__ */ new Set();
        wanted.set(root, rules);
      }
      rules.add(cssRules);
    }
  }
  for (const [root, injected] of __privateGet(this, _injections)) {
    const rules = wanted.get(root);
    for (const [cssRules, cleanup] of injected) {
      if (rules == null ? void 0 : rules.has(cssRules)) continue;
      cleanup();
      injected.delete(cssRules);
    }
    if (injected.size === 0) {
      __privateGet(this, _injections).delete(root);
    }
  }
  for (const [root, rules] of wanted) {
    let injected = __privateGet(this, _injections).get(root);
    if (!injected) {
      injected = /* @__PURE__ */ new Map();
      __privateGet(this, _injections).set(root, injected);
    }
    for (const cssRules of rules) {
      if (!injected.has(cssRules)) {
        injected.set(cssRules, __privateMethod(this, _StyleInjector_instances, inject_fn).call(this, root, cssRules));
      }
    }
  }
};
inject_fn = function(root, cssRules) {
  let rootStyles = styleRegistry.get(root);
  if (!rootStyles) {
    rootStyles = /* @__PURE__ */ new Map();
    styleRegistry.set(root, rootStyles);
  }
  let registration = rootStyles.get(cssRules);
  if (!registration) {
    const created = isDocument(root) ? __privateMethod(this, _StyleInjector_instances, injectStyleElement_fn).call(this, root, rootStyles, cssRules) : __privateMethod(this, _StyleInjector_instances, injectAdoptedSheet_fn).call(this, root, rootStyles, cssRules);
    if (!created) {
      return () => {
      };
    }
    registration = created;
    rootStyles.set(cssRules, registration);
  }
  registration.refCount++;
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    registration.refCount--;
    if (registration.refCount === 0) {
      registration.cleanup();
    }
  };
};
/**
 * For Document roots, prepend a <style> element to <head> so that any
 * @layer declarations appear before layers from regular stylesheets,
 * giving them the lowest cascade priority.
 */
injectStyleElement_fn = function(root, rootStyles, cssRules) {
  var _a5;
  const style = root.createElement("style");
  const { nonce } = (_a5 = this.options) != null ? _a5 : {};
  if (nonce) {
    style.setAttribute("nonce", nonce);
  }
  style.textContent = cssRules;
  root.head.prepend(style);
  const observer = new MutationObserver((entries) => {
    for (const entry of entries) {
      for (const node of Array.from(entry.removedNodes)) {
        if (node === style) {
          root.head.prepend(style);
          return;
        }
      }
    }
  });
  observer.observe(root.head, { childList: true });
  return {
    refCount: 0,
    cleanup: () => {
      observer.disconnect();
      style.remove();
      rootStyles.delete(cssRules);
      if (rootStyles.size === 0) {
        styleRegistry.delete(root);
      }
    }
  };
};
/**
 * For ShadowRoot roots, use adoptedStyleSheets to avoid DOM side effects
 * like interfering with :first-child or :nth-child selectors.
 */
injectAdoptedSheet_fn = function(root, rootStyles, cssRules) {
  if (!("adoptedStyleSheets" in root && Array.isArray(root.adoptedStyleSheets)) && process.env.NODE_ENV !== "production") {
    console.error(
      "Cannot inject styles: This browser doesn't support adoptedStyleSheets"
    );
  }
  const targetWindow = root.ownerDocument.defaultView;
  const { CSSStyleSheet } = targetWindow != null ? targetWindow : {};
  if (!CSSStyleSheet) {
    if (process.env.NODE_ENV !== "production") {
      console.error(
        "Cannot inject styles: CSSStyleSheet constructor not available"
      );
    }
    return null;
  }
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(cssRules);
  root.adoptedStyleSheets.push(sheet);
  return {
    refCount: 0,
    cleanup: () => {
      var _a5;
      if (isShadowRoot(root) && ((_a5 = root.host) == null ? void 0 : _a5.isConnected)) {
        const index = root.adoptedStyleSheets.indexOf(sheet);
        if (index !== -1) {
          root.adoptedStyleSheets.splice(index, 1);
        }
      }
      rootStyles.delete(cssRules);
      if (rootStyles.size === 0) {
        styleRegistry.delete(root);
      }
    }
  };
};
__decorateElement(_init, 4, "registeredRules", _registeredRules_dec, _StyleInjector, _registeredRules);
__decorateElement(_init, 4, "additionalRoots", _additionalRoots_dec, _StyleInjector, _additionalRoots);
__decorateElement(_init, 2, "sourceRoot", _sourceRoot_dec, _StyleInjector);
__decorateElement(_init, 2, "targetRoot", _targetRoot_dec, _StyleInjector);
__decorateElement(_init, 2, "roots", _roots_dec, _StyleInjector);
__decoratorMetadata(_init, _StyleInjector);
_StyleInjector.configure = configurator(_StyleInjector);
var StyleInjector = _StyleInjector;

// src/core/plugins/cursor/Cursor.ts
var Cursor = class extends Plugin {
  constructor(manager, options) {
    super(manager, options);
    this.manager = manager;
    const { cursor = "grabbing" } = options != null ? options : {};
    const styleInjector = manager.registry.plugins.get(
      StyleInjector
    );
    const unregisterStyles = styleInjector == null ? void 0 : styleInjector.register(
      `* { cursor: ${cursor} !important; }`
    );
    if (unregisterStyles) {
      const originalDestroy = this.destroy.bind(this);
      this.destroy = () => {
        unregisterStyles();
        originalDestroy();
      };
    }
  }
};

// src/core/plugins/feedback/constants.ts
var ATTR_PREFIX = "data-dnd-";
var DROPPING_ATTRIBUTE = `${ATTR_PREFIX}dropping`;
var CSS_PREFIX = "--dnd-";
var ATTRIBUTE = `${ATTR_PREFIX}dragging`;
var PLACEHOLDER_ATTRIBUTE = `${ATTR_PREFIX}placeholder`;
var IGNORED_ATTRIBUTES = [
  ATTRIBUTE,
  PLACEHOLDER_ATTRIBUTE,
  "popover",
  "aria-pressed",
  "aria-grabbing"
];
var IGNORED_STYLES = ["view-transition-name"];
var CSS_RULES = `
  :is(:root,:host) [${ATTRIBUTE}] {
    position: fixed !important;
    pointer-events: none !important;
    touch-action: none;
    z-index: calc(infinity);
    will-change: translate;
    top: var(${CSS_PREFIX}top, 0px) !important;
    left: var(${CSS_PREFIX}left, 0px) !important;
    right: unset !important;
    bottom: unset !important;
    width: var(${CSS_PREFIX}width, auto);
    max-width: var(${CSS_PREFIX}width, auto);
    height: var(${CSS_PREFIX}height, auto);
    max-height: var(${CSS_PREFIX}height, auto);
    transform: var(${CSS_PREFIX}transform, none) !important;
    transition: var(${CSS_PREFIX}transition) !important;
  }

  :is(:root,:host) [${PLACEHOLDER_ATTRIBUTE}] {
    transition: none;
  }

  :is(:root,:host) [${PLACEHOLDER_ATTRIBUTE}='hidden'] {
    visibility: hidden;
  }

  [${ATTRIBUTE}] * {
    pointer-events: none !important;
  }

  [${ATTRIBUTE}]:not([${DROPPING_ATTRIBUTE}]) {
    translate: var(${CSS_PREFIX}translate) !important;
  }

  [${ATTRIBUTE}][style*='${CSS_PREFIX}scale'] {
    scale: var(${CSS_PREFIX}scale) !important;
    transform-origin: var(${CSS_PREFIX}transform-origin) !important;
  }

  @layer dnd-kit {
    :where([${ATTRIBUTE}][popover]) {
      overflow: visible;
      background: unset;
      border: unset;
      margin: unset;
      padding: unset;
      color: inherit;

      &:is(input, button) {
        border: revert;
        background: revert;
      }
    }
  }
  [${ATTRIBUTE}]::backdrop, [${ATTR_PREFIX}overlay]:not([${ATTRIBUTE}]) {
    display: none;
    visibility: hidden;
  }
`.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
function createPlaceholder(source, type = "hidden") {
  return untracked(() => {
    const { element, manager } = source;
    if (!element || !manager) return;
    const containedDroppables = findContainedDroppables(
      element,
      manager.registry.droppables
    );
    const cleanup = [];
    const placeholder = cloneElement(element);
    const { remove } = placeholder;
    proxyDroppableElements(containedDroppables, placeholder, cleanup);
    configurePlaceholder(placeholder, type);
    placeholder.remove = () => {
      cleanup.forEach((fn) => fn());
      remove.call(placeholder);
    };
    return placeholder;
  });
}
function findContainedDroppables(element, droppables) {
  const containedDroppables = /* @__PURE__ */ new Map();
  for (const droppable of droppables) {
    if (!droppable.element) continue;
    if (element === droppable.element || element.contains(droppable.element)) {
      const identifierAttribute = `${ATTR_PREFIX}${generateUniqueId("dom-id")}`;
      droppable.element.setAttribute(identifierAttribute, "");
      containedDroppables.set(droppable, identifierAttribute);
    }
  }
  return containedDroppables;
}
function proxyDroppableElements(containedDroppables, placeholder, cleanup) {
  for (const [droppable, identifierAttribute] of containedDroppables) {
    if (!droppable.element) continue;
    const selector = `[${identifierAttribute}]`;
    const clonedElement = placeholder.matches(selector) ? placeholder : placeholder.querySelector(selector);
    droppable.element.removeAttribute(identifierAttribute);
    if (!clonedElement) continue;
    const originalElement = droppable.element;
    droppable.proxy = clonedElement;
    clonedElement.removeAttribute(identifierAttribute);
    ProxiedElements.set(originalElement, clonedElement);
    cleanup.push(() => {
      ProxiedElements.delete(originalElement);
      droppable.proxy = void 0;
    });
  }
}
function configurePlaceholder(placeholder, type = "hidden") {
  placeholder.setAttribute("inert", "true");
  placeholder.setAttribute("tab-index", "-1");
  placeholder.setAttribute("aria-hidden", "true");
  placeholder.setAttribute(PLACEHOLDER_ATTRIBUTE, type);
}
function isSameFrame(element, target) {
  if (element === target) return true;
  return getFrameElement(element) === getFrameElement(target);
}
function preventPopoverClose(event) {
  const { target } = event;
  if ("newState" in event && event.newState === "closed" && isElement(target) && target.hasAttribute("popover")) {
    requestAnimationFrame(() => showPopover(target));
  }
}
function isTableRow(element) {
  return element.tagName === "TR";
}
function createElementMutationObserver(element, placeholder, clone) {
  const observer = new MutationObserver((mutations) => {
    let hasChildrenMutations = false;
    for (const mutation of mutations) {
      if (mutation.target !== element) {
        hasChildrenMutations = true;
        continue;
      }
      if (mutation.type !== "attributes") {
        continue;
      }
      const attributeName = mutation.attributeName;
      if (attributeName.startsWith("aria-") || IGNORED_ATTRIBUTES.includes(attributeName)) {
        continue;
      }
      const attributeValue = element.getAttribute(attributeName);
      if (attributeName === "style") {
        if (supportsStyle(element) && supportsStyle(placeholder)) {
          const styles = element.style;
          for (const key of Array.from(placeholder.style)) {
            if (styles.getPropertyValue(key) === "") {
              placeholder.style.removeProperty(key);
            }
          }
          for (const key of Array.from(styles)) {
            if (IGNORED_STYLES.includes(key) || key.startsWith(CSS_PREFIX)) {
              continue;
            }
            const value = styles.getPropertyValue(key);
            placeholder.style.setProperty(key, value);
          }
        }
      } else if (attributeValue !== null) {
        placeholder.setAttribute(attributeName, attributeValue);
      } else {
        placeholder.removeAttribute(attributeName);
      }
    }
    if (hasChildrenMutations && clone) {
      placeholder.replaceChildren(...element.cloneNode(true).childNodes);
    }
  });
  observer.observe(element, {
    attributes: true,
    subtree: true,
    childList: true
  });
  return observer;
}
function createDocumentMutationObserver(element, placeholder, feedbackElement) {
  const observer = new MutationObserver((entries) => {
    for (const entry of entries) {
      if (entry.addedNodes.length === 0) continue;
      for (const node of Array.from(entry.addedNodes)) {
        if (node.contains(element) && element.nextElementSibling !== placeholder) {
          element.insertAdjacentElement("afterend", placeholder);
          showPopover(feedbackElement);
          return;
        }
        if (node.contains(placeholder) && placeholder.previousElementSibling !== element) {
          placeholder.insertAdjacentElement("beforebegin", element);
          showPopover(feedbackElement);
          return;
        }
      }
    }
    if (element.isConnected && placeholder.isConnected && element.nextElementSibling !== placeholder) {
      element.insertAdjacentElement("afterend", placeholder);
      showPopover(feedbackElement);
    }
  });
  observer.observe(element.ownerDocument.body, {
    childList: true,
    subtree: true
  });
  return observer;
}
function createResizeObserver(ctx) {
  return new ResizeObserver(() => {
    var _a5, _b2, _c3;
    const placeholderShape = new DOMRectangle(ctx.placeholder, {
      frameTransform: ctx.frameTransform,
      ignoreTransforms: true
    });
    const origin = (_a5 = ctx.transformOrigin) != null ? _a5 : { x: 1, y: 1 };
    const dX = (ctx.width - placeholderShape.width) * origin.x + ctx.delta.x;
    const dY = (ctx.height - placeholderShape.height) * origin.y + ctx.delta.y;
    const fixedOffset = getFixedPositionOffset();
    ctx.styles.set(
      {
        width: placeholderShape.width - ctx.widthOffset,
        height: placeholderShape.height - ctx.heightOffset,
        top: ctx.top + dY + fixedOffset.y,
        left: ctx.left + dX + fixedOffset.x
      },
      CSS_PREFIX
    );
    (_b2 = ctx.getElementMutationObserver()) == null ? void 0 : _b2.takeRecords();
    if (isTableRow(ctx.element) && isTableRow(ctx.placeholder)) {
      const cells = Array.from(ctx.element.cells);
      const placeholderCells = Array.from(ctx.placeholder.cells);
      if (!ctx.getSavedCellWidths()) {
        ctx.setSavedCellWidths(cells.map((cell) => cell.style.width));
      }
      for (const [index, cell] of cells.entries()) {
        const placeholderCell = placeholderCells[index];
        cell.style.width = `${placeholderCell.getBoundingClientRect().width}px`;
      }
    }
    const translate = (_c3 = ctx.getTranslate()) != null ? _c3 : { x: 0, y: 0 };
    const shapeLeft = ctx.left + dX + fixedOffset.x + translate.x;
    const shapeTop = ctx.top + dY + fixedOffset.y + translate.y;
    const shapeWidth = placeholderShape.width - ctx.widthOffset;
    const shapeHeight = placeholderShape.height - ctx.heightOffset;
    const ft = ctx.frameTransform;
    ctx.dragOperation.shape = new Rectangle(
      shapeLeft * ft.scaleX + ft.x,
      shapeTop * ft.scaleY + ft.y,
      shapeWidth * ft.scaleX,
      shapeHeight * ft.scaleY
    );
  });
}
var DEFAULT_DURATION = 250;
var DEFAULT_EASING = "ease";
function runDropAnimation(ctx) {
  var _a5, _b2, _c3, _d2;
  const { animation } = ctx;
  if (typeof animation === "function") {
    const result = animation({
      source: ctx.source,
      element: ctx.element,
      feedbackElement: ctx.feedbackElement,
      placeholder: ctx.placeholder,
      translate: ctx.translate,
      moved: ctx.moved
    });
    Promise.resolve(result).then(() => {
      ctx.cleanup();
      requestAnimationFrame(ctx.restoreFocus);
    });
    return;
  }
  const {
    duration = DEFAULT_DURATION,
    easing = DEFAULT_EASING
  } = animation != null ? animation : {};
  showPopover(ctx.feedbackElement);
  const [, runningAnimation] = (_a5 = getFinalKeyframe(
    ctx.feedbackElement,
    (keyframe) => "translate" in keyframe
  )) != null ? _a5 : [];
  runningAnimation == null ? void 0 : runningAnimation.pause();
  const target = (_b2 = ctx.placeholder) != null ? _b2 : ctx.element;
  const options = {
    frameTransform: isSameFrame(ctx.feedbackElement, target) ? null : void 0
  };
  const current = new DOMRectangle(ctx.feedbackElement, options);
  const currentTranslate = (_c3 = parseTranslate(getComputedStyles(ctx.feedbackElement).translate)) != null ? _c3 : ctx.translate;
  const final = new DOMRectangle(target, options);
  const delta = Rectangle.delta(current, final, ctx.alignment);
  const finalTranslate = {
    x: currentTranslate.x - delta.x,
    y: currentTranslate.y - delta.y
  };
  const heightKeyframes = Math.round(current.intrinsicHeight) !== Math.round(final.intrinsicHeight) ? {
    minHeight: [
      `${current.intrinsicHeight}px`,
      `${final.intrinsicHeight}px`
    ],
    maxHeight: [
      `${current.intrinsicHeight}px`,
      `${final.intrinsicHeight}px`
    ]
  } : {};
  const widthKeyframes = Math.round(current.intrinsicWidth) !== Math.round(final.intrinsicWidth) ? {
    minWidth: [
      `${current.intrinsicWidth}px`,
      `${final.intrinsicWidth}px`
    ],
    maxWidth: [
      `${current.intrinsicWidth}px`,
      `${final.intrinsicWidth}px`
    ]
  } : {};
  ctx.styles.set({ transition: ctx.transition }, CSS_PREFIX);
  ctx.feedbackElement.setAttribute(DROPPING_ATTRIBUTE, "");
  (_d2 = ctx.getElementMutationObserver()) == null ? void 0 : _d2.takeRecords();
  animateTransform({
    element: ctx.feedbackElement,
    keyframes: __spreadProps(__spreadValues(__spreadValues({}, heightKeyframes), widthKeyframes), {
      translate: [
        `${currentTranslate.x}px ${currentTranslate.y}px 0`,
        `${finalTranslate.x}px ${finalTranslate.y}px 0`
      ]
    }),
    options: {
      duration: prefersReducedMotion(getWindow(ctx.feedbackElement)) ? 0 : ctx.moved || ctx.feedbackElement !== ctx.element ? duration : 0,
      easing
    }
  }).then(() => {
    ctx.feedbackElement.removeAttribute(DROPPING_ATTRIBUTE);
    runningAnimation == null ? void 0 : runningAnimation.finish();
    ctx.cleanup();
    requestAnimationFrame(ctx.restoreFocus);
  });
}

// src/core/plugins/feedback/Feedback.ts
var _overlay_dec, _a2, _init2, _overlay, _Feedback_instances, trackOverlayRoot_fn, render_fn;
var _Feedback = class _Feedback extends (_a2 = Plugin, _overlay_dec = [reactive], _a2) {
  constructor(manager, options) {
    super(manager, options);
    __privateAdd(this, _Feedback_instances);
    __privateAdd(this, _overlay, __runInitializers(_init2, 8, this)), __runInitializers(_init2, 11, this);
    this.state = {
      initial: {},
      current: {}
    };
    const styleInjector = manager.registry.plugins.get(StyleInjector);
    const unregisterStyles = styleInjector == null ? void 0 : styleInjector.register(CSS_RULES, { retain: true });
    if (unregisterStyles) {
      const originalDestroy = this.destroy.bind(this);
      this.destroy = () => {
        unregisterStyles();
        originalDestroy();
      };
    }
    this.registerEffect(__privateMethod(this, _Feedback_instances, trackOverlayRoot_fn).bind(this, styleInjector));
    this.registerEffect(__privateMethod(this, _Feedback_instances, render_fn));
  }
};
_init2 = __decoratorStart(_a2);
_overlay = new WeakMap();
_Feedback_instances = new WeakSet();
trackOverlayRoot_fn = function(styleInjector) {
  const { overlay } = this;
  if (!overlay || !styleInjector) return;
  const root = getRoot(overlay);
  if (!root) return;
  return styleInjector.addRoot(root);
};
render_fn = function() {
  var _a5, _b2, _c3, _d2, _e, _f, _g;
  const { state, manager, options } = this;
  const { dragOperation } = manager;
  const { position, source, status } = dragOperation;
  if (status.idle) {
    state.current = {};
    state.initial = {};
    return;
  }
  if (!source) return;
  const { element } = source;
  const entityOptions = source.pluginConfig(_Feedback);
  const feedbackOption = (_b2 = (_a5 = entityOptions == null ? void 0 : entityOptions.feedback) != null ? _a5 : options == null ? void 0 : options.feedback) != null ? _b2 : "default";
  const feedback = typeof feedbackOption === "function" ? feedbackOption(source, manager) : feedbackOption;
  if (!element || feedback === "none" || !status.initialized || status.initializing) {
    return;
  }
  const { initial } = state;
  const feedbackElement = (_c3 = this.overlay) != null ? _c3 : element;
  const frameTransform = getFrameTransform(feedbackElement);
  const elementFrameTransform = getFrameTransform(element);
  const crossFrame = !isSameFrame(element, feedbackElement);
  const shape = new DOMRectangle(element, {
    frameTransform: crossFrame ? elementFrameTransform : null,
    ignoreTransforms: !crossFrame
  });
  const scaleDelta = {
    x: elementFrameTransform.scaleX / frameTransform.scaleX,
    y: elementFrameTransform.scaleY / frameTransform.scaleY
  };
  let { width, height, top, left } = shape;
  if (crossFrame) {
    width = width / scaleDelta.x;
    height = height / scaleDelta.y;
  }
  const styles = new Styles(feedbackElement);
  const elementStyles = getComputedStyles(element);
  const {
    transition,
    translate,
    boxSizing,
    paddingBlockStart,
    paddingBlockEnd,
    paddingInlineStart,
    paddingInlineEnd,
    borderInlineStartWidth,
    borderInlineEndWidth,
    borderBlockStartWidth,
    borderBlockEndWidth
  } = elementStyles;
  const feedbackTransition = transition.split(",").filter((t) => !/^\s*(transform|translate|scale)\b/.test(t)).join(",");
  const parsedTransform = parseTransform(elementStyles);
  const initialTransformStyle = elementStyles.transform;
  const clone = feedback === "clone";
  const contentBox = boxSizing === "content-box";
  const widthOffset = contentBox ? parseInt(paddingInlineStart) + parseInt(paddingInlineEnd) + parseInt(borderInlineStartWidth) + parseInt(borderInlineEndWidth) : 0;
  const heightOffset = contentBox ? parseInt(paddingBlockStart) + parseInt(paddingBlockEnd) + parseInt(borderBlockStartWidth) + parseInt(borderBlockEndWidth) : 0;
  const placeholder = feedback !== "move" && !this.overlay ? createPlaceholder(source, clone ? "clone" : "hidden") : null;
  const isKeyboardOperation = untracked(
    () => isKeyboardEvent(manager.dragOperation.activatorEvent)
  );
  if (!initial.translate) {
    if (this.overlay && parsedTransform) {
      initial.translate = { x: parsedTransform.x, y: parsedTransform.y };
    } else if (translate !== "none") {
      const parsedTranslate = parseTranslate(translate);
      if (parsedTranslate) {
        initial.translate = parsedTranslate;
      }
    }
  }
  if (!initial.transformOrigin) {
    const current = untracked(() => position.current);
    const visualLeft = left + ((_d2 = parsedTransform == null ? void 0 : parsedTransform.x) != null ? _d2 : 0);
    const visualTop = top + ((_e = parsedTransform == null ? void 0 : parsedTransform.y) != null ? _e : 0);
    initial.transformOrigin = {
      x: (current.x - visualLeft * frameTransform.scaleX - frameTransform.x) / (width * frameTransform.scaleX),
      y: (current.y - visualTop * frameTransform.scaleY - frameTransform.y) / (height * frameTransform.scaleY)
    };
  }
  const { transformOrigin } = initial;
  const relativeTop = top * frameTransform.scaleY + frameTransform.y;
  const relativeLeft = left * frameTransform.scaleX + frameTransform.x;
  if (!initial.coordinates) {
    initial.coordinates = {
      x: relativeLeft,
      y: relativeTop
    };
    if (scaleDelta.x !== 1 || scaleDelta.y !== 1) {
      const { scaleX, scaleY } = elementFrameTransform;
      const { x: tX2, y: tY2 } = transformOrigin;
      initial.coordinates.x += (width * scaleX - width) * tX2;
      initial.coordinates.y += (height * scaleY - height) * tY2;
    }
  }
  if (!initial.dimensions) {
    initial.dimensions = { width, height };
  }
  if (!initial.frameTransform) {
    initial.frameTransform = frameTransform;
  }
  const coordinatesDelta = {
    x: initial.coordinates.x - relativeLeft,
    y: initial.coordinates.y - relativeTop
  };
  const sizeDelta = {
    width: (initial.dimensions.width * initial.frameTransform.scaleX - width * frameTransform.scaleX) * transformOrigin.x,
    height: (initial.dimensions.height * initial.frameTransform.scaleY - height * frameTransform.scaleY) * transformOrigin.y
  };
  const delta = {
    x: coordinatesDelta.x / frameTransform.scaleX + sizeDelta.width,
    y: coordinatesDelta.y / frameTransform.scaleY + sizeDelta.height
  };
  const projected = {
    left: left + delta.x,
    top: top + delta.y
  };
  feedbackElement.setAttribute(ATTRIBUTE, "true");
  const transform = untracked(() => dragOperation.transform);
  const initialTranslate = (_f = initial.translate) != null ? _f : { x: 0, y: 0 };
  const tX = transform.x * frameTransform.scaleX + initialTranslate.x;
  const tY = transform.y * frameTransform.scaleY + initialTranslate.y;
  const fixedOffset = getFixedPositionOffset();
  styles.set(
    {
      width: width - widthOffset,
      height: height - heightOffset,
      top: projected.top + fixedOffset.y,
      left: projected.left + fixedOffset.x,
      translate: `${tX}px ${tY}px 0`,
      transform: this.overlay ? "none" : initialTransformStyle,
      transition: feedbackTransition ? `${feedbackTransition}, translate 0ms linear` : "translate 0ms linear",
      scale: crossFrame ? `${scaleDelta.x} ${scaleDelta.y}` : "",
      "transform-origin": `${transformOrigin.x * 100}% ${transformOrigin.y * 100}%`
    },
    CSS_PREFIX
  );
  if (placeholder) {
    element.insertAdjacentElement("afterend", placeholder);
    if (options == null ? void 0 : options.rootElement) {
      const root = typeof options.rootElement === "function" ? options.rootElement(source) : options.rootElement;
      root.appendChild(element);
    }
  }
  if (supportsPopover(feedbackElement)) {
    if (!feedbackElement.hasAttribute("popover")) {
      feedbackElement.setAttribute("popover", "manual");
    }
    showPopover(feedbackElement);
    feedbackElement.addEventListener("beforetoggle", preventPopoverClose);
  }
  let elementMutationObserver;
  let documentMutationObserver;
  let savedCellWidths;
  const resizeObserver = createResizeObserver({
    placeholder,
    element,
    feedbackElement,
    frameTransform,
    transformOrigin,
    width,
    height,
    top,
    left,
    widthOffset,
    heightOffset,
    delta,
    styles,
    dragOperation,
    getTranslate: () => state.current.translate,
    getElementMutationObserver: () => elementMutationObserver,
    getSavedCellWidths: () => savedCellWidths,
    setSavedCellWidths: (widths) => {
      savedCellWidths = widths;
    }
  });
  const initialShape = new DOMRectangle(feedbackElement);
  untracked(() => dragOperation.shape = initialShape);
  const feedbackWindow = getWindow(feedbackElement);
  const handleWindowResize = (event) => {
    this.manager.actions.stop({ event });
  };
  const reducedMotion = prefersReducedMotion(feedbackWindow);
  if (isKeyboardOperation) {
    feedbackWindow.addEventListener("resize", handleWindowResize);
  }
  if (untracked(() => source.status) === "idle") {
    requestAnimationFrame(() => source.status = "dragging");
  }
  if (placeholder) {
    resizeObserver.observe(placeholder);
    elementMutationObserver = createElementMutationObserver(
      element,
      placeholder,
      clone
    );
    documentMutationObserver = createDocumentMutationObserver(
      element,
      placeholder,
      feedbackElement
    );
  }
  const id = (_g = manager.dragOperation.source) == null ? void 0 : _g.id;
  const restoreFocus = () => {
    var _a6;
    if (!isKeyboardOperation || id == null) return;
    const draggable = manager.registry.draggables.get(id);
    const focusTarget = (_a6 = draggable == null ? void 0 : draggable.handle) != null ? _a6 : draggable == null ? void 0 : draggable.element;
    if (isHTMLElement(focusTarget)) {
      focusTarget.focus();
    }
  };
  const cleanup = () => {
    elementMutationObserver == null ? void 0 : elementMutationObserver.disconnect();
    documentMutationObserver == null ? void 0 : documentMutationObserver.disconnect();
    resizeObserver.disconnect();
    feedbackWindow.removeEventListener("resize", handleWindowResize);
    if (supportsPopover(feedbackElement)) {
      feedbackElement.removeEventListener(
        "beforetoggle",
        preventPopoverClose
      );
      feedbackElement.removeAttribute("popover");
    }
    feedbackElement.removeAttribute(ATTRIBUTE);
    styles.reset();
    const finalize = () => {
      var _a6;
      if (savedCellWidths && isTableRow(element)) {
        const cells = Array.from(element.cells);
        for (const [index, cell] of cells.entries()) {
          cell.style.width = (_a6 = savedCellWidths[index]) != null ? _a6 : "";
        }
      }
      source.status = "idle";
      const moved = state.current.translate != null;
      const isDragging = dragOperation.status.dragging;
      if (placeholder && (!isDragging && moved || placeholder.parentElement !== feedbackElement.parentElement) && feedbackElement.isConnected) {
        placeholder.replaceWith(feedbackElement);
      }
      placeholder == null ? void 0 : placeholder.remove();
    };
    if (feedbackElement === this.overlay) {
      setTimeout(finalize, 0);
    } else {
      finalize();
    }
  };
  const optionsDropAnimation = options == null ? void 0 : options.dropAnimation;
  const feedbackPlugin = this;
  const cleanupEffects = effects(
    // Update transform on move
    () => {
      var _a6, _b3, _c4;
      const { transform: transform2, status: status2 } = dragOperation;
      if (!transform2.x && !transform2.y && !state.current.translate) {
        return;
      }
      if (status2.dragging) {
        const initialTranslate2 = (_a6 = initial.translate) != null ? _a6 : { x: 0, y: 0 };
        const translate2 = {
          x: transform2.x / frameTransform.scaleX + initialTranslate2.x,
          y: transform2.y / frameTransform.scaleY + initialTranslate2.y
        };
        const previousTranslate = state.current.translate;
        const modifiers = untracked(() => dragOperation.modifiers);
        const currentShape = untracked(() => {
          var _a7;
          return (_a7 = dragOperation.shape) == null ? void 0 : _a7.current;
        });
        const keyboardTransition = options == null ? void 0 : options.keyboardTransition;
        const translateTransition = isKeyboardOperation && !reducedMotion && keyboardTransition !== null ? `${(_b3 = keyboardTransition == null ? void 0 : keyboardTransition.duration) != null ? _b3 : 250}ms ${(_c4 = keyboardTransition == null ? void 0 : keyboardTransition.easing) != null ? _c4 : "cubic-bezier(0.25, 1, 0.5, 1)"}` : "0ms linear";
        styles.set(
          {
            transition: feedbackTransition ? `${feedbackTransition}, translate ${translateTransition}` : `translate ${translateTransition}`,
            translate: `${translate2.x}px ${translate2.y}px 0`
          },
          CSS_PREFIX
        );
        elementMutationObserver == null ? void 0 : elementMutationObserver.takeRecords();
        if (currentShape && currentShape !== initialShape && previousTranslate && !modifiers.length) {
          const delta2 = Point.delta(translate2, previousTranslate);
          dragOperation.shape = Rectangle.from(
            currentShape.boundingRectangle
          ).translate(
            delta2.x * frameTransform.scaleX,
            delta2.y * frameTransform.scaleY
          );
        } else {
          dragOperation.shape = new DOMRectangle(feedbackElement);
        }
        state.current.translate = translate2;
      }
    },
    // Drop animation
    function() {
      if (dragOperation.status.dropped) {
        this.dispose();
        source.status = "dropping";
        const dropAnimationConfig = (entityOptions == null ? void 0 : entityOptions.dropAnimation) !== void 0 ? entityOptions.dropAnimation : feedbackPlugin.dropAnimation !== void 0 ? feedbackPlugin.dropAnimation : optionsDropAnimation;
        let translate2 = state.current.translate;
        const moved = translate2 != null;
        if (!translate2 && element !== feedbackElement) {
          translate2 = { x: 0, y: 0 };
        }
        if (!translate2 || dropAnimationConfig === null) {
          cleanup();
          return;
        }
        manager.renderer.rendering.then(() => {
          runDropAnimation({
            source,
            element,
            feedbackElement,
            placeholder,
            translate: translate2,
            moved,
            transition,
            alignment: source.alignment,
            styles,
            animation: dropAnimationConfig != null ? dropAnimationConfig : void 0,
            getElementMutationObserver: () => elementMutationObserver,
            cleanup,
            restoreFocus
          });
        });
      }
    }
  );
  return () => {
    cleanup();
    cleanupEffects();
  };
};
__decorateElement(_init2, 4, "overlay", _overlay_dec, _Feedback, _overlay);
__decoratorMetadata(_init2, _Feedback);
_Feedback.configure = configurator(_Feedback);
var Feedback = _Feedback;
var LOCKED = true;
var UNLOCKED = false;
var _dec, _a3, _dec2, _b, _init3, __b, __a;
_b = (_dec2 = [reactive], ScrollDirection.Forward), _a3 = (_dec = [reactive], ScrollDirection.Reverse);
var ScrollLock = class {
  constructor() {
    __privateAdd(this, __b, __runInitializers(_init3, 8, this, LOCKED)), __runInitializers(_init3, 11, this);
    __privateAdd(this, __a, __runInitializers(_init3, 12, this, LOCKED)), __runInitializers(_init3, 15, this);
  }
  isLocked(direction) {
    if (direction === ScrollDirection.Idle) {
      return false;
    }
    if (direction == null) {
      return this[ScrollDirection.Forward] === LOCKED && this[ScrollDirection.Reverse] === LOCKED;
    }
    return this[direction] === LOCKED;
  }
  unlock(direction) {
    if (direction === ScrollDirection.Idle) {
      return;
    }
    this[direction] = UNLOCKED;
  }
};
_init3 = __decoratorStart(null);
__b = new WeakMap();
__a = new WeakMap();
__decorateElement(_init3, 4, _b, _dec2, ScrollLock, __b);
__decorateElement(_init3, 4, _a3, _dec, ScrollLock, __a);
__decoratorMetadata(_init3, ScrollLock);

// src/core/plugins/scrolling/ScrollIntent.ts
var DIRECTIONS = [ScrollDirection.Forward, ScrollDirection.Reverse];
var ScrollIntent = class {
  constructor() {
    this.x = new ScrollLock();
    this.y = new ScrollLock();
  }
  isLocked() {
    return this.x.isLocked() && this.y.isLocked();
  }
};
var ScrollIntentTracker = class extends Plugin {
  constructor(manager) {
    super(manager);
    const scrollIntent = signal(new ScrollIntent());
    let previousDelta = null;
    this.signal = scrollIntent;
    effect(() => {
      const { status } = manager.dragOperation;
      if (!status.initialized) {
        previousDelta = null;
        scrollIntent.value = new ScrollIntent();
        return;
      }
      const { delta } = manager.dragOperation.position;
      if (previousDelta) {
        const directions = {
          x: getDirection(delta.x, previousDelta.x),
          y: getDirection(delta.y, previousDelta.y)
        };
        const intent = scrollIntent.peek();
        batch(() => {
          for (const axis of Axes) {
            for (const direction of DIRECTIONS) {
              if (directions[axis] === direction) {
                intent[axis].unlock(direction);
              }
            }
          }
          scrollIntent.value = intent;
        });
      }
      previousDelta = delta;
    });
  }
  get current() {
    return this.signal.peek();
  }
};
function getDirection(a, b) {
  return Math.sign(a - b);
}

// src/core/plugins/scrolling/Scroller.ts
var _autoScrolling_dec, _a4, _init4, _autoScrolling, _meta, _scroll;
var Scroller = class extends (_a4 = CorePlugin, _autoScrolling_dec = [reactive], _a4) {
  constructor(manager) {
    super(manager);
    __privateAdd(this, _autoScrolling, __runInitializers(_init4, 8, this, false)), __runInitializers(_init4, 11, this);
    __privateAdd(this, _meta);
    __privateAdd(this, _scroll, () => {
      if (!__privateGet(this, _meta)) {
        return;
      }
      const { element, by } = __privateGet(this, _meta);
      if (by.y) element.scrollTop += by.y;
      if (by.x) element.scrollLeft += by.x;
    });
    this.scroll = (options, scrollOptions) => {
      var _a5;
      if (this.disabled) {
        return false;
      }
      const elements = this.getScrollableElements();
      if (!elements) {
        __privateSet(this, _meta, void 0);
        return false;
      }
      const { position } = this.manager.dragOperation;
      const currentPosition = position == null ? void 0 : position.current;
      if (currentPosition) {
        const { by } = options != null ? options : {};
        const intent = by ? {
          x: getScrollIntent(by.x),
          y: getScrollIntent(by.y)
        } : void 0;
        const scrollIntent = intent ? void 0 : this.scrollIntentTracker.current;
        if (scrollIntent == null ? void 0 : scrollIntent.isLocked()) {
          return false;
        }
        for (const scrollableElement of elements) {
          const scrollPosition = getScrollPosition(scrollableElement);
          const elementCanScroll = canScroll(
            scrollableElement,
            by,
            scrollPosition
          );
          if (elementCanScroll.x || elementCanScroll.y) {
            const { speed, direction } = detectScrollIntent(
              scrollableElement,
              currentPosition,
              intent,
              scrollOptions == null ? void 0 : scrollOptions.acceleration,
              scrollOptions == null ? void 0 : scrollOptions.threshold,
              void 0,
              scrollPosition
            );
            if (scrollIntent) {
              for (const axis of Axes) {
                if (scrollIntent[axis].isLocked(direction[axis])) {
                  speed[axis] = 0;
                  direction[axis] = 0;
                }
              }
            }
            if (direction.x || direction.y) {
              const { x, y } = by != null ? by : direction;
              const scrollLeftBy = x * speed.x;
              const scrollTopBy = y * speed.y;
              if (scrollLeftBy || scrollTopBy) {
                const previousScrollBy = (_a5 = __privateGet(this, _meta)) == null ? void 0 : _a5.by;
                if (this.autoScrolling && previousScrollBy) {
                  const scrollIntentMismatch = previousScrollBy.x && !scrollLeftBy || previousScrollBy.y && !scrollTopBy;
                  if (scrollIntentMismatch) continue;
                }
                __privateSet(this, _meta, {
                  element: scrollableElement,
                  by: {
                    x: scrollLeftBy,
                    y: scrollTopBy
                  }
                });
                scheduler.schedule(__privateGet(this, _scroll));
                return true;
              }
            }
          }
        }
      }
      __privateSet(this, _meta, void 0);
      return false;
    };
    let previousElementFromPoint = null;
    let previousScrollableElements = null;
    const elementFromPoint = computed(() => {
      const { position, source } = manager.dragOperation;
      if (!position) {
        return null;
      }
      const element = getElementFromPoint(
        getRoot(source == null ? void 0 : source.element),
        position.current
      );
      if (element) {
        previousElementFromPoint = element;
      }
      return element != null ? element : previousElementFromPoint;
    });
    const scrollableElements = computed(() => {
      const element = elementFromPoint.value;
      const { documentElement } = getDocument(element);
      if (!element || element === documentElement) {
        const { target } = manager.dragOperation;
        const targetElement = target == null ? void 0 : target.element;
        if (targetElement) {
          const elements = getScrollableAncestors(targetElement, {
            excludeElement: false
          });
          previousScrollableElements = elements;
          return elements;
        }
      }
      if (element) {
        const elements = getScrollableAncestors(element, {
          excludeElement: false
        });
        if (this.autoScrolling && previousScrollableElements && elements.size < (previousScrollableElements == null ? void 0 : previousScrollableElements.size)) {
          return previousScrollableElements;
        }
        previousScrollableElements = elements;
        return elements;
      }
      previousScrollableElements = null;
      return null;
    }, deepEqual);
    this.getScrollableElements = () => {
      return scrollableElements.value;
    };
    this.scrollIntentTracker = new ScrollIntentTracker(manager);
    this.destroy = manager.monitor.addEventListener("dragmove", (event) => {
      if (this.disabled || event.defaultPrevented || !isKeyboardEvent(manager.dragOperation.activatorEvent) || !event.by) {
        return;
      }
      if (this.scroll({ by: event.by })) {
        event.preventDefault();
      }
    });
  }
};
_init4 = __decoratorStart(_a4);
_autoScrolling = new WeakMap();
_meta = new WeakMap();
_scroll = new WeakMap();
__decorateElement(_init4, 4, "autoScrolling", _autoScrolling_dec, Scroller, _autoScrolling);
__decoratorMetadata(_init4, Scroller);
function getScrollIntent(value) {
  if (value > 0) {
    return ScrollDirection.Forward;
  }
  if (value < 0) {
    return ScrollDirection.Reverse;
  }
  return ScrollDirection.Idle;
}

// src/utilities/scheduling/scheduler.ts
var Scheduler = class {
  constructor(scheduler5) {
    this.scheduler = scheduler5;
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
var scheduler3 = new Scheduler((callback) => {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(callback);
  } else {
    callback();
  }
});

// src/core/plugins/scrolling/AutoScroller.ts
var AUTOSCROLL_INTERVAL = 10;
var _AutoScroller = class _AutoScroller extends Plugin {
  constructor(manager, options) {
    super(manager, options);
    const scroller = manager.registry.plugins.get(Scroller);
    if (!scroller) {
      throw new Error("AutoScroller plugin depends on Scroller plugin");
    }
    this.destroy = effect(() => {
      var _a5, _b2, _c3;
      if (this.disabled) {
        return;
      }
      const { position: _, status } = manager.dragOperation;
      if (status.dragging) {
        const scrollOptions = {
          acceleration: (_a5 = this.options) == null ? void 0 : _a5.acceleration,
          threshold: typeof ((_b2 = this.options) == null ? void 0 : _b2.threshold) === "number" ? { x: this.options.threshold, y: this.options.threshold } : (_c3 = this.options) == null ? void 0 : _c3.threshold
        };
        const canScroll2 = scroller.scroll(void 0, scrollOptions);
        if (canScroll2) {
          scroller.autoScrolling = true;
          const interval = setInterval(
            () => scheduler3.schedule(
              () => scroller.scroll(void 0, scrollOptions)
            ),
            AUTOSCROLL_INTERVAL
          );
          return () => {
            clearInterval(interval);
          };
        } else {
          scroller.autoScrolling = false;
        }
      }
    });
  }
};
_AutoScroller.configure = configurator(_AutoScroller);
var AutoScroller = _AutoScroller;
var listenerOptions = {
  capture: true,
  passive: true
};
var _timeout;
var ScrollListener = class extends CorePlugin {
  constructor(manager) {
    super(manager);
    __privateAdd(this, _timeout);
    this.handleScroll = () => {
      if (__privateGet(this, _timeout) == null) {
        __privateSet(this, _timeout, setTimeout(() => {
          this.manager.collisionObserver.forceUpdate(false);
          __privateSet(this, _timeout, void 0);
        }, 50));
      }
    };
    const { dragOperation } = this.manager;
    this.destroy = effect(() => {
      var _a5, _b2, _c3;
      const enabled = dragOperation.status.dragging;
      if (enabled) {
        const root = (_c3 = (_b2 = (_a5 = dragOperation.source) == null ? void 0 : _a5.element) == null ? void 0 : _b2.ownerDocument) != null ? _c3 : document;
        root.addEventListener("scroll", this.handleScroll, listenerOptions);
        return () => {
          root.removeEventListener(
            "scroll",
            this.handleScroll,
            listenerOptions
          );
        };
      }
    });
  }
};
_timeout = new WeakMap();
var CSS_RULES2 = "* { user-select: none !important; -webkit-user-select: none !important; }";
var PreventSelection = class extends Plugin {
  constructor(manager) {
    super(manager);
    this.manager = manager;
    const styleInjector = manager.registry.plugins.get(
      StyleInjector
    );
    const unregisterStyles = styleInjector == null ? void 0 : styleInjector.register(CSS_RULES2);
    this.destroy = effect(() => {
      const { dragOperation } = this.manager;
      if (dragOperation.status.initialized) {
        removeSelection();
        document.addEventListener("selectionchange", removeSelection, {
          capture: true
        });
        return () => {
          document.removeEventListener("selectionchange", removeSelection, {
            capture: true
          });
        };
      }
    });
    if (unregisterStyles) {
      const originalDestroy = this.destroy.bind(this);
      this.destroy = () => {
        unregisterStyles();
        originalDestroy();
      };
    }
  }
};
function removeSelection() {
  var _a5;
  (_a5 = document.getSelection()) == null ? void 0 : _a5.removeAllRanges();
}

// src/core/sensors/keyboard/KeyboardSensor.helpers.ts
function isKeyboardKey(event, codes) {
  const eventKey = normalizeKey(event.key);
  return codes.some((code) => normalizeKey(code) === eventKey);
}
var namedKeys = /* @__PURE__ */ new Set([
  "alt",
  "altgraph",
  "backspace",
  "capslock",
  "control",
  "delete",
  "end",
  "enter",
  "escape",
  "home",
  "insert",
  "meta",
  "pagedown",
  "pageup",
  "pause",
  "printscreen",
  "shift",
  "space",
  "tab",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "arrowup",
  "f1",
  "f2",
  "f3",
  "f4",
  "f5",
  "f6",
  "f7",
  "f8",
  "f9",
  "f10",
  "f11",
  "f12"
]);
function normalizeKey(key) {
  if (key === " " || key === "Spacebar") {
    return "space";
  }
  if (/^Key[A-Z]$/.test(key)) {
    return key.slice(3).toLowerCase();
  }
  if (/^Digit[0-9]$/.test(key)) {
    return key.slice(5);
  }
  if (key.length === 1) {
    return key.toLowerCase();
  }
  const lowerCaseKey = key.toLowerCase();
  return namedKeys.has(lowerCaseKey) ? lowerCaseKey : key;
}

// src/core/sensors/keyboard/KeyboardSensor.ts
var defaults = Object.freeze({
  offset: 10,
  keyboardCodes: {
    start: ["Space", "Enter"],
    cancel: ["Escape"],
    end: ["Space", "Enter", "Tab"],
    up: ["ArrowUp"],
    down: ["ArrowDown"],
    left: ["ArrowLeft"],
    right: ["ArrowRight"]
  },
  preventActivation(event, source) {
    var _a5;
    const target = (_a5 = source.handle) != null ? _a5 : source.element;
    return event.target !== target;
  }
});
var _cleanupFunctions;
var _KeyboardSensor = class _KeyboardSensor extends Sensor {
  constructor(manager, options) {
    super(manager);
    this.manager = manager;
    this.options = options;
    __privateAdd(this, _cleanupFunctions, []);
    this.listeners = new Listeners();
    this.handleSourceKeyDown = (event, source, options) => {
      if (this.disabled || event.defaultPrevented) {
        return;
      }
      if (!isElement(event.target)) {
        return;
      }
      if (source.disabled) {
        return;
      }
      const {
        keyboardCodes = defaults.keyboardCodes,
        preventActivation = defaults.preventActivation
      } = options != null ? options : {};
      if (!isKeyboardKey(event, keyboardCodes.start)) {
        return;
      }
      if (!this.manager.dragOperation.status.idle) {
        return;
      }
      if (preventActivation == null ? void 0 : preventActivation(event, source)) return;
      this.handleStart(event, source, options);
    };
  }
  bind(source, options = this.options) {
    const unbind = effect(() => {
      var _a5;
      const target = (_a5 = source.handle) != null ? _a5 : source.element;
      const listener = (event) => {
        if (isKeyboardEvent(event)) {
          this.handleSourceKeyDown(event, source, options);
        }
      };
      if (target) {
        target.addEventListener("keydown", listener);
        return () => {
          target.removeEventListener("keydown", listener);
        };
      }
    });
    return unbind;
  }
  handleStart(event, source, options) {
    const { element } = source;
    if (!element) {
      throw new Error("Source draggable does not have an associated element");
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    scrollIntoViewIfNeeded(element);
    const { center } = new DOMRectangle(element);
    const controller = this.manager.actions.start({
      event,
      coordinates: {
        x: center.x,
        y: center.y
      },
      source
    });
    if (controller.signal.aborted) return this.cleanup();
    this.sideEffects();
    const sourceDocument = getDocument(element);
    const listeners = [
      this.listeners.bind(sourceDocument, [
        {
          type: "keydown",
          listener: (event2) => this.handleKeyDown(event2, source, options),
          options: { capture: true }
        }
      ])
    ];
    __privateGet(this, _cleanupFunctions).push(...listeners);
  }
  handleKeyDown(event, _source, options) {
    const { keyboardCodes = defaults.keyboardCodes } = options != null ? options : {};
    if (isKeyboardKey(event, [...keyboardCodes.end, ...keyboardCodes.cancel])) {
      event.preventDefault();
      const canceled = isKeyboardKey(event, keyboardCodes.cancel);
      this.handleEnd(event, canceled);
      return;
    }
    if (isKeyboardKey(event, keyboardCodes.up)) {
      this.handleMove("up", event);
    } else if (isKeyboardKey(event, keyboardCodes.down)) {
      this.handleMove("down", event);
    }
    if (isKeyboardKey(event, keyboardCodes.left)) {
      this.handleMove("left", event);
    } else if (isKeyboardKey(event, keyboardCodes.right)) {
      this.handleMove("right", event);
    }
  }
  handleEnd(event, canceled) {
    this.manager.actions.stop({
      event,
      canceled
    });
    this.cleanup();
  }
  handleMove(direction, event) {
    var _a5, _b2;
    const { shape } = this.manager.dragOperation;
    const factor = event.shiftKey ? 5 : 1;
    let by = {
      x: 0,
      y: 0
    };
    let offset = (_b2 = (_a5 = this.options) == null ? void 0 : _a5.offset) != null ? _b2 : defaults.offset;
    if (typeof offset === "number") {
      offset = { x: offset, y: offset };
    }
    if (!shape) {
      return;
    }
    switch (direction) {
      case "up":
        by = { x: 0, y: -offset.y * factor };
        break;
      case "down":
        by = { x: 0, y: offset.y * factor };
        break;
      case "left":
        by = { x: -offset.x * factor, y: 0 };
        break;
      case "right":
        by = { x: offset.x * factor, y: 0 };
        break;
    }
    if (by.x || by.y) {
      event.preventDefault();
      this.manager.actions.move({
        event,
        by
      });
    }
  }
  sideEffects() {
    const autoScroller = this.manager.registry.plugins.get(AutoScroller);
    if ((autoScroller == null ? void 0 : autoScroller.disabled) === false) {
      autoScroller.disable();
      __privateGet(this, _cleanupFunctions).push(() => {
        autoScroller.enable();
      });
    }
  }
  cleanup() {
    __privateGet(this, _cleanupFunctions).forEach((cleanup) => cleanup());
    __privateSet(this, _cleanupFunctions, []);
  }
  destroy() {
    this.cleanup();
    this.listeners.clear();
  }
};
_cleanupFunctions = new WeakMap();
_KeyboardSensor.configure = configurator(_KeyboardSensor);
_KeyboardSensor.defaults = defaults;
var KeyboardSensor = _KeyboardSensor;
var _coordinates;
var DistanceConstraint = class extends ActivationConstraint {
  constructor() {
    super(...arguments);
    __privateAdd(this, _coordinates);
  }
  onEvent(event) {
    switch (event.type) {
      case "pointerdown":
        __privateSet(this, _coordinates, getEventCoordinates(event));
        break;
      case "pointermove":
        if (!__privateGet(this, _coordinates)) return;
        const { x, y } = getEventCoordinates(event);
        const delta = {
          x: x - __privateGet(this, _coordinates).x,
          y: y - __privateGet(this, _coordinates).y
        };
        const { tolerance } = this.options;
        if (tolerance && exceedsDistance(delta, tolerance)) {
          this.abort();
          return;
        }
        if (exceedsDistance(delta, this.options.value)) {
          this.activate(event);
        }
        break;
      case "pointerup":
        this.abort();
        break;
    }
  }
  abort() {
    __privateSet(this, _coordinates, void 0);
  }
};
_coordinates = new WeakMap();
var _timeout2, _coordinates2;
var DelayConstraint = class extends ActivationConstraint {
  constructor() {
    super(...arguments);
    __privateAdd(this, _timeout2);
    __privateAdd(this, _coordinates2);
  }
  onEvent(event) {
    switch (event.type) {
      case "pointerdown":
        __privateSet(this, _coordinates2, getEventCoordinates(event));
        __privateSet(this, _timeout2, setTimeout(
          () => this.activate(event),
          this.options.value
        ));
        break;
      case "pointermove":
        if (!__privateGet(this, _coordinates2)) return;
        const { x, y } = getEventCoordinates(event);
        const delta = {
          x: x - __privateGet(this, _coordinates2).x,
          y: y - __privateGet(this, _coordinates2).y
        };
        if (exceedsDistance(delta, this.options.tolerance)) {
          this.abort();
        }
        break;
      case "pointerup":
        this.abort();
        break;
    }
  }
  abort() {
    if (__privateGet(this, _timeout2)) {
      clearTimeout(__privateGet(this, _timeout2));
      __privateSet(this, _coordinates2, void 0);
      __privateSet(this, _timeout2, void 0);
    }
  }
};
_timeout2 = new WeakMap();
_coordinates2 = new WeakMap();

// src/core/sensors/pointer/PointerActivationConstraints.ts
var PointerActivationConstraints = class {
};
PointerActivationConstraints.Delay = DelayConstraint;
PointerActivationConstraints.Distance = DistanceConstraint;

// src/core/sensors/pointer/PointerSensor.ts
var defaults2 = Object.freeze({
  activationConstraints(event, source) {
    var _a5;
    const { pointerType, target } = event;
    if (pointerType === "mouse" && isElement(target) && (source.handle === target || ((_a5 = source.handle) == null ? void 0 : _a5.contains(target)))) {
      return void 0;
    }
    if (pointerType === "touch") {
      return [
        new PointerActivationConstraints.Delay({ value: 250, tolerance: 5 })
      ];
    }
    if (isTextInput(target) && !event.defaultPrevented) {
      return [
        new PointerActivationConstraints.Delay({ value: 200, tolerance: 0 })
      ];
    }
    return [
      new PointerActivationConstraints.Delay({ value: 200, tolerance: 10 }),
      new PointerActivationConstraints.Distance({ value: 5 })
    ];
  },
  preventActivation(event, source) {
    var _a5;
    const { target } = event;
    if (target === source.element) return false;
    if (target === source.handle) return false;
    if (!isElement(target)) return false;
    if ((_a5 = source.handle) == null ? void 0 : _a5.contains(target)) return false;
    const interactiveElement = getInteractiveElement(target);
    if (interactiveElement === source.element) return false;
    return Boolean(interactiveElement);
  }
});
var _cleanup;
var _PointerSensor = class _PointerSensor extends Sensor {
  constructor(manager, options) {
    super(manager);
    this.manager = manager;
    this.options = options;
    __privateAdd(this, _cleanup, /* @__PURE__ */ new Set());
    this.listeners = new Listeners();
    this.latest = {
      event: void 0,
      coordinates: void 0
    };
    this.handleMove = () => {
      const { event, coordinates: to } = this.latest;
      if (!event || !to) {
        return;
      }
      this.manager.actions.move({ event, to });
    };
    this.handleCancel = this.handleCancel.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }
  activationConstraints(event, source, options = this.options) {
    const { activationConstraints = defaults2.activationConstraints } = options != null ? options : {};
    const constraints = typeof activationConstraints === "function" ? activationConstraints(event, source) : activationConstraints;
    return constraints;
  }
  bind(source, options = this.options) {
    const unbind = effect(() => {
      var _a5;
      const controller = new AbortController();
      const { signal: signal3 } = controller;
      const listener = (event) => {
        if (isPointerEvent(event)) {
          this.handlePointerDown(event, source, options);
        }
      };
      let targets = [(_a5 = source.handle) != null ? _a5 : source.element];
      if (options == null ? void 0 : options.activatorElements) {
        if (Array.isArray(options.activatorElements)) {
          targets = options.activatorElements;
        } else {
          targets = options.activatorElements(source);
        }
      }
      for (const target of targets) {
        if (!target) continue;
        patchWindow(target.ownerDocument.defaultView);
        target.addEventListener("pointerdown", listener, { signal: signal3 });
      }
      return () => controller.abort();
    });
    return unbind;
  }
  handlePointerDown(event, source, options) {
    if (this.disabled || !event.isPrimary || event.button !== 0 || !isElement(event.target) || source.disabled || isCapturedBySensor(event) || !this.manager.dragOperation.status.idle) {
      return;
    }
    const { preventActivation = defaults2.preventActivation } = options != null ? options : {};
    if (preventActivation == null ? void 0 : preventActivation(event, source)) {
      return;
    }
    const { target } = event;
    const isNativeDraggable = isHTMLElement(target) && target.draggable && target.getAttribute("draggable") === "true";
    const offset = getFrameTransform(source.element);
    const { x, y } = getEventCoordinates(event);
    this.initialCoordinates = {
      x: x * offset.scaleX + offset.x,
      y: y * offset.scaleY + offset.y
    };
    const constraints = this.activationConstraints(event, source, options);
    event.sensor = this;
    const controller = new ActivationController(
      constraints,
      (event2) => this.handleStart(source, event2)
    );
    controller.signal.onabort = () => this.handleCancel(event);
    controller.onEvent(event);
    this.controller = controller;
    const documents = getDocuments();
    const unbindListeners = this.listeners.bind(documents, [
      {
        type: "pointermove",
        listener: (event2) => this.handlePointerMove(event2, source)
      },
      {
        type: "pointerup",
        listener: this.handlePointerUp,
        options: {
          capture: true
        }
      },
      {
        type: "pointercancel",
        listener: this.handleCancel
      },
      {
        // Cancel activation if there is a competing Drag and Drop interaction
        type: "dragstart",
        listener: isNativeDraggable ? this.handleCancel : preventDefault,
        options: {
          capture: true
        }
      }
    ]);
    const cleanup = () => {
      unbindListeners();
      this.initialCoordinates = void 0;
    };
    __privateGet(this, _cleanup).add(cleanup);
  }
  handlePointerMove(event, source) {
    var _a5, _b2;
    if (((_a5 = this.controller) == null ? void 0 : _a5.activated) === false) {
      (_b2 = this.controller) == null ? void 0 : _b2.onEvent(event);
    }
    const { status } = this.manager.dragOperation;
    if (status.initializing || status.dragging) {
      const coordinates = getEventCoordinates(event);
      const offset = getFrameTransform(source.element);
      coordinates.x = coordinates.x * offset.scaleX + offset.x;
      coordinates.y = coordinates.y * offset.scaleY + offset.y;
      event.preventDefault();
      event.stopPropagation();
      this.latest.event = event;
      this.latest.coordinates = coordinates;
      if (status.dragging) {
        scheduler.schedule(this.handleMove);
      }
    }
  }
  handlePointerUp(event) {
    const { status } = this.manager.dragOperation;
    if (!status.idle) {
      event.preventDefault();
      event.stopPropagation();
      const canceled = !status.initialized;
      const ownerDocument = getDocument(event.target);
      const ownerWindow = ownerDocument.defaultView;
      if (!canceled && ownerWindow) {
        const suppressClick = (clickEvent) => {
          if (clickEvent.target === ownerDocument.body && clickEvent.detail > 0) {
            clickEvent.preventDefault();
            clickEvent.stopImmediatePropagation();
          }
        };
        ownerWindow.addEventListener("click", suppressClick, true);
        ownerWindow.setTimeout(() => {
          ownerWindow.removeEventListener("click", suppressClick, true);
        }, 0);
      }
      this.manager.actions.stop({ event, canceled });
    }
    this.cleanup();
  }
  handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      this.handleCancel(event);
    }
  }
  handleStart(source, event) {
    const { manager, initialCoordinates } = this;
    if (!initialCoordinates || !manager.dragOperation.status.idle) {
      return;
    }
    if (event.defaultPrevented) {
      return;
    }
    const controller = manager.actions.start({
      coordinates: initialCoordinates,
      event,
      source
    });
    if (controller.signal.aborted) return this.cleanup();
    event.preventDefault();
    const ownerDocument = getDocument(event.target);
    const pointerCaptureTarget = ownerDocument.body;
    try {
      pointerCaptureTarget.setPointerCapture(event.pointerId);
    } catch (e) {
      this.handleCancel(event);
      return;
    }
    const listenerTargets = isElement(event.target) ? [event.target, pointerCaptureTarget] : pointerCaptureTarget;
    const unbind = this.listeners.bind(listenerTargets, [
      {
        // Prevent scrolling on touch devices
        type: "touchmove",
        listener: preventDefault,
        options: {
          passive: false
        }
      },
      {
        // Prevent click events
        type: "click",
        listener: preventDefault
      },
      {
        type: "contextmenu",
        listener: preventDefault
      },
      {
        type: "keydown",
        listener: this.handleKeyDown
      }
    ]);
    __privateGet(this, _cleanup).add(unbind);
    manager.renderer.rendering.then(() => {
      if (!controller.signal.aborted && manager.dragOperation.status.dragging) {
        scheduler.schedule(this.handleMove);
      }
    });
  }
  handleCancel(event) {
    const { dragOperation } = this.manager;
    if (dragOperation.status.initialized) {
      this.manager.actions.stop({ event, canceled: true });
    }
    this.cleanup();
  }
  cleanup() {
    const { controller } = this;
    this.controller = void 0;
    if (controller && !controller.signal.aborted) {
      controller.abort();
    }
    this.latest = {
      event: void 0,
      coordinates: void 0
    };
    __privateGet(this, _cleanup).forEach((cleanup) => cleanup());
    __privateGet(this, _cleanup).clear();
  }
  destroy() {
    this.cleanup();
    this.listeners.clear();
  }
};
_cleanup = new WeakMap();
_PointerSensor.configure = configurator(_PointerSensor);
_PointerSensor.defaults = defaults2;
var PointerSensor = _PointerSensor;
function isCapturedBySensor(event) {
  return "sensor" in event;
}
function preventDefault(event) {
  event.preventDefault();
}
function noop() {
}
var windows = /* @__PURE__ */ new WeakSet();
function patchWindow(window) {
  if (!window || windows.has(window)) {
    return;
  }
  window.addEventListener("touchmove", noop, {
    capture: false,
    passive: false
  });
  windows.add(window);
}

// src/core/manager/manager.ts
var defaultPreset = {
  modifiers: [],
  plugins: [Accessibility, AutoScroller, Cursor, Feedback, PreventSelection],
  sensors: [PointerSensor, KeyboardSensor]
};
var DragDropManager = class extends DragDropManager$1 {
  constructor(input = {}) {
    const plugins = resolveCustomizable(input.plugins, defaultPreset.plugins);
    const sensors = resolveCustomizable(input.sensors, defaultPreset.sensors);
    const modifiers = resolveCustomizable(
      input.modifiers,
      defaultPreset.modifiers
    );
    super(__spreadProps(__spreadValues({}, input), {
      plugins: [ScrollListener, Scroller, StyleInjector, ...plugins],
      sensors,
      modifiers
    }));
  }
};
var _element_dec, _handle_dec, _c, _init5, _handle, _element;
var Draggable = class extends (_c = Draggable$1, _handle_dec = [reactive], _element_dec = [reactive], _c) {
  constructor(_a5, manager) {
    var _b2 = _a5, {
      element,
      effects: effects2 = () => [],
      handle
    } = _b2, input = __objRest(_b2, [
      "element",
      "effects",
      "handle"
    ]);
    super(
      __spreadValues({
        effects: () => [
          ...effects2(),
          () => {
            var _a6, _b3;
            const { manager: manager2 } = this;
            if (!manager2) return;
            const sensors = (_b3 = (_a6 = this.sensors) == null ? void 0 : _a6.map(descriptor)) != null ? _b3 : [
              ...manager2.sensors
            ];
            const unbindFunctions = sensors.map((entry) => {
              const sensorInstance = entry instanceof Sensor ? entry : manager2.registry.register(entry.plugin);
              const options = entry instanceof Sensor ? void 0 : entry.options;
              const unbind = sensorInstance.bind(this, options);
              return unbind;
            });
            return function cleanup() {
              unbindFunctions.forEach((unbind) => unbind());
            };
          }
        ]
      }, input),
      manager
    );
    __privateAdd(this, _handle, __runInitializers(_init5, 8, this)), __runInitializers(_init5, 11, this);
    __privateAdd(this, _element, __runInitializers(_init5, 12, this)), __runInitializers(_init5, 15, this);
    this.element = element;
    this.handle = handle;
  }
};
_init5 = __decoratorStart(_c);
_handle = new WeakMap();
_element = new WeakMap();
__decorateElement(_init5, 4, "handle", _handle_dec, Draggable, _handle);
__decorateElement(_init5, 4, "element", _element_dec, Draggable, _element);
__decoratorMetadata(_init5, Draggable);
var _proxy_dec, _element_dec2, _c2, _init6, _element2, _d, element_get, element_set, _Droppable_instances, _proxy;
var Droppable = class extends (_c2 = Droppable$1, _element_dec2 = [reactive], _proxy_dec = [reactive], _c2) {
  constructor(_a5, manager) {
    var _b2 = _a5, { element, effects: effects2 = () => [] } = _b2, input = __objRest(_b2, ["element", "effects"]);
    const { collisionDetector = defaultCollisionDetection } = input;
    const updateShape = (boundingClientRect) => {
      const { manager: manager2, element: element2 } = this;
      if (!element2 || boundingClientRect === null) {
        this.shape = void 0;
        return void 0;
      }
      if (!manager2) return;
      const updatedShape = new DOMRectangle(element2);
      const shape = untracked(() => this.shape);
      if (updatedShape && (shape == null ? void 0 : shape.equals(updatedShape))) {
        return shape;
      }
      this.shape = updatedShape;
      return updatedShape;
    };
    const observePosition = signal(false);
    super(
      __spreadProps(__spreadValues({}, input), {
        collisionDetector,
        effects: () => [
          ...effects2(),
          () => {
            const { element: element2, manager: manager2 } = this;
            if (!manager2) return;
            const { dragOperation } = manager2;
            const { source } = dragOperation;
            observePosition.value = Boolean(
              source && dragOperation.status.initialized && element2 && !this.disabled && this.accepts(source)
            );
          },
          () => {
            const { element: element2 } = this;
            if (observePosition.value && element2) {
              const positionObserver = new PositionObserver(
                element2,
                updateShape
              );
              return () => {
                positionObserver.disconnect();
                this.shape = void 0;
              };
            }
          },
          () => {
            var _a6;
            if ((_a6 = this.manager) == null ? void 0 : _a6.dragOperation.status.initialized) {
              return () => {
                this.shape = void 0;
              };
            }
          }
        ]
      }),
      manager
    );
    __privateAdd(this, _Droppable_instances);
    __privateAdd(this, _element2, __runInitializers(_init6, 8, this)), __runInitializers(_init6, 11, this);
    __privateAdd(this, _proxy, __runInitializers(_init6, 12, this)), __runInitializers(_init6, 15, this);
    this.element = element;
    this.refreshShape = () => updateShape();
  }
  set element(element) {
    __privateSet(this, _Droppable_instances, element, element_set);
  }
  get element() {
    var _a5;
    return (_a5 = this.proxy) != null ? _a5 : __privateGet(this, _Droppable_instances, element_get);
  }
};
_init6 = __decoratorStart(_c2);
_element2 = new WeakMap();
_Droppable_instances = new WeakSet();
_proxy = new WeakMap();
_d = __decorateElement(_init6, 20, "#element", _element_dec2, _Droppable_instances, _element2), element_get = _d.get, element_set = _d.set;
__decorateElement(_init6, 4, "proxy", _proxy_dec, Droppable, _proxy);
__decoratorMetadata(_init6, Droppable);

export { Accessibility, AutoScroller, Cursor, DragDropManager, Draggable, Droppable, Feedback, KeyboardSensor, PointerActivationConstraints, PointerSensor, PreventSelection, ScrollListener, Scroller, StyleInjector, defaultPreset };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map