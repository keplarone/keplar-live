"use client";
import { useEffect, useState } from "react";
import s from "./Templates.module.css";

/** Community template like toggle. Signed-out visitors are sent to sign in. */
export function LikeButton({ slug, initial }: { slug: string; initial: number }) {
  const [likes, setLikes] = useState(initial);
  const [liked, setLiked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    let on = true;
    fetch(`/api/templates/${encodeURIComponent(slug)}/like`).then((r) => r.json()).then((j: { liked?: boolean }) => on && setLiked(Boolean(j.liked))).catch(() => undefined);
    return () => { on = false; };
  }, [slug]);
  const toggle = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(`/api/templates/${encodeURIComponent(slug)}/like`, { method: "POST", headers: { "content-type": "application/json" } });
      if (r.status === 401) { window.location.href = `/signin?next=${encodeURIComponent(`/templates/${slug}`)}`; return; }
      const j = (await r.json()) as { likes?: number; liked?: boolean; error?: string };
      if (!r.ok) throw new Error(j.error || "Could not save your like.");
      setLikes(j.likes ?? likes);
      setLiked(Boolean(j.liked));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button type="button" className={s.chip} aria-pressed={liked} onClick={toggle} disabled={busy} style={{ cursor: "pointer", fontWeight: liked ? 600 : 400 }}>
        {liked ? "Liked" : "Like"} · {likes}
      </button>
      {err ? <span role="alert" style={{ fontSize: 12, color: "var(--c-err)" }}>{err}</span> : null}
    </span>
  );
}
