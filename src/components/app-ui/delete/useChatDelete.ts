"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Thread } from "../state/types";

/** How long a deleted chat can still be brought back. After this the server copy is deleted for good. */
export const UNDO_MS = 6000;

type Pending = { thread: Thread; wasActive: boolean; timer: number };

/**
 * Optimistic delete with undo. `request` removes the chat from the screen right away and starts the undo window;
 * `undo` puts it back untouched (nothing was sent to the server); when the window ends (or the page is closing) `commit` deletes it for good.
 */
export function useChatDelete(opts: {
  threads: Thread[];
  activeId: string | null;
  drop: (id: string) => void;
  restore: (thread: Thread, open: boolean) => void;
  commit: (id: string, keepalive?: boolean) => void;
}) {
  const { drop, restore, commit } = opts;
  const latest = useRef(opts);
  useEffect(() => { latest.current = opts; });
  const pending = useRef(new Map<string, Pending>());
  const [toast, setToast] = useState<{ id: string; title: string } | null>(null);

  const finish = useCallback((id: string, keepalive = false) => {
    const p = pending.current.get(id);
    if (!p) return;
    window.clearTimeout(p.timer);
    pending.current.delete(id);
    commit(id, keepalive);
    setToast((t) => (t && t.id === id ? null : t));
  }, [commit]);

  const request = useCallback((id: string) => {
    const { threads, activeId } = latest.current;
    const thread = threads.find((t) => t.id === id);
    if (!thread) return;
    // One undo at a time: an earlier delete becomes permanent as soon as the next one starts.
    for (const other of [...pending.current.keys()]) finish(other);
    drop(id);
    const timer = window.setTimeout(() => finish(id), UNDO_MS);
    pending.current.set(id, { thread, wasActive: activeId === id, timer });
    setToast({ id, title: thread.title.length > 40 ? `${thread.title.slice(0, 39)}…` : thread.title });
  }, [drop, finish]);

  const undo = useCallback((id: string) => {
    const p = pending.current.get(id);
    if (p) {
      window.clearTimeout(p.timer);
      pending.current.delete(id);
      restore(p.thread, p.wasActive);
    }
    setToast((t) => (t && t.id === id ? null : t));
  }, [restore]);

  // Closing or leaving the page ends the undo window: finish the deletes so they are not lost.
  useEffect(() => {
    const flush = () => { for (const id of [...pending.current.keys()]) finish(id, true); };
    window.addEventListener("pagehide", flush);
    const map = pending.current;
    return () => {
      window.removeEventListener("pagehide", flush);
      for (const id of [...map.keys()]) finish(id, true);
    };
  }, [finish]);

  return { toast, request, undo };
}
