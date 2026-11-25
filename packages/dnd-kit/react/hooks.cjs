'use strict';

var react = require('react');
var state = require('@dnd-kit/state');
var reactDom = require('react-dom');
var utilities = require('@dnd-kit/react/utilities');

function useConstant(initializer) {
  const ref = react.useRef(null);
  if (!ref.current) {
    ref.current = initializer();
  }
  return ref.current;
}
var canUseDOM = typeof window !== "undefined" && typeof window.document !== "undefined" && typeof window.document.createElement !== "undefined";
var useIsomorphicLayoutEffect = canUseDOM ? react.useLayoutEffect : react.useEffect;
function useForceUpdate() {
  const setState = react.useState(0)[1];
  return react.useCallback(() => {
    setState((value) => value + 1);
  }, [setState]);
}

// src/hooks/useSignal.ts
function useSignal(signal2, sync = false) {
  const previous = react.useRef(signal2.peek());
  const read = react.useRef(false);
  const forceUpdate = useForceUpdate();
  useIsomorphicLayoutEffect(
    () => state.effect(() => {
      const previousValue = previous.current;
      const currentValue2 = signal2.value;
      if (previousValue !== currentValue2) {
        previous.current = currentValue2;
        if (!read.current) return;
        if (sync) {
          reactDom.flushSync(forceUpdate);
        } else {
          forceUpdate();
        }
      }
    }),
    [signal2, sync, forceUpdate]
  );
  return {
    get value() {
      read.current = true;
      return signal2.peek();
    }
  };
}

// src/hooks/useComputed.ts
function useComputed(compute, dependencies = [], sync = false) {
  const $compute = react.useRef(compute);
  $compute.current = compute;
  return useSignal(
    react.useMemo(() => state.computed(() => $compute.current()), dependencies),
    sync
  );
}
function useLatest(value) {
  const valueRef = react.useRef(value);
  useIsomorphicLayoutEffect(() => {
    valueRef.current = value;
  }, [value]);
  return valueRef;
}

// src/hooks/useDeepSignal.ts
function useDeepSignal(target, synchronous) {
  const forceUpdate = useForceUpdate();
  const synchronousRef = useLatest(synchronous);
  const tracker = react.useMemo(() => {
    const tracked = /* @__PURE__ */ new Map();
    return {
      tracked,
      propertyCount: state.signal(0),
      active: false,
      proxy: target ? new Proxy(target, {
        get(target2, key) {
          const value = target2[key];
          if (!tracked.has(key)) tracked.set(key, value);
          return value;
        }
      }) : target
    };
  }, [target]);
  useIsomorphicLayoutEffect(() => {
    tracker.propertyCount.value = tracker.tracked.size;
  });
  useIsomorphicLayoutEffect(() => {
    if (!target) return;
    const { tracked, propertyCount } = tracker;
    tracker.active = true;
    const dispose = state.effect(() => {
      propertyCount.value;
      let stale = false;
      let sync = false;
      for (const [key, value] of tracked) {
        const latestValue = target[key];
        if (!Object.is(value, latestValue)) {
          stale = true;
          tracked.set(key, latestValue);
          sync = state.untracked(
            () => {
              var _a;
              return (_a = synchronousRef.current) == null ? void 0 : _a.call(synchronousRef, key, value, latestValue);
            }
          ) === true || sync;
        }
      }
      if (stale) {
        if (sync) {
          queueMicrotask(() => {
            if (tracker.active) reactDom.flushSync(forceUpdate);
          });
        } else {
          forceUpdate();
        }
      }
    });
    return () => {
      tracker.active = false;
      dispose();
    };
  }, [target, tracker, forceUpdate, synchronousRef]);
  return tracker.proxy;
}

// src/hooks/useImmediateEffect.ts
function useImmediateEffect(callback, _) {
  callback();
}
function useOnValueChange(value, onChange, effect3 = react.useEffect, compare = Object.is) {
  const tracked = react.useRef(value);
  effect3(() => {
    const oldValue = tracked.current;
    if (!compare(value, oldValue)) {
      tracked.current = value;
      onChange(value, oldValue);
    }
  }, [onChange, value]);
}
function useOnElementChange(value, onChange) {
  const previous = react.useRef(utilities.currentValue(value));
  useIsomorphicLayoutEffect(() => {
    const current = utilities.currentValue(value);
    if (current !== previous.current) {
      previous.current = current;
      onChange(current);
    }
  });
}

exports.useComputed = useComputed;
exports.useConstant = useConstant;
exports.useDeepSignal = useDeepSignal;
exports.useImmediateEffect = useImmediateEffect;
exports.useIsomorphicLayoutEffect = useIsomorphicLayoutEffect;
exports.useLatest = useLatest;
exports.useOnElementChange = useOnElementChange;
exports.useOnValueChange = useOnValueChange;
//# sourceMappingURL=hooks.cjs.map
//# sourceMappingURL=hooks.cjs.map