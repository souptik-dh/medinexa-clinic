import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Shared loading/action-state primitives for the portal.
 *
 * - `useAsyncAction`  → one button/form (isSubmitting, isDeleting, isUploading…)
 * - `useKeyedAction`  → repeated rows/cards, each with its own pending state
 * - `useLatestRequest`→ GET/search/filter requests where only the newest
 *                       response may update the UI
 *
 * Mutations are locked with a ref *synchronously*, so a double-click, rapid
 * clicks or a repeated Enter key can never fire the same request twice even
 * before React re-renders the disabled button. The lock is always released in
 * `finally`, so a failed request never leaves an action permanently disabled.
 */

/**
 * Guards a single async action. `run` returns `undefined` (and does nothing)
 * when the action is already in flight; otherwise it returns the callback's
 * result. Errors are re-thrown so callers keep their existing catch/toast flow.
 */
export function useAsyncAction() {
  const lock = useRef(false);
  const mounted = useMounted();
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
      if (lock.current) return undefined;
      lock.current = true;
      setPending(true);
      try {
        return await fn();
      } finally {
        lock.current = false;
        if (mounted.current) setPending(false);
      }
    },
    [mounted]
  );

  return useMemo(() => ({ pending, run }), [pending, run]);
}

/**
 * Row-level action state: every key (row id, or `${id}:${action}`) gets its
 * own lock, so deleting one row never disables the buttons of another.
 */
export function useKeyedAction<K extends string | number = string>() {
  const locks = useRef<Set<K>>(new Set());
  const mounted = useMounted();
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<K>>(() => new Set());

  const run = useCallback(
    async <T>(key: K, fn: () => Promise<T>): Promise<T | undefined> => {
      if (locks.current.has(key)) return undefined;
      locks.current.add(key);
      setPendingKeys(new Set(locks.current));
      try {
        return await fn();
      } finally {
        locks.current.delete(key);
        if (mounted.current) setPendingKeys(new Set(locks.current));
      }
    },
    [mounted]
  );

  const isPending = useCallback((key: K) => pendingKeys.has(key), [pendingKeys]);

  // Memoized so the returned object is safe to use as a hook dependency.
  return useMemo(
    () => ({ run, isPending, anyPending: pendingKeys.size > 0, pendingKeys }),
    [run, isPending, pendingKeys]
  );
}

/**
 * Drops out-of-order responses for search/filter/pagination GETs: call
 * `begin()` before each request and only apply the result when
 * `isLatest(token)` is still true, so a slow older request can never
 * overwrite newer results.
 */
export function useLatestRequest() {
  const seq = useRef(0);
  const begin = useCallback(() => ++seq.current, []);
  const isLatest = useCallback((token: number) => token === seq.current, []);
  return useMemo(() => ({ begin, isLatest }), [begin, isLatest]);
}

function useMounted() {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}
