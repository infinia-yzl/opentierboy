import { RefObject, MutableRefObject } from 'react';

type Ref<T> = RefObject<T | null | undefined> | MutableRefObject<T>;
type RefOrValue<T> = T | Ref<T> | null | undefined;
declare function currentValue<T>(value: RefOrValue<T>): NonNullable<T> | undefined;

export { type RefOrValue, currentValue };
