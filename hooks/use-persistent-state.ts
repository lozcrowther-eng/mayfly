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

// useSyncExternalStore requires getSnapshot to return the SAME reference across calls when
// nothing has changed — JSON.parse allocates a fresh object every call, so without this
// cache React sees a "new" snapshot on every render and re-renders forever (the exact
// "Maximum update depth exceeded" loop this was hit by). Keyed per storage key so unrelated
// ChallengeCards (different team/challenge) never share a cached value.
const snapshotCache = new Map<string, { raw: string | null; value: unknown }>();

function readSnapshot<T>(key: string, defaultValue: T): T {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    raw = null;
  }

  const cached = snapshotCache.get(key);
  if (cached && cached.raw === raw) {
    return cached.value as T;
  }

  let value: T;
  try {
    value = raw ? (JSON.parse(raw) as T) : defaultValue;
  } catch {
    value = defaultValue;
  }

  snapshotCache.set(key, { raw, value });
  return value;
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
    () => readSnapshot(key, defaultValue),
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
