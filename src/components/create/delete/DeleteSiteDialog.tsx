"use client";
import { useEffect, useId, useRef, useState } from "react";
import { UndoToast } from "@/components/app-ui/delete/DeleteChat";
import { UNDO_MS } from "@/components/app-ui/delete/useChatDelete";
import { IconTrash } from "@/components/app-ui/icons";
import { removalSummary, UNDO_SECONDS, type RemovalImpact } from "@/lib/site-builder/deletion-copy";
import type { DeleteTarget } from "./useSiteDelete";
import cx from "./delete-site.module.css";
import { Presence } from "@/components/motion/usePresence";

type Loaded = { impact: RemovalImpact; removed: string[]; kept: string[] };

/**
 * The confirm dialog: names the site and lists what is removed and what is kept, with real counts from the account.
 * A native modal <dialog>: focus is trapped, Escape and the backdrop cancel, focus starts on Cancel (the safe button)
 * and returns to whatever opened it. Delete is disabled while something blocks it (the reason is shown).
 */
export function DeleteSiteDialog({ target, busy, error, blockedReason, onCancel, onConfirm }: {
  target: DeleteTarget | null; busy: boolean; error: string | null; blockedReason?: string | null; onCancel: () => void; onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const [loaded, setLoaded] = useState<{ id: string; data: Loaded | null; failed: boolean } | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (target && !d.open) d.showModal();
    if (!target && d.open) d.close();
  }, [target]);

  useEffect(() => {
    if (!target) return;
    let on = true;
    fetch(`/api/sites/${target.id}/removal`, { cache: "no-store" })
      .then(async (r) => { if (!r.ok) throw new Error(String(r.status)); return (await r.json()) as Loaded; })
      .then((data) => { if (on) setLoaded({ id: target.id, data, failed: false }); })
      .catch(() => { if (on) setLoaded({ id: target.id, data: null, failed: true }); });
    return () => { on = false; };
  }, [target]);

  const mine = target && loaded && loaded.id === target.id ? loaded : null;
  const data = mine?.data ?? null;
  const fallback = target ? removalSummary({ siteId: target.id, name: target.name, slug: "…", published: false, versions: 0, leads: 0, assets: 0, domains: [], libraryImages: 0, blockers: [] }) : null;
  const blockers = data?.impact.blockers ?? [];
  const stop = blockedReason ?? blockers[0]?.message ?? null;
  const ready = Boolean(data);

  return (
    <dialog
      ref={ref}
      className={cx.dialog}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descId}
      data-delete-site-dialog=""
      onCancel={(e) => { e.preventDefault(); if (!busy) onCancel(); }}
      onClick={(e) => { if (e.target === ref.current && !busy) onCancel(); }}
    >
      {target ? (
        <>
          <div className={cx.body}>
            <h2 id={titleId} className={cx.title}>Delete “{target.name}”?</h2>
            <div id={descId} className={cx.body} style={{ padding: 0, overflow: "visible" }}>
              {!mine ? <p className={cx.muted} role="status">Checking what this site contains…</p> : null}
              {mine?.failed ? <p className={cx.muted}>Couldn&rsquo;t load the details. Deleting still removes the draft, every version, the published page, uploaded images, the custom domain connection and form messages.</p> : null}
              {data || mine?.failed ? (
                <>
                  <p className={cx.h}>This removes</p>
                  <ul className={cx.list}>{(data?.removed ?? fallback?.removed ?? []).map((t) => <li key={t}>{t}</li>)}</ul>
                  <p className={cx.h}>This keeps</p>
                  <ul className={cx.list}>{(data?.kept ?? fallback?.kept ?? []).map((t) => <li key={t}>{t}</li>)}</ul>
                  {data && data.impact.leads > 0 ? <p className={cx.muted}><a className={cx.link} href={`/api/sites/${target.id}/leads?format=csv`}>Download the {data.impact.leads} message{data.impact.leads === 1 ? "" : "s"} as CSV</a> before you delete.</p> : null}
                  <p className={cx.muted}>You&rsquo;ll have about {UNDO_SECONDS} seconds to undo. After that it can&rsquo;t be brought back.</p>
                </>
              ) : null}
            </div>
            {stop ? <p className={cx.blocked} role="alert">{stop}</p> : null}
            {error ? <p className={cx.err} role="alert">{error}</p> : null}
          </div>
          <div className={cx.foot}>
            <button type="button" className={cx.btn} autoFocus onClick={onCancel} disabled={busy}>Cancel</button>
            <button type="button" className={`${cx.btn} ${cx.danger}`} data-delete-site-yes="" onClick={onConfirm} disabled={busy || (!ready && !mine?.failed) || Boolean(stop)}>{busy ? "Deleting…" : "Delete site"}</button>
          </div>
        </>
      ) : null}
    </dialog>
  );
}

/** The trash button on a list row. Its label names the site, so a screen reader hears which one. */
export function SiteTrash({ name, id, onClick, disabled }: { name: string; id: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={cx.trash} aria-label={`Delete site: ${name}`} title="Delete site" data-delete-site-for={id} disabled={disabled} onClick={onClick}>
      <IconTrash size={15} />
    </button>
  );
}

/** "Deleted “name” · Undo" plus a polite live announcement of the outcome of an undo. */
export function SiteUndo({ toast, notice, onUndo }: { toast: { id: string; title: string } | null; notice: string | null; onUndo: (id: string) => void }) {
  return (
    <>
      <Presence value={toast}>{(t, p) => <UndoToast key={t.id} title={t.title} ms={UNDO_MS} onUndo={() => onUndo(t.id)} motion={p.motion("toast")} />}</Presence>
      <p className="visually-hidden" role="status" aria-live="polite">{notice ?? ""}</p>
    </>
  );
}
