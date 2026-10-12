"use client";
import { useSyncExternalStore } from "react";
import { PREF_DEFAULTS, PREFS_EVENT, PREFS_KEY, applyPrefs, readPrefs, type Prefs } from "./prefs";

function subscribe(cb: () => void) {
  // Another tab changed a pref: repaint this one too.
  const onStorage = (e: StorageEvent) => { if (e.key === PREFS_KEY) { applyPrefs(readPrefs()); cb(); } };
  window.addEventListener(PREFS_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(PREFS_EVENT, cb); window.removeEventListener("storage", onStorage); };
}

/** Live device prefs in a client component. The server (and the first hydration pass) see the defaults. */
export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, readPrefs, () => PREF_DEFAULTS);
}
