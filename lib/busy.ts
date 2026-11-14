/**
 * Whether the page is still working on something the visitor started: a move to another
 * address, a drag, files being added, a picture being captured. A change to the list is not
 * counted: the editor writes its link into the address in the same event. It never blocks
 * anything: it only counts the work in progress, so the page can say so with `aria-busy` on
 * <main> (components/BusyMain.tsx), for screen readers and for the tests, which wait until the
 * page is not busy after each step.
 *
 * Work must begin in the same event that starts it (before any await), so the page says it is
 * busy before the event ends.
 */
export interface BusyTracker {
  /** Counts one piece of work as started; the function it returns ends it (once). */
  readonly begin: () => () => void;
  /** Runs `work`, counted from now until it settles. */
  readonly during: <T>(work: () => Promise<T>) => Promise<T>;
  readonly isBusy: () => boolean;
  readonly subscribe: (listener: () => void) => () => void;
}

export function createBusyTracker(): BusyTracker {
  let count = 0;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const begin = () => {
    count += 1;
    if (count === 1) notify();
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      count -= 1;
      if (count === 0) notify();
    };
  };
  return Object.freeze({
    begin,
    during: async <T>(work: () => Promise<T>): Promise<T> => {
      const end = begin();
      try {
        return await work();
      } finally {
        end();
      }
    },
    isBusy: () => count > 0,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  });
}

/** The page's tracker: one per browser tab. */
export const pageBusy: BusyTracker = createBusyTracker();

/**
 * A part of the page that starts later than the rest, such as the editor, whose code loads on
 * its own. The page counts as busy from the first `hold` until the part calls `start`, so the
 * page does not say it is ready while that part still shows the server's copy, which takes no input.
 */
export interface StartGate {
  /** Counts the page as busy until the part has started; the function it returns stops holding. */
  readonly hold: () => () => void;
  /** Marks the part as started; the function it returns marks it as gone again. */
  readonly start: () => () => void;
}

export function createStartGate(tracker: BusyTracker): StartGate {
  let started = false;
  let end: (() => void) | null = null;
  const release = () => {
    end?.();
    end = null;
  };
  return Object.freeze({
    hold: () => {
      if (!started) end ??= tracker.begin();
      return release;
    },
    start: () => {
      started = true;
      release();
      return () => {
        started = false;
      };
    },
  });
}

/**
 * The page's own content. Next.js shows it inside a Suspense boundary (app/loading.tsx), which
 * React takes over in a later pass than <main>, so <main> holds the page busy until the content
 * says it has started (components/StartHold.tsx, PageStarted).
 */
export const pageStart: StartGate = createStartGate(pageBusy);

/** The editor of /rank pages (components/TierListManager.tsx). */
export const editorStart: StartGate = createStartGate(pageBusy);

/** The file opener of the Home page (components/HomeFileOpener.tsx). */
export const homeFileOpenerStart: StartGate = createStartGate(pageBusy);
