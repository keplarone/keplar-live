"use client";
import { useState } from "react";
import { CATEGORY_LABEL, TEMPLATE_CATEGORIES, TEMPLATE_TEXT, type TemplateCategory } from "@/lib/templates/constants";
import { Button, Dialog, Tooltip } from "@/components/kit";
import s from "./ShareAnswer.module.css";
import la from "./link-action.module.css";

export type MyTemplate = { slug: string; title: string; status: "live" | "pending" | "hidden"; sourceSiteId: string; url: string | null };

/**
 * "Share as template" for one site, and the state/withdraw control once it is shared. Explicit opt-in: a title, a description,
 * an optional name to show, and a consent checkbox that says exactly what becomes public. The form is a kit Dialog.
 */
export function ShareTemplate({ siteId, siteName, existing, onChanged }: { siteId: string; siteName: string; existing: MyTemplate | null; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
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
      setOpen(false);
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
        <span className={s.state} role="status">{existing.status === "live" ? "Shared as template" : existing.status === "pending" ? "Template awaiting review" : "Template hidden by Keplar"}</span>
        {existing.url ? <a className={la.act} data-variant="ghost" data-size="sm" href={existing.url} target="_blank" rel="noreferrer">View</a> : null}
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void withdraw()}>Withdraw template</Button>
      </>
    );
  }
  return (
    <>
      <Tooltip content="Let others remix a copy of this site (beta)">
        <Button size="sm" variant="ghost" aria-haspopup="dialog" onClick={() => { setError(""); setOpen(true); }}>Share as template</Button>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen} size="lg" title={<>Share “{siteName}” as a template <span className="visually-hidden">(beta)</span></>}>
        <form className={s.body} data-testid="share-template-dialog" onSubmit={(e) => { e.preventDefault(); if (consent && !busy) void submit(); }}>
          <p className={s.p}>Beta. Anyone can remix a copy of your latest version into their own workspace. We copy pages, text, layout and styles only. Your form messages, contacts, bookings, orders, members, analytics, chat history, uploaded photos and contact links are never shared. You can withdraw it at any time; deleting the site removes it too.</p>
          <label className={`${s.p} ${s.field}`}>
            <span>Title</span>
            <input className={s.url} value={title} minLength={TEMPLATE_TEXT.title.min} maxLength={TEMPLATE_TEXT.title.max} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label className={`${s.p} ${s.field}`}>
            <span>What is it, and who is it for? ({TEMPLATE_TEXT.description.min}+ characters)</span>
            <textarea className={s.area} value={description} minLength={TEMPLATE_TEXT.description.min} maxLength={TEMPLATE_TEXT.description.max} onChange={(e) => setDescription(e.target.value)} required />
          </label>
          <label className={`${s.p} ${s.field}`}>
            <span>Category</span>
            <select className={s.url} value={category} onChange={(e) => setCategory(e.target.value as TemplateCategory)}>
              {TEMPLATE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
          </label>
          <label className={`${s.p} ${s.field}`}>
            <span>Name to show (optional; blank = no name shown)</span>
            <input className={s.url} value={credit} maxLength={TEMPLATE_TEXT.credit.max} onChange={(e) => setCredit(e.target.value)} />
          </label>
          <label className={s.check}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>I want this site&apos;s pages to be public in the template gallery and copyable by anyone. I own the content and have the right to share it.</span>
          </label>
          {error ? <p className={s.err} role="alert">{error}</p> : null}
          <div className={s.row}>
            <Button type="submit" variant="primary" disabled={!consent} loading={busy}>{busy ? "Checking…" : "Share template"}</Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
