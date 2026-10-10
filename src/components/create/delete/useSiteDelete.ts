"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { UNDO_MS } from "@/components/app-ui/delete/useChatDelete";

export type DeleteTarget = { id: string; name: string };
type Pending = { site: DeleteTarget; wasActive: boolean; timer: number };

/** One small JSON call; never throws (network trouble comes back as a message). */
async function call(path: string, method: "DELETE" | "POST", keepalive = false): Promise<{ ok: boolean; status: number; error: string }> {
  try {
    const res = await fetch(path, { method, keepalive, headers: { "content-type": "application/json" }, ...(method === "POST" ? { body: "{}" } : {}) });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: res.ok, status: res.status, error: data.error ?? (res.ok ? "" : `Request failed (${res.status})`) };
  } catch {
    return { ok: false, status: 0, error: "Couldn't reach Keplar. Check your connection." };
  }
}

/**
 * Delete a site with undo, the way chats work (same 6 s window, same toast), except the server hides the site at once:
 *  confirm  -> DELETE /api/sites/:id          (soft delete: gone from lists, 410 on its public address)
 *  undo     -> POST   /api/sites/:id/restore   (within the window)
 *  window ends, or the page is closing -> DELETE /api/sites/:id?purge=1 (removes the data for good; the server also sweeps leftovers)
 */
export function useSiteDelete(opts: {
  isActive: (id: string) => boolean;
  /** The server has hidden the site: drop it from the screen (and switch away if it was open). */
  onRemoved: (site: DeleteTarget, wasActive: boolean) => void | Promise<void>;
  /** Undo worked: show it again (and reopen it if it was open). */
  onRestored: (site: DeleteTarget, wasActive: boolean) => void | Promise<void>;
}) {
  const latest = useRef(opts);
  useEffect(() => { latest.current = opts; });
  const pending = useRef(new Map<string, Pending>());
  const [target, setTarget] = useState<DeleteTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: string; title: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const finish = useCallback((id: string, keepalive = false) => {
    const p = pending.current.get(id);
    if (!p) return;
    window.clearTimeout(p.timer);
    pending.current.delete(id);
    setToast((t) => (t && t.id === id ? null : t));
    void call(`/api/sites/${id}?purge=1`, "DELETE", keepalive); // a failure here is retried by the server's sweep; the site is already hidden
  }, []);

  const ask = useCallback((site: DeleteTarget) => { setError(null); setTarget(site); }, []);
  const cancel = useCallback(() => { if (!busy) { setTarget(null); setError(null); } }, [busy]);

  const confirm = useCallback(async () => {
    if (!target || busy) return;
    setBusy(true);
    setError(null);
    const r = await call(`/api/sites/${target.id}`, "DELETE");
    setBusy(false);
    if (!r.ok && r.status !== 404) { setError(r.error); return; } // 409 = a reason it can't be deleted yet; the dialog shows it
    const site = target;
    setTarget(null);
    for (const other of [...pending.current.keys()]) finish(other); // one undo at a time
    const wasActive = latest.current.isActive(site.id);
    const timer = window.setTimeout(() => finish(site.id), UNDO_MS);
    pending.current.set(site.id, { site, wasActive, timer });
    setToast({ id: site.id, title: site.name.length > 40 ? `${site.name.slice(0, 39)}…` : site.name });
    setNotice(null);
    await latest.current.onRemoved(site, wasActive);
  }, [target, busy, finish]);

  const undo = useCallback(async (id: string) => {
    const p = pending.current.get(id);
    if (!p) return;
    window.clearTimeout(p.timer);
    pending.current.delete(id);
    setToast((t) => (t && t.id === id ? null : t));
    const r = await call(`/api/sites/${id}/restore`, "POST");
    if (!r.ok) { setNotice(`Couldn't bring “${p.site.name}” back. ${r.error}`); return; }
    setNotice(`Restored “${p.site.name}”.`);
    await latest.current.onRestored(p.site, p.wasActive);
  }, []);

  // Leaving the page ends the undo window: finalize so nothing is left half-deleted (the server sweep is the backstop).
  useEffect(() => {
    const map = pending.current;
    const flush = () => { for (const id of [...map.keys()]) finish(id, true); };
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); };
  }, [finish]);

  return { target, busy, error, toast, notice, ask, cancel, confirm, undo };
}
