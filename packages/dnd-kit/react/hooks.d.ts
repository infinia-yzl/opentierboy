import * as react from 'react';
import { EffectCallback, DependencyList, useLayoutEffect, useEffect, RefObject, MutableRefObject } from 'react';

declare function useConstant<T = any>(initializer: () => T): T;

declare function useComputed<T = any>(compute: () => T, dependencies?: any[], sync?: boolean): {
    readonly value: T;
};

/** Trigger a re-render when reading signal properties of an object. */
declare function useDeepSignal<T extends object | null | undefined>(target: T, synchronous?: (property: keyof T, oldValue: any, newValue: any) => boolean): T;

declare function useImmediateEffect(callback: EffectCallback, _?: DependencyList): void;

/**
 * A hook that resolves to useEffect on the server and useLayoutEffect on the client
 * @param callback {function} Callback function that is invoked when the dependencies of the hook change
 */
declare const useIsomorphicLayoutEffect: typeof useLayoutEffect;

declare function useLatest<T>(value: T): react.RefObject<T | undefined>;

declare function useOnValueChange<T>(value: T, onChange: (value: T, oldValue: T) => void, effect?: typeof useEffect, compare?: (value1: any, value2: any) => boolean): void;

type Ref<T> = RefObject<T | null | undefined> | MutableRefObject<T>;
type RefOrValue<T> = T | Ref<T> | null | undefined;

declare function useOnElementChange(value: RefOrValue<Element>, onChange: (value: Element | undefined) => void): void;

export { useComputed, useConstant, useDeepSignal, useImmediateEffect, useIsomorphicLayoutEffect, useLatest, useOnElementChange, useOnValueChange };
