import {describe, expect, it, vi} from 'vitest';
import {createImageStatusStore} from '@/lib/images/imageStatusStore';

type State = {status: string; url?: string};

describe('createImageStatusStore', () => {
  it('writes one call to each listener whose key changed when setMany sets several keys', () => {
    const store = createImageStatusStore<State>();
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe('a', a);
    store.subscribe('b', b);

    store.setMany([['a', {status: 'ready', url: 'blob:1'}], ['c', {status: 'missing'}]]);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    expect(store.get('a')).toEqual({status: 'ready', url: 'blob:1'});
    expect(store.keys().sort()).toEqual(['a', 'c']);
  });

  it('returns the same state object, and calls no listener, when setMany sets an equal state', () => {
    const store = createImageStatusStore<State>();
    const listener = vi.fn();
    store.setMany([['a', {status: 'ready', url: 'blob:1'}]]);
    const first = store.get('a');
    store.subscribe('a', listener);
    store.setMany([['a', {status: 'ready', url: 'blob:1'}]]);
    expect(store.get('a')).toBe(first);
    expect(listener).not.toHaveBeenCalled();
    store.setMany([['a', {status: 'ready', url: 'blob:2'}]]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('returns undefined when setMany sets a key to undefined, and calls no listener after unsubscribe', () => {
    const store = createImageStatusStore<State>();
    const listener = vi.fn();
    const unsubscribe = store.subscribe('a', listener);
    store.setMany([['a', {status: 'loading'}]]);
    store.setMany([['a', undefined]]);
    expect(store.get('a')).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    store.setMany([['a', {status: 'ready'}]]);
    expect(listener).toHaveBeenCalledTimes(2);
    store.setMany([['missing', undefined]]);
  });
});
