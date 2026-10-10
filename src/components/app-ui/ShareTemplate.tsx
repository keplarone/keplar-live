"use client";
import { useId, useRef, useState } from "react";
import { CATEGORY_LABEL, TEMPLATE_CATEGORIES, TEMPLATE_TEXT, type TemplateCategory } from "@/lib/templates/constants";
import s from "./ShareAnswer.module.css";
import a from "./App.module.css";

export type MyTemplate = { slug: string; title: string; status: "live" | "pending" | "hidden"; sourceSiteId: string; url: string | null };

/**
 * "Share as template" for one site, and the state/withdraw control once it is shared. Explicit opt-in: a title, a description,
 * an optional name to show, and a consent checkbox that says exactly what becomes public.
 */
export function ShareTemplate({ siteId, siteName, existing, onChanged }: { siteId: string; siteName: string; existing: MyTemplate | null; onChanged: () => void }) {
  const uid = useId();
  const dlg = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(siteName.slice(0, TEMPLATE_TEXT.title.max));
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TemplateCategory>("business");
  const [credit, setCredit] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/templates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ siteId, title, description, category, credit, consent }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error || "Couldn't share this site.");
      dlg.current?.close();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't share this site.");
    } finally {
      setBusy(false);
    }
  }
  async function withdraw() {
    if (!existing) return;
    setBusy(true);
    try {
      await fetch("/api/templates", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug: existing.slug }) });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (existing) {
    return (
      <>
        <span className={a.textBtn} role="status" style={{ cursor: "default" }}>{existing.status === "live" ? "Shared as template" : existing.status === "pending" ? "Template awaiting review" : "Template hidden by Keplar"}</span>
        {existing.url ? <a className={a.textBtn} href={existing.url} target="_blank" rel="noreferrer">View</a> : null}
        <button type="button" className={a.textBtn} disabled={busy} onClick={() => void withdraw()}>Withdraw template</button>
      </>
    );
  }
  return (
    <>
      <button type="button" className={a.textBtn} aria-haspopup="dialog" title="Let others remix a copy of this site (beta)" onClick={() => { setError(""); dlg.current?.showModal(); }}>Share as template</button>
      <dialog ref={dlg} className={s.dialog} aria-labelledby={`${uid}-t`} data-testid="share-template-dialog" onClick={(e) => { if (e.target === e.currentTarget) dlg.current?.close(); }}>
        <button type="button" className={s.x} aria-label="Close" onClick={() => dlg.current?.close()}>×</button>
        <h2 id={`${uid}-t`} className={s.h}>Share “{siteName}” as a template <span className="visually-hidden">(beta)</span></h2>
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} style={{ display: "grid", gap: "var(--s-4)" }}>
          <p className={s.p}>Beta. Anyone can remix a copy of your latest version into their own workspace. We copy pages, text, layout and styles only. Your form messages, contacts, bookings, orders, members, analytics, chat history, uploaded photos and contact links are never shared. You can withdraw it at any time; deleting the site removes it too.</p>
          <label className={s.p} style={{ display: "grid", gap: "var(--s-2)" }}>
            <span>Title</span>
            <input className={s.url} value={title} minLength={TEMPLATE_TEXT.title.min} maxLength={TEMPLATE_TEXT.title.max} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label className={s.p} style={{ display: "grid", gap: "var(--s-2)" }}>
            <span>What is it, and who is it for? ({TEMPLATE_TEXT.description.min}+ characters)</span>
            <textarea className={s.area} value={description} minLength={TEMPLATE_TEXT.description.min} maxLength={TEMPLATE_TEXT.description.max} onChange={(e) => setDescription(e.target.value)} required />
          </label>
          <label className={s.p} style={{ display: "grid", gap: "var(--s-2)" }}>
            <span>Category</span>
            <select className={s.url} value={category} onChange={(e) => setCategory(e.target.value as TemplateCategory)}>
              {TEMPLATE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
          </label>
          <label className={s.p} style={{ display: "grid", gap: "var(--s-2)" }}>
            <span>Name to show (optional; blank = no name shown)</span>
            <input className={s.url} value={credit} maxLength={TEMPLATE_TEXT.credit.max} onChange={(e) => setCredit(e.target.value)} />
          </label>
          <label className={s.check}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>I want this site&apos;s pages to be public in the template gallery and copyable by anyone. I own the content and have the right to share it.</span>
          </label>
          {error ? <p className={s.err} role="alert">{error}</p> : null}
          <div className={s.row}>
            <button type="submit" className={s.primary} disabled={busy || !consent}>{busy ? "Checking…" : "Share template"}</button>
            <button type="button" className={s.ghost} onClick={() => dlg.current?.close()}>Cancel</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
