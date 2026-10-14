"use client";

import { useSyncExternalStore } from "react";
import s from "./App.module.css";

const subscribe = (on: () => void) => {
  window.addEventListener("online", on);
  window.addEventListener("offline", on);
  return () => {
    window.removeEventListener("online", on);
    window.removeEventListener("offline", on);
  };
};

/**
 * The browser says it has no connection: one quiet line above the composer, so a message is not typed and sent into nothing.
 * It reads the browser's own online/offline state (nothing is polled or guessed) and disappears when the connection is back.
 */
export function OfflineNotice() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <p className={s.offline} role="status" data-offline="">
      <span className={s.offlineDot} aria-hidden="true" />
      You&rsquo;re offline. Your chats are safe; Keplar can answer again once the connection is back.
    </p>
  );
}
