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

export class ImageStatusStore<State extends object> {
  private readonly states = new Map<string, State>();
  private readonly listeners = new Map<string, Set<Listener>>();

  /** The state of a key, or undefined. The same object until the state changes. */
  get(key: string): State | undefined {
    return this.states.get(key);
  }

  /** Calls `listener` whenever the state of `key` changes. Returns the unsubscribe function. */
  subscribe(key: string, listener: Listener): () => void {
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(key);
    };
  }

  /**
   * Sets many states at once (undefined removes one), then tells the listeners of the keys
   * whose state really changed. An equal state keeps the old object, so nothing re-renders.
   */
  setMany(entries: Iterable<readonly [string, State | undefined]>): void {
    const changed: string[] = [];
    for (const [key, state] of entries) {
      const previous = this.states.get(key);
      if (sameState(previous, state)) continue;
      if (state === undefined) this.states.delete(key);
      else this.states.set(key, state);
      changed.push(key);
    }
    for (const key of changed) {
      this.listeners.get(key)?.forEach((listener) => listener());
    }
  }

  /** The keys that have a state. */
  keys(): string[] {
    return Array.from(this.states.keys());
  }
}
