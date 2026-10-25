/**
 * The image state of each tile, outside React state, so that a tile re-renders only when its
 * own image changes (useSyncExternalStore with one subscription per key). Loading the images of
 * a list with hundreds of uploads then renders each tile once or twice, instead of re-rendering
 * every tile for every image that arrives.
 *
 * Plain TypeScript: no React, no browser APIs.
 */

type Listener = () => void;

/** Two states are the same when their fields are equal (states are small flat objects). */
function sameState(a: object | undefined, b: object | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  return keysA.length === keysB.length
    && keysA.every((key) => (a as Record<string, unknown>)[key] === (b as Record<string, unknown>)[key]);
}

export interface ImageStatusStore<State extends object> {
  /** The state of a key, or undefined. The same object until the state changes. */
  get(key: string): State | undefined;
  /** Calls `listener` whenever the state of `key` changes. Returns the unsubscribe function. */
  subscribe(key: string, listener: Listener): () => void;
  /**
   * Sets many states at once (undefined removes one), then tells the listeners of the keys
   * whose state really changed. An equal state keeps the old object, so nothing re-renders.
   */
  setMany(entries: Iterable<readonly [string, State | undefined]>): void;
  /** The keys that have a state. */
  keys(): string[];
}

/** A new, empty store (a factory with closures, A47: no classes). */
export function createImageStatusStore<State extends object>(): ImageStatusStore<State> {
  const states = new Map<string, State>();
  const listeners = new Map<string, Set<Listener>>();
  return {
    get: (key) => states.get(key),
    subscribe(key, listener) {
      let set = listeners.get(key);
      if (!set) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(listener);
      const keyListeners = set;
      return () => {
        keyListeners.delete(listener);
        if (keyListeners.size === 0 && listeners.get(key) === keyListeners) listeners.delete(key);
      };
    },
    setMany(entries) {
      const changed: string[] = [];
      for (const [key, state] of entries) {
        if (sameState(states.get(key), state)) continue;
        if (state === undefined) states.delete(key);
        else states.set(key, state);
        changed.push(key);
      }
      for (const key of changed) listeners.get(key)?.forEach((listener) => listener());
    },
    keys: () => Array.from(states.keys()),
  };
}
