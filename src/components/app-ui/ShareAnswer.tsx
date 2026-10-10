"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { KeplarAnswer } from "@/lib/orchestration/types";
import { growthTrack } from "@/lib/growth/client";
import s from "./ShareAnswer.module.css";
import { usePresence } from "@/components/motion/usePresence";

type LinkRow = { token: string; url: string; createdAt: string; expiresAt: string; views: number; hasQuestion: boolean; preview: string; public?: boolean; publicUrl?: string | null; canPublic?: boolean };
type View = "closed" | "confirm" | "made" | "signin";

const ShareIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12" />
    <path d="M7 8l5-5 5 5" />
    <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
  </svg>
);

/** What goes in a link: the written answer, agreement counts, the models consulted with their stance, the disagreements. Nothing else. */
const snapshot = (a: KeplarAnswer) => ({
  id: a.id,
  sourcing: a.sourcing,
  markdown: a.markdown,
  consensus: { level: a.consensus.level, agree: a.consensus.agree, disagree: a.consensus.disagree, responded: a.consensus.responded, consulted: a.consensus.consulted },
  models: a.models.map((m) => ({ name: m.name, provider: m.provider, slot: m.slot, status: m.status, stance: m.stance })),
  disagreements: a.disagreements,
  checks: a.verification.checks.filter((k) => k.kind !== "web").map((k) => ({ kind: k.kind, finding: k.finding, models: k.models, outcome: k.outcome, resolution: k.resolution })),
  reviewer: a.verification.mode === "cross-model" ? a.verification.reviewer : undefined,
});

export function ShareAnswer({ answer, triggerClass }: { answer: KeplarAnswer; triggerClass: string }) {
  const uid = useId();
  const [view, setView] = useState<View>("closed");
  const [question, setQuestion] = useState("");
  const [includeQuestion, setIncludeQuestion] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [made, setMade] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [pubOk, setPubOk] = useState(false);
  const [pubBusy, setPubBusy] = useState(false);
  const [pubErr, setPubErr] = useState("");
  const [pubCopied, setPubCopied] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLElement | null>(null);

  const loadLinks = async () => {
    const r = await fetch("/api/share", { cache: "no-store" }).catch(() => null);
    if (!r) return;
    if (r.status === 401) {
      setView("signin");
      return;
    }
    if (r.ok) setLinks(((await r.json()) as { links: LinkRow[] }).links);
  };

  const open = () => {
    // Prefill the question from the message just above this answer; the person sees and can edit or untick it.
    const turn = trigger.current?.closest("article")?.parentElement;
    const prev = turn?.previousElementSibling;
    setQuestion((prev?.querySelector("p")?.textContent ?? "").slice(0, 1500));
    setIncludeQuestion(true);
    setError("");
    setMade("");
    setCopied(false);
    setPubOk(false);
    setPubErr("");
    setView("confirm");
    growthTrack("share_dialog");
    void loadLinks();
  };
  // The dialog keeps showing its last step while it animates out (usePresence keeps it mounted until the exit ends).
  const dialog = usePresence(view !== "closed");
  const [lastView, setLastView] = useState<View>("confirm");
  if (view !== "closed" && view !== lastView) setLastView(view);
  const shown: View = view === "closed" ? lastView : view;
  const close = () => {
    setView("closed");
    trigger.current?.focus();
  };

  useEffect(() => {
    if (view === "closed") return;
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ consent: true, answer: snapshot(answer), question, includeQuestion }) });
      const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (r.status === 401) return setView("signin");
      if (!r.ok || !j.url) return setError(j.error ?? "Couldn't create the link. Please try again.");
      setMade(j.url);
      setView("made");
      growthTrack("share_created");
      growthTrack("answer_action", { action: "share" });
      void loadLinks();
    } catch {
      setError("Couldn't reach Keplar. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (token: string) => {
    const r = await fetch("/api/share", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => null);
    if (r?.ok) {
      setLinks((l) => l.filter((x) => x.token !== token));
      if (made.endsWith(token)) {
        setMade("");
        setView("confirm");
      }
    } else setError("Couldn't turn that link off. Try again.");
  };

  const madeToken = made.split("/").pop() ?? "";
  const madeRow = links.find((l) => l.token === madeToken);
  const setPublic = async (token: string, on: boolean) => {
    setPubBusy(true);
    setPubErr("");
    try {
      const r = await fetch("/api/share", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, public: on, ...(on ? { consent: true } : {}) }) });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) return setPubErr(j.error ?? "Couldn't change that. Please try again.");
      setPubOk(false);
      await loadLinks();
    } catch {
      setPubErr("Couldn't reach Keplar. Check your connection and try again.");
    } finally {
      setPubBusy(false);
    }
  };
  const copyPublic = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setPubCopied(true);
      window.setTimeout(() => setPubCopied(false), 1600);
    } catch {
      /* selectable */
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(made);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* the field is selectable */
    }
  };

  return (
    <>
      <button ref={trigger} type="button" className={triggerClass} onClick={open} aria-label="Share this answer" aria-haspopup="dialog">
        <ShareIcon />
      </button>
      {dialog.mounted ? (
        <div className={s.scrim} onMouseDown={(e) => e.target === e.currentTarget && close()} {...dialog.motion("fade")}>
          <div className={s.dialog} role="dialog" aria-modal="true" aria-labelledby={`${uid}-t`} {...dialog.motion("pop", false)}>
            <h2 id={`${uid}-t`} className={s.h}>{shown === "made" ? "Your link is ready" : "Share this answer"}</h2>

            {shown === "signin" ? (
              <>
                <p className={s.p}>Sign in to make a link. Links belong to your account so you can turn them off later.</p>
                <div className={s.row}>
                  <Link className={s.primary} style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }} href="/signin?next=/app" ref={(el) => { first.current = el; }}>Sign in</Link>
                  <button type="button" className={s.ghost} onClick={close}>Not now</button>
                </div>
              </>
            ) : null}

            {shown === "confirm" ? (
              <>
                <p className={s.p}>Nothing is shared until you press Create link. Anyone who has the link can open it, so share it only with people you trust.</p>
                <ul className={s.list}>
                  <li>Included: this answer, how many models agreed, the models consulted, where they disagreed, why the answer went the way it did, and the web source check if one ran.</li>
                  <li>Not included: your name, email, other chats, memory or files.</li>
                  <li>Not listed in search engines. Chat apps may show your question and how many models agreed as a preview card. You can turn it off at any time, and it expires after 90 days.</li>
                </ul>
                <label className={s.check}>
                  <input type="checkbox" checked={includeQuestion} onChange={(e) => setIncludeQuestion(e.target.checked)} ref={(el) => { first.current = el; }} />
                  <span>Include my question (edit it below, remove private details)</span>
                </label>
                {includeQuestion ? <textarea className={s.area} aria-label="Question shown on the shared page" maxLength={1500} value={question} onChange={(e) => setQuestion(e.target.value)} /> : null}
                {error ? <p className={s.err} role="alert">{error}</p> : null}
                <div className={s.row}>
                  <button type="button" className={s.primary} onClick={create} disabled={busy}>{busy ? "Creating…" : "Create link"}</button>
                  <button type="button" className={s.ghost} onClick={close}>Cancel</button>
                </div>
              </>
            ) : null}

            {shown === "made" ? (
              <>
                <input className={s.url} readOnly value={made} aria-label="Shared link" onFocus={(e) => e.currentTarget.select()} ref={(el) => { first.current = el; }} />
                <div className={s.row}>
                  <button type="button" className={s.primary} onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
                  <button type="button" className={s.ghost} onClick={() => revoke(made.split("/").pop() ?? "")}>Turn off this link</button>
                  <button type="button" className={s.ghost} onClick={close}>Done</button>
                </div>
                {error ? <p className={s.err} role="alert">{error}</p> : null}
                <div className={s.pub}>
                  <p className={s.p}><strong>Optional: make this a public page</strong></p>
                  {madeRow?.public && madeRow.publicUrl ? (
                    <>
                      <p className={s.p}>This answer is public. Search engines may index it, and it is listed on keplar.one/answers.</p>
                      <input className={s.url} readOnly value={madeRow.publicUrl} aria-label="Public page address" onFocus={(e) => e.currentTarget.select()} />
                      <div className={s.row}>
                        <button type="button" className={s.primary} onClick={() => copyPublic(madeRow.publicUrl!)}>{pubCopied ? "Copied" : "Copy public link"}</button>
                        <button type="button" className={s.ghost} onClick={() => setPublic(madeToken, false)} disabled={pubBusy}>Make private</button>
                      </div>
                    </>
                  ) : madeRow && !madeRow.canPublic ? (
                    <p className={s.p}>A public page needs your question as its title. Make a new link with your question included.</p>
                  ) : (
                    <>
                      <p className={s.p}>Your private link is not listed in search engines. A public page is: it gets its own address, a preview image, and may be found through Google or Bing. Your question and this answer will be visible to everyone, with no name or email. Keplar checks for emails, phone numbers, card numbers and keys, but you should re-read it yourself. You can make it private again at any time. Verified email required.</p>
                      <label className={s.check}>
                        <input type="checkbox" checked={pubOk} onChange={(e) => setPubOk(e.target.checked)} />
                        <span>I understand this page will be public and search engines may index it.</span>
                      </label>
                      <div className={s.row}>
                        <button type="button" className={s.ghost} onClick={() => setPublic(madeToken, true)} disabled={!pubOk || pubBusy || !madeRow}>{pubBusy ? "Working…" : "Make public"}</button>
                      </div>
                    </>
                  )}
                  {pubErr ? <p className={s.err} role="alert">{pubErr}</p> : null}
                </div>
              </>
            ) : null}

            {shown !== "signin" && links.length ? (
              <>
                <p className={s.p}>Your live links</p>
                <ul className={s.links}>
                  {links.slice(0, 6).map((l) => (
                    <li key={l.token}>
                      <span>{new Date(l.createdAt).toLocaleDateString()} · {l.views} {l.views === 1 ? "view" : "views"}{l.public ? " · Public" : ""}</span>
                      {l.public ? <button type="button" className={s.revoke} onClick={() => setPublic(l.token, false)}>Make private</button> : null}
                      <button type="button" className={s.revoke} onClick={() => revoke(l.token)}>Turn off</button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
