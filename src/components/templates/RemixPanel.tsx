"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import s from "./Templates.module.css";

/**
 * "Remix": copies the template into the signed-in user's workspace and opens Create on the copy with a prompt box to change it.
 * Credit is optional and off by default. What is copied (and what is not) is stated next to the button.
 */
export function RemixPanel({ slug, title, credit }: { slug: string; title: string; credit: string | null }) {
  const router = useRouter();
  const uid = useId();
  const [name, setName] = useState(title.slice(0, 60));
  const [credited, setCredited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; kind: "signin" | "plan" | "other" } | null>(null);

  async function remix() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/templates/${slug}/remix`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, credit: credited }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string; site?: { id: string } };
      if (res.status === 401) { setError({ text: "Sign in to remix this template into your workspace.", kind: "signin" }); return; }
      if (!res.ok || !j.site) { setError({ text: j.error || "Couldn't remix this template.", kind: res.status === 402 || res.status === 429 ? "plan" : "other" }); return; }
      try {
        sessionStorage.setItem("keplar:create-site", j.site.id);
        sessionStorage.setItem("keplar:create-remix", JSON.stringify({ siteId: j.site.id, title }));
      } catch { /* storage unavailable: Create opens on your latest site instead */ }
      router.push("/app/create");
    } catch {
      setError({ text: "Network problem. Check your connection and try again.", kind: "other" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={s.panel} onSubmit={(e) => { e.preventDefault(); void remix(); }} aria-labelledby={`${uid}-h`} data-testid="remix-panel">
      <h2 id={`${uid}-h`}>Remix this template</h2>
      <p className={s.meta}>Makes a copy in your workspace and opens Create so you can describe what to change. The original is never touched.</p>
      <label className={s.field}>
        <span>Name of your site</span>
        <input className={s.input} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label className={s.check}>
        <input type="checkbox" checked={credited} onChange={(e) => setCredited(e.target.checked)} />
        <span>Add a small “Based on this template{credit ? ` by ${credit}` : ""}” line to my home page. Optional; you can remove it any time.</span>
      </label>
      <ul className={s.copied} aria-label="What is copied">
        <li>Copied: pages, text, layout and styles.</li>
        <li>Not copied: the owner&apos;s form messages, CRM contacts, bookings, orders, members, analytics, chat history, uploaded photos, or contact links.</li>
        <li>Forms and other features in the copy are connected to your own inbox, not the owner&apos;s.</li>
      </ul>
      <button type="submit" className={s.btn} disabled={busy || !name.trim()}>{busy ? "Copying…" : "Remix and open in Create"}</button>
      <div aria-live="polite">
        {error ? (
          <p className={s.error} role="alert">
            {error.text}{" "}
            {error.kind === "signin" ? <Link className={s.link} href={`/signin?next=${encodeURIComponent(`/templates/${slug}`)}`}>Sign in</Link> : null}
            {error.kind === "plan" ? <Link className={s.link} href="/pricing">See plans</Link> : null}
          </p>
        ) : null}
      </div>
    </form>
  );
}
