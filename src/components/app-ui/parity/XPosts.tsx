"use client";

import { useEffect, useState } from "react";
import { xQueryFrom, type XPost } from "@/lib/providers/x-posts";
import { activeScopeHeaders } from "../state/scope";
import { openDraft } from "./draft-bus";
import { familyOn } from "./family-client";
import { Button } from "@/components/kit";
import s from "./parity.module.css";

let availability: Promise<boolean> | null = null;
/** One check per page load: are Posts on X switched on for this person? */
function xAvailable(): Promise<boolean> {
  availability ??= fetch("/api/x/search", { cache: "no-store", headers: activeScopeHeaders() })
    .then((r) => (r.ok ? (r.json() as Promise<{ available: boolean }>) : { available: false }))
    .then((d) => Boolean(d.available))
    .catch(() => false);
  return availability;
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

/** Under an answer: what people are posting on X about it right now. Public posts, shown as-is and not checked by the panel. */
export function XPostsTool({ question, signedIn }: { question: string; signedIn: boolean }) {
  const [on, setOn] = useState(false);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(() => xQueryFrom(question));
  const [busy, setBusy] = useState(false);
  const [posts, setPosts] = useState<XPost[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!signedIn) return;
    let off = false;
    void Promise.all([xAvailable(), familyOn()]).then(([v, fam]) => { if (!off) setOn(v && !fam); });
    return () => { off = true; };
  }, [signedIn]);
  if (!on) return null;

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/x/search", { method: "POST", headers: { ...activeScopeHeaders(), "content-type": "application/json" }, body: JSON.stringify({ query: q }) });
      const d = (await r.json()) as { posts?: XPost[]; error?: string };
      if (!r.ok) throw new Error(d.error || "Couldn't search X.");
      setPosts(d.posts ?? []);
    } catch (er) { setErr((er as Error).message); setPosts(null); } finally { setBusy(false); }
  };
  const toDraft = () => openDraft({ kind: "open", title: `Posts on X: ${q}`.slice(0, 60), markdown: [`Public posts on X for "${q}" (not checked by Keplar's panel):`, ...(posts ?? []).map((p) => `- ${p.author ? `@${p.author.handle}` : "Unknown"} (${when(p.createdAt)}): ${p.text.replace(/\s+/g, " ")} ${p.url}`)].join("\n") });

  if (!open) return <Button size="sm" variant="ghost" className={s.quiet} onClick={() => { setOpen(true); void search(); }} data-x-posts="">Posts on X</Button>;
  return (
    <section className={`${s.runOut} ${s.xPanel}`} aria-label="Posts on X" data-x-posts-panel="">
      <form className={s.row} onSubmit={(e) => { e.preventDefault(); if (!busy && q.trim().length >= 2) void search(); }}>
        <input className={s.input} value={q} onChange={(e) => setQ(e.target.value)} maxLength={256} aria-label="Search posts on X" />
        <Button type="submit" size="sm" variant="secondary" disabled={q.trim().length < 2} loading={busy}>{busy ? "Searching..." : "Search"}</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
      </form>
      <p className={s.muted}>Recent public posts, shown as written. Keplar&rsquo;s panel hasn&rsquo;t checked them.</p>
      {err ? <p className={s.muted} role="alert">{err}</p> : null}
      {posts && !posts.length ? <p className={s.muted}>No recent posts matched. Try fewer words.</p> : null}
      {posts?.length ? (
        <ul className={s.steps} role="list">
          {posts.map((p) => (
            <li key={p.id}>
              <strong>{p.author ? `@${p.author.handle}` : "Unknown"}</strong> <span className={s.muted}>{when(p.createdAt)}{p.metrics ? ` · ${p.metrics.likes} likes · ${p.metrics.reposts} reposts` : ""}</span>
              <div>{p.text}</div>
              <a href={p.url} target="_blank" rel="noopener noreferrer nofollow">View on X</a>
            </li>
          ))}
        </ul>
      ) : null}
      {posts?.length ? <div className={s.row}><Button size="sm" variant="secondary" onClick={toDraft}>Open as draft to check with Keplar</Button></div> : null}
    </section>
  );
}
