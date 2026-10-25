import { useLayoutEffect, useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { computed, signal, effect, untracked } from '@dnd-kit/state';
import { flushSync } from 'react-dom';
import { currentValue } from '@dnd-kit/react/utilities';

function useConstant(initializer) {
  const ref = useRef(null);
  if (!ref.current) {
    ref.current = initializer();
  }
  return ref.current;
}
var canUseDOM = typeof window !== "undefined" && typeof window.document !== "undefined" && typeof window.document.createElement !== "undefined";
var useIsomorphicLayoutEffect = canUseDOM ? useLayoutEffect : useEffect;
function useForceUpdate() {
  const setState = useState(0)[1];
  return useCallback(() => {
    setState((value) => value + 1);
  }, [setState]);
}

// src/hooks/useSignal.ts
function useSignal(signal2, sync = false) {
  const previous = useRef(signal2.peek());
  const read = useRef(false);
  const forceUpdate = useForceUpdate();
  useIsomorphicLayoutEffect(
    () => effect(() => {
      const previousValue = previous.current;
      const currentValue2 = signal2.value;
      if (previousValue !== currentValue2) {
        previous.current = currentValue2;
        if (!read.current) return;
        if (sync) {
          flushSync(forceUpdate);
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
  const $compute = useRef(compute);
  $compute.current = compute;
  return useSignal(
    useMemo(() => computed(() => $compute.current()), dependencies),
    sync
  );
}
function useLatest(value) {
  const valueRef = useRef(value);
  useIsomorphicLayoutEffect(() => {
    valueRef.current = value;
  }, [value]);
  return valueRef;
}

// src/hooks/useDeepSignal.ts
function useDeepSignal(target, synchronous) {
  const forceUpdate = useForceUpdate();
  const synchronousRef = useLatest(synchronous);
  const tracker = useMemo(() => {
    const tracked = /* @__PURE__ */ new Map();
    return {
      tracked,
      propertyCount: signal(0),
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
    const dispose = effect(() => {
      propertyCount.value;
      let stale = false;
      let sync = false;
      for (const [key, value] of tracked) {
        const latestValue = target[key];
        if (!Object.is(value, latestValue)) {
          stale = true;
          tracked.set(key, latestValue);
          sync = untracked(
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
            if (tracker.active) flushSync(forceUpdate);
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
function useOnValueChange(value, onChange, effect3 = useEffect, compare = Object.is) {
  const tracked = useRef(value);
  effect3(() => {
    const oldValue = tracked.current;
    if (!compare(value, oldValue)) {
      tracked.current = value;
      onChange(value, oldValue);
    }
  }, [onChange, value]);
}
function useOnElementChange(value, onChange) {
  const previous = useRef(currentValue(value));
  useIsomorphicLayoutEffect(() => {
    const current = currentValue(value);
    if (current !== previous.current) {
      previous.current = current;
      onChange(current);
    }
  });
}

export { useComputed, useConstant, useDeepSignal, useImmediateEffect, useIsomorphicLayoutEffect, useLatest, useOnElementChange, useOnValueChange };
//# sourceMappingURL=hooks.js.map
//# sourceMappingURL=hooks.js.map