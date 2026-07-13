import {useCallback, useRef} from 'react';

/** Stable-identity wrapper that always calls the latest fn — lets memoized
 * children (Sidebar) skip re-renders without stale-closure bugs. */
export function useEvent<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
    const ref = useRef(fn);
    ref.current = fn;
    return useCallback((...args: A) => ref.current(...args), []);
}
