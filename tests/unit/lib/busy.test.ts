import {describe, expect, it} from 'vitest';
import {createBusyTracker, createStartGate} from '@/lib/busy';

describe('createBusyTracker', () => {
  it('returns busy until both ends have run when two begins overlap', () => {
    const busy = createBusyTracker();
    const first = busy.begin();
    const second = busy.begin();
    first();
    expect(busy.isBusy()).toBe(true);
    second();
    expect(busy.isBusy()).toBe(false);
  });

  it('returns busy until the last open begin ends when one end function is called twice', () => {
    const busy = createBusyTracker();
    const first = busy.begin();
    const second = busy.begin();
    first();
    first();
    expect(busy.isBusy()).toBe(true);
    second();
    expect(busy.isBusy()).toBe(false);
  });

  it('writes one notice per change between busy and idle when two begins and their ends run', () => {
    const busy = createBusyTracker();
    const notices: boolean[] = [];
    const stop = busy.subscribe(() => notices.push(busy.isBusy()));
    const first = busy.begin();
    const second = busy.begin();
    first();
    second();
    stop();
    busy.begin();
    expect(notices).toEqual([true, false]);
  });

  it('returns not busy when the promise of during() rejects', async () => {
    const busy = createBusyTracker();
    const work = busy.during(async () => {
      throw new Error('broken');
    });
    expect(busy.isBusy()).toBe(true);
    await expect(work).rejects.toThrow('broken');
    expect(busy.isBusy()).toBe(false);
  });
});

describe('createStartGate', () => {
  it('returns busy until the part starts when the gate waits first', () => {
    const busy = createBusyTracker();
    const gate = createStartGate(busy);
    gate.hold();
    expect(busy.isBusy()).toBe(true);
    gate.start();
    expect(busy.isBusy()).toBe(false);
  });

  it('returns not busy when the part started before the gate waits', () => {
    const busy = createBusyTracker();
    const gate = createStartGate(busy);
    gate.start();
    gate.hold();
    expect(busy.isBusy()).toBe(false);
  });

  it('returns busy again when the part has gone and the gate waits again', () => {
    const busy = createBusyTracker();
    const gate = createStartGate(busy);
    const gone = gate.start();
    gone();
    const stop = gate.hold();
    expect(busy.isBusy()).toBe(true);
    stop();
    expect(busy.isBusy()).toBe(false);
  });

  it('returns one busy count when the gate waits twice before the part starts', () => {
    const busy = createBusyTracker();
    const gate = createStartGate(busy);
    gate.hold();
    gate.hold();
    gate.start();
    expect(busy.isBusy()).toBe(false);
  });
});
