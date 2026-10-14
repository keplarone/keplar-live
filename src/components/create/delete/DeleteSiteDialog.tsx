"use client";
import { useEffect, useRef, useState } from "react";
import { UNDO_MS } from "@/components/app-ui/delete/useChatDelete";
import { IconTrash } from "@/components/app-ui/icons";
import { Button, Dialog, notify } from "@/components/kit";
import { removalSummary, UNDO_SECONDS, type RemovalImpact } from "@/lib/site-builder/deletion-copy";
import type { DeleteTarget } from "./useSiteDelete";
import cx from "./delete-site.module.css";

type Loaded = { impact: RemovalImpact; removed: string[]; kept: string[] };

/**
 * The confirm dialog (UI v2: the kit Dialog): names the site and lists what is removed and what is kept, with real counts from
 * the account. A native modal <dialog>: focus is trapped, Escape and the backdrop cancel (not while deleting), focus starts on
 * Cancel (the safe button) and returns to whatever opened it. Delete is disabled while something blocks it (the reason is shown).
 * The dialog element keeps role="alertdialog" and data-delete-site-dialog (e2e/site-delete).
 */
export function DeleteSiteDialog({ target, busy, error, blockedReason, onCancel, onConfirm }: {
  target: DeleteTarget | null; busy: boolean; error: string | null; blockedReason?: string | null; onCancel: () => void; onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [loaded, setLoaded] = useState<{ id: string; data: Loaded | null; failed: boolean } | null>(null);

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
    <Dialog
      open={Boolean(target)}
      onOpenChange={(open) => { if (!open && !busy) onCancel(); }}
      dismissible={!busy}
      title={target ? <>Delete “{target.name}”?</> : ""}
      initialFocus={cancelRef}
      className={cx.dialog}
      footer={<>
        <Button ref={cancelRef} variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant="danger" data-delete-site-yes="" onClick={onConfirm} loading={busy} disabled={(!ready && !mine?.failed) || Boolean(stop)}>{busy ? "Deleting…" : "Delete site"}</Button>
      </>}
    >
      {target ? (
        <div
          className={cx.body}
          // The kit Dialog owns the <dialog>; this names it as an alert dialog and gives e2e its hook.
          ref={(el) => { const d = el?.closest("dialog"); if (d) { d.setAttribute("role", "alertdialog"); d.setAttribute("data-delete-site-dialog", ""); } }}
        >
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
          {stop ? <p className={cx.blocked} role="alert">{stop}</p> : null}
          {error ? <p className={cx.err} role="alert">{error}</p> : null}
        </div>
      ) : null}
    </Dialog>
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

/**
 * "Deleted “name” · Undo" as a kit toast (notify, UI v2), open for the undo window, plus a polite live announcement of the outcome
 * of an undo. A new delete replaces the toast in place (one undo at a time).
 */
export function SiteUndo({ toast, notice, onUndo }: { toast: { id: string; title: string } | null; notice: string | null; onUndo: (id: string) => void }) {
  const undo = useRef(onUndo);
  useEffect(() => { undo.current = onUndo; });
  useEffect(() => {
    if (!toast) return;
    notify({ id: "site-undo", title: `Deleted “${toast.title}”`, duration: UNDO_MS, action: { label: "Undo", onClick: () => undo.current(toast.id) } });
  }, [toast]);
  return <p className="visually-hidden" role="status" aria-live="polite">{notice ?? ""}</p>;
}
