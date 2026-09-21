"use client";

import { useCallback, useSyncExternalStore } from "react";

type Listener = () => void;
const listeners = new Set<Listener>();

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * A localStorage-backed value read as an external store, not local React state synced via
 * a useEffect — the latter is exactly the "setState synchronously within an effect" shape
 * React's compiler lint rules flag, and useSyncExternalStore is the pattern they actually
 * want for state that originates outside React. getServerSnapshot returns defaultValue so
 * SSR and pre-hydration renders agree with each other; the real value appears right after
 * hydration, the same way it always would have via an effect, just without tripping the rule.
 */
export function usePersistentState<T>(key: string, defaultValue: T): [T, (value: T) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      try {
        const raw = window.localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : defaultValue;
      } catch {
        return defaultValue;
      }
    },
    () => defaultValue,
  );

  const setValue = useCallback((next: T) => {
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Best-effort persistence — a private tab just loses resume-on-refresh.
    }
    notify();
  }, [key]);

  return [value, setValue];
}
