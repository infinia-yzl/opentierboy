"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __decoratorStart = (base) => {
  var _a2;
  return [, , , __create((_a2 = base == null ? void 0 : base[__knownSymbol("metadata")]) != null ? _a2 : null)];
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

// src/index.ts
var src_exports = {};
__export(src_exports, {
  Signal: () => import_signals_core6.Signal,
  ValueHistory: () => ValueHistory,
  WeakStore: () => WeakStore,
  batch: () => import_signals_core6.batch,
  computed: () => computed,
  deepEqual: () => deepEqual,
  derived: () => derived,
  effect: () => import_signals_core6.effect,
  effects: () => effects,
  enumerable: () => enumerable,
  reactive: () => reactive,
  signal: () => import_signals_core6.signal,
  snapshot: () => snapshot,
  untracked: () => import_signals_core6.untracked
});
module.exports = __toCommonJS(src_exports);
var import_signals_core6 = require("@preact/signals-core");

// src/computed.ts
var import_signals_core = require("@preact/signals-core");
function computed(compute, comparator) {
  if (comparator) {
    let previousValue;
    return (0, import_signals_core.computed)(() => {
      const value = compute();
      if (value && previousValue && comparator(previousValue, value)) {
        return previousValue;
      }
      previousValue = value;
      return value;
    });
  }
  return (0, import_signals_core.computed)(compute);
}

// src/comparators.ts
function deepEqual(a, b) {
  if (Object.is(a, b)) {
    return true;
  }
  if (a === null || b === null) return false;
  if (typeof a === "function" && typeof b === "function") {
    return a === b;
  }
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) {
      return false;
    }
    for (const value of a) {
      if (!b.has(value)) {
        return false;
      }
    }
    return true;
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    const hasDifferentValues = a.some(
      (value, index) => !deepEqual(value, b[index])
    );
    return !hasDifferentValues;
  }
  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    const hasDifferentValues = aKeys.some(
      (key) => !deepEqual(a[key], b[key])
    );
    return !hasDifferentValues;
  }
  return false;
}

// src/decorators.ts
var import_signals_core2 = require("@preact/signals-core");
function reactive({ get }, _) {
  return {
    init(value) {
      return (0, import_signals_core2.signal)(value);
    },
    get() {
      const current = get.call(this);
      return current.value;
    },
    set(newValue) {
      const current = get.call(this);
      if (current.peek() === newValue) {
        return;
      }
      current.value = newValue;
    }
  };
}
function derived(target, _) {
  const map = /* @__PURE__ */ new WeakMap();
  return function() {
    let result = map.get(this);
    if (!result) {
      result = computed(target.bind(this));
      map.set(this, result);
    }
    return result.value;
  };
}
function enumerable(enumerable2 = true) {
  return function(_value, context) {
    context.addInitializer(function() {
      const host = context.kind === "field" ? this : context.static ? this : Object.getPrototypeOf(this);
      const descriptor = Object.getOwnPropertyDescriptor(host, context.name);
      if (descriptor) {
        Object.defineProperty(host, context.name, __spreadProps(__spreadValues({}, descriptor), { enumerable: enumerable2 }));
      }
    });
  };
}

// src/effects.ts
var import_signals_core3 = require("@preact/signals-core");
function effects(...entries) {
  const effects2 = entries.map((fn) => (0, import_signals_core3.effect)(fn));
  return () => effects2.forEach((cleanup) => cleanup());
}

// src/history.ts
var import_signals_core4 = require("@preact/signals-core");
var _previous_dec, _initial_dec, _current_dec, _current_dec2, _previous_dec2, _initial_dec2, _init, _initial, _a, initial_get, initial_set, _ValueHistory_instances, _previous, _b, previous_get, previous_set, _current, _c, current_get, current_set;
_initial_dec2 = [reactive], _previous_dec2 = [reactive], _current_dec2 = [reactive], _current_dec = [enumerable()], _initial_dec = [enumerable()], _previous_dec = [enumerable()];
var ValueHistory = class {
  constructor(defaultValue, equals = Object.is) {
    this.defaultValue = defaultValue;
    this.equals = equals;
    __runInitializers(_init, 5, this);
    __privateAdd(this, _ValueHistory_instances);
    // @ts-ignore
    __privateAdd(this, _initial, __runInitializers(_init, 8, this)), __runInitializers(_init, 11, this);
    // @ts-ignore
    __privateAdd(this, _previous, __runInitializers(_init, 12, this)), __runInitializers(_init, 15, this);
    // @ts-ignore
    __privateAdd(this, _current, __runInitializers(_init, 16, this)), __runInitializers(_init, 19, this);
    this.reset = this.reset.bind(this);
    this.reset();
  }
  get current() {
    return __privateGet(this, _ValueHistory_instances, current_get);
  }
  get initial() {
    return __privateGet(this, _ValueHistory_instances, initial_get);
  }
  get previous() {
    return __privateGet(this, _ValueHistory_instances, previous_get);
  }
  /** Set the current value */
  set current(value) {
    const current = (0, import_signals_core4.untracked)(() => __privateGet(this, _ValueHistory_instances, current_get));
    if (value && current && this.equals(current, value)) {
      return;
    }
    (0, import_signals_core4.batch)(() => {
      if (!__privateGet(this, _ValueHistory_instances, initial_get)) {
        __privateSet(this, _ValueHistory_instances, value, initial_set);
      }
      __privateSet(this, _ValueHistory_instances, current, previous_set);
      __privateSet(this, _ValueHistory_instances, value, current_set);
    });
  }
  /** Reset the state to the initial value */
  reset(value = this.defaultValue) {
    (0, import_signals_core4.batch)(() => {
      __privateSet(this, _ValueHistory_instances, void 0, previous_set);
      __privateSet(this, _ValueHistory_instances, value, initial_set);
      __privateSet(this, _ValueHistory_instances, value, current_set);
    });
  }
};
_init = __decoratorStart(null);
_initial = new WeakMap();
_ValueHistory_instances = new WeakSet();
_previous = new WeakMap();
_current = new WeakMap();
_a = __decorateElement(_init, 20, "#initial", _initial_dec2, _ValueHistory_instances, _initial), initial_get = _a.get, initial_set = _a.set;
_b = __decorateElement(_init, 20, "#previous", _previous_dec2, _ValueHistory_instances, _previous), previous_get = _b.get, previous_set = _b.set;
_c = __decorateElement(_init, 20, "#current", _current_dec2, _ValueHistory_instances, _current), current_get = _c.get, current_set = _c.set;
__decorateElement(_init, 2, "current", _current_dec, ValueHistory);
__decorateElement(_init, 2, "initial", _initial_dec, ValueHistory);
__decorateElement(_init, 2, "previous", _previous_dec, ValueHistory);
__decoratorMetadata(_init, ValueHistory);

// src/snapshot.ts
var import_signals_core5 = require("@preact/signals-core");
function snapshot(value) {
  return (0, import_signals_core5.untracked)(() => {
    const output = {};
    for (const key in value) {
      output[key] = value[key];
    }
    return output;
  });
}

// src/store.ts
var _store;
var WeakStore = class {
  constructor() {
    __privateAdd(this, _store, /* @__PURE__ */ new WeakMap());
  }
  get(key, id) {
    var _a2;
    return key ? (_a2 = __privateGet(this, _store).get(key)) == null ? void 0 : _a2.get(id) : void 0;
  }
  set(key, id, value) {
    var _a2;
    if (!key) return;
    if (!__privateGet(this, _store).has(key)) __privateGet(this, _store).set(key, /* @__PURE__ */ new Map());
    return (_a2 = __privateGet(this, _store).get(key)) == null ? void 0 : _a2.set(id, value);
  }
  clear(key) {
    var _a2;
    return key ? (_a2 = __privateGet(this, _store).get(key)) == null ? void 0 : _a2.clear() : void 0;
  }
};
_store = new WeakMap();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Signal,
  ValueHistory,
  WeakStore,
  batch,
  computed,
  deepEqual,
  derived,
  effect,
  effects,
  enumerable,
  reactive,
  signal,
  snapshot,
  untracked
});
