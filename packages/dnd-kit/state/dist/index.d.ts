import { ReadonlySignal, effect } from '@preact/signals-core';
export { ReadonlySignal, Signal, batch, effect, signal, untracked } from '@preact/signals-core';

declare function computed<T>(compute: () => T, comparator?: (a: T, b: T) => boolean): ReadonlySignal<T>;

declare function deepEqual<T>(a: T, b: T): boolean;

declare function reactive<This, Value>({ get }: ClassAccessorDecoratorTarget<This, Value>, _: ClassAccessorDecoratorContext<This, Value>): ClassAccessorDecoratorResult<This, Value>;
declare function derived<This, Return>(target: (this: This) => Return, _: ClassGetterDecoratorContext<This, Return>): (this: This) => Return;
/**
 * Make a field enumerable (or non‑enumerable) on every instance.
 *
 *   @enumerable(true)  – enumerable
 *   @enumerable(false) – non‑enumerable
 */
declare function enumerable(enumerable?: boolean): (_value: unknown, context: ClassFieldDecoratorContext<any, any> | ClassGetterDecoratorContext<any, any> | ClassSetterDecoratorContext<any, any> | ClassAccessorDecoratorContext<any, any> | ClassMethodDecoratorContext<any, any>) => void;

type CleanupFunction = () => void;
type Effect = Parameters<typeof effect>[0];

declare function effects(...entries: Effect[]): CleanupFunction;

type WithHistory<T> = {
    current: T;
    initial: T;
    previous: T | undefined;
};
declare class ValueHistory<T> implements WithHistory<T> {
    #private;
    protected readonly defaultValue: T;
    protected readonly equals: (a: T, b: T) => boolean;
    constructor(defaultValue: T, equals?: (a: T, b: T) => boolean);
    /** Current value */
    get current(): T;
    /** Initial value */
    get initial(): T;
    /** Previous value */
    get previous(): T | undefined;
    /** Set the current value */
    set current(value: T);
    /** Reset the state to the initial value */
    reset(value?: T): void;
}

declare function snapshot<T extends object>(value: T): T;

declare class WeakStore<WeakKey extends object, Key extends string | number | symbol, Value extends Record<Key, any>> {
    #private;
    get(key: WeakKey | undefined, id: Key): Value | undefined;
    set(key: WeakKey | undefined, id: Key, value: Value): Map<Key, Value> | undefined;
    clear(key: WeakKey | undefined): void;
}

export { type CleanupFunction, type Effect, ValueHistory, WeakStore, type WithHistory, computed, deepEqual, derived, effects, enumerable, reactive, snapshot };
