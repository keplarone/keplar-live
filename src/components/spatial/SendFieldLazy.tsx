"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { SEND_EVENT, type SendDetail } from "@/lib/spatial/events";

/**
 * Loads the send-burst scene (and three.js, ~136 KB over the wire) only when it is about to be needed: on a send, or once the person pauses after typing or pasting. Opening the app no longer downloads or parses it. A send that arrives before the chunk is in is replayed once it mounts.
 */
export function SendFieldLazy() {
  const [loaded, setLoaded] = useState<{ C: ComponentType<{ replay?: SendDetail }>; replay?: SendDetail } | null>(null);
  const replay = useRef<SendDetail | undefined>(undefined);
  useEffect(() => {
    let started = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      if (started) return;
      started = true;
      clearTimeout(timer);
      window.removeEventListener("keydown", warm);
      window.removeEventListener("paste", warm);
      void import("./SendField").then((m) => setLoaded({ C: m.SendField, replay: replay.current })).catch(() => {});
    };
    // typing must stay instant: a key only (re)starts a short timer, and the load happens once the person pauses (a send loads it straight away)
    const warm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
        if (ric) ric(load, { timeout: 2000 });
        else load();
      }, 700);
    };
    const onSend = (e: Event) => {
      if (!started) replay.current = (e as CustomEvent<SendDetail>).detail;
      load();
    };
    window.addEventListener("keydown", warm, { passive: true });
    window.addEventListener("paste", warm, { passive: true });
    window.addEventListener(SEND_EVENT, onSend);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", warm);
      window.removeEventListener("paste", warm);
      window.removeEventListener(SEND_EVENT, onSend);
    };
  }, []);
  return loaded ? <loaded.C replay={loaded.replay} /> : null;
}
