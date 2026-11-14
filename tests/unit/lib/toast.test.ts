import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {pageBusy} from '@/lib/busy';
import {toast} from '@/lib/toast';

/**
 * sonner's toast, mocked: each call that shows a toast sets a timer with no delay, as sonner's
 * Toaster does to render it, and records whether the page was busy when that timer ran.
 */
const sonner = vi.hoisted(() => {
  const busyWhenRendered: boolean[] = [];
  const isBusy = {current: () => false};
  const show = (id: string) => () => {
    setTimeout(() => busyWhenRendered.push(isBusy.current()), 0);
    return id;
  };
  const toast = Object.assign(vi.fn(show('plain')), {
    success: vi.fn(show('success')),
    error: vi.fn(show('error')),
    dismiss: vi.fn((id?: string | number) => id),
  });
  return {toast, busyWhenRendered, isBusy};
});

vi.mock('sonner', () => ({toast: sonner.toast}));

beforeEach(() => {
  vi.useFakeTimers();
  sonner.isBusy.current = pageBusy.isBusy;
  sonner.busyWhenRendered.length = 0;
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('toast', () => {
  it.each([
    ['toast', () => toast('Items Added', {description: 'Two items'}), sonner.toast, 'plain'],
    ['toast.success', () => toast.success('Image copied to clipboard'), sonner.toast.success, 'success'],
    ['toast.error', () => toast.error('Failed to copy image'), sonner.toast.error, 'error'],
  ] as const)('returns busy until the timer after the call runs when %s is called', (_name, call, mocked, id) => {
    expect(call()).toBe(id);
    expect(mocked).toHaveBeenCalledOnce();
    expect(pageBusy.isBusy()).toBe(true);
    vi.advanceTimersByTime(0);
    expect(pageBusy.isBusy()).toBe(false);
  });

  it('returns busy at the time sonner renders the toast when a toast is called', () => {
    toast('Items Added');
    vi.advanceTimersByTime(0);
    expect(sonner.busyWhenRendered).toEqual([true]);
    expect(pageBusy.isBusy()).toBe(false);
  });

  it('writes the title and options through to sonner when a toast is called', () => {
    const options = {description: 'Two items', id: 'tip-1'};
    toast('Items Added', options);
    toast.error('Could not open the file', options);
    expect(sonner.toast).toHaveBeenCalledWith('Items Added', options);
    expect(sonner.toast.error).toHaveBeenCalledWith('Could not open the file', options);
  });

  it('returns not busy when toast.dismiss is called', () => {
    expect(toast.dismiss('tip-1')).toBe('tip-1');
    expect(sonner.toast.dismiss).toHaveBeenCalledWith('tip-1');
    expect(pageBusy.isBusy()).toBe(false);
  });

  it('returns not busy after the timer when sonner throws', () => {
    sonner.toast.error.mockImplementationOnce(() => {
      throw new TypeError('probe');
    });
    expect(() => toast.error('Failed to copy image')).toThrow('probe');
    expect(pageBusy.isBusy()).toBe(true);
    vi.advanceTimersByTime(0);
    expect(pageBusy.isBusy()).toBe(false);
  });
});
