import {describe, expect, it} from 'vitest';
import {framePainted, type FrameSource, type PaintingDocument} from '@/lib/framePainted';

class FakePage implements PaintingDocument, FrameSource {
  visibilityState = 'visible';
  private listeners: (() => void)[] = [];
  private callbacks = new Map<number, () => void>();
  private handles = 0;
  cancelled: number[] = [];

  addEventListener(_type: 'visibilitychange', listener: () => void) {
    this.listeners.push(listener);
  }

  removeEventListener(_type: 'visibilitychange', listener: () => void) {
    this.listeners = this.listeners.filter((entry) => entry !== listener);
  }

  requestAnimationFrame(callback: () => void): number {
    this.handles += 1;
    this.callbacks.set(this.handles, callback);
    return this.handles;
  }

  cancelAnimationFrame(handle: number) {
    this.cancelled.push(handle);
    this.callbacks.delete(handle);
  }

  renderFrame() {
    const due = Array.from(this.callbacks.values());
    this.callbacks.clear();
    due.forEach((callback) => callback());
  }

  changeVisibility(state: 'visible' | 'hidden') {
    this.visibilityState = state;
    this.listeners.forEach((listener) => listener());
  }

  get listenerCount() {
    return this.listeners.length;
  }

  get frameRequests() {
    return this.callbacks.size;
  }
}

const WAITING = 'waiting';

async function stateNow(painted: Promise<void>): Promise<string> {
  let state = WAITING;
  void painted.then(() => {
    state = 'painted';
  });
  await new Promise((resolve) => setImmediate(resolve));
  return state;
}

describe('framePainted', () => {
  it('returns no answer when the page has rendered no frame', async () => {
    const page = new FakePage();

    expect(await stateNow(framePainted(page, page))).toBe(WAITING);
  });

  it('returns no answer when the page has rendered one frame', async () => {
    const page = new FakePage();
    const painted = framePainted(page, page);

    page.renderFrame();

    expect(await stateNow(painted)).toBe(WAITING);
  });

  it('returns an answer when the page has rendered two frames', async () => {
    const page = new FakePage();
    const painted = framePainted(page, page);

    page.renderFrame();
    page.renderFrame();

    expect(await stateNow(painted)).toBe('painted');
    expect(page.listenerCount).toBe(0);
  });

  it('returns an answer at once when the page is hidden', async () => {
    const page = new FakePage();
    page.visibilityState = 'hidden';

    expect(await stateNow(framePainted(page, page))).toBe('painted');
    expect(page.frameRequests).toBe(0);
    expect(page.listenerCount).toBe(0);
  });

  it('returns an answer when the page becomes hidden before its next frame', async () => {
    const page = new FakePage();
    const painted = framePainted(page, page);

    page.renderFrame();
    page.changeVisibility('hidden');

    expect(await stateNow(painted)).toBe('painted');
    expect(page.frameRequests).toBe(0);
    expect(page.listenerCount).toBe(0);
  });

  it('returns no answer when a visibility change leaves the page visible', async () => {
    const page = new FakePage();
    const painted = framePainted(page, page);

    page.changeVisibility('visible');

    expect(await stateNow(painted)).toBe(WAITING);
    expect(page.listenerCount).toBe(1);
  });
});
