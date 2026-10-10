"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePlan } from "@/components/billing/usePlan";
import { canUseSlides, slidesLimitsFor } from "@/lib/tools/limits";
import { estimateDeckCredits, estimateSlideCredits } from "@/lib/slides/estimate";
import { STYLES, THEMES, type Deck, type DeckStyle, type DeckTheme, type Slide } from "@/lib/slides/types";
import { SlideView } from "./SlideView";
import { Present } from "./Present";
import { SLIDES_OPEN_KEY, takeHandoff } from "@/components/app-ui/studio/handoff";
import s from "./slides.module.css";

type DeckRow = { id: string; title: string; topic: string; theme: DeckTheme; slides: number; updatedAt: string };
type ApiError = { error?: string; code?: string };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const data = (await res.json().catch(() => ({}))) as T & ApiError;
  if (!res.ok) throw Object.assign(new Error(data.error ?? "Something went wrong."), { status: res.status, code: data.code });
  return data;
}

/** What Free and signed-out visitors see. The server refuses them too (401 / 403 on every /api/slides route). */
export function SlidesLocked({ signedIn }: { signedIn: boolean }) {
  return (
    <section className={s.locked} aria-labelledby="sl-locked">
      <span className={s.lockIcon} aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3.25" y="7" width="9.5" height="6.25" rx="1.5" /><path d="M5.25 7V5.25a2.75 2.75 0 0 1 5.5 0V7" /></svg>
      </span>
      <h2 id="sl-locked" className={s.lockedTitle}>Slideshow creator</h2>
      <p className={s.lockedBody}>
        Turn a topic, an outline or your notes into a finished deck, with speaker notes and image ideas, then edit it, present it and export it to PowerPoint or PDF.
        It is part of Keplar Plus and Pro.
      </p>
      <div className={s.lockedActions}>
        <Link href="/checkout?plan=plus" className={s.primary} data-upgrade="slides">Upgrade to Plus</Link>
        {!signedIn ? <Link href="/signin?next=/app/slides" className={s.ghost}>Sign in</Link> : null}
        <Link href="/pricing" className={s.ghost}>See plans</Link>
      </div>
    </section>
  );
}

export function SlidesStudio() {
  const me = usePlan();
  if (!me.ready) return <div className={s.studio} aria-busy="true" />;
  if (!me.signedIn || !canUseSlides(me.plan)) return <div className={s.studio}><SlidesLocked signedIn={me.signedIn} /></div>;
  return <Unlocked plan={me.plan as "plus" | "pro" | "business"} />;
}

function Unlocked({ plan }: { plan: "plus" | "pro" | "business" }) {
  const L = slidesLimitsFor(plan)!;
  const [rows, setRows] = useState<DeckRow[]>([]);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [sel, setSel] = useState(0);
  const [present, setPresent] = useState<number | null>(null);
  const [busy, setBusy] = useState<null | "gen" | "regen">(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [credits, setCredits] = useState<number | null>(null);
  // form
  const [topic, setTopic] = useState("");
  const [outline, setOutline] = useState("");
  const [material, setMaterial] = useState("");
  const [fileName, setFileName] = useState("");
  const [count, setCount] = useState(8);
  const [style, setStyle] = useState<DeckStyle>("clean");
  const [theme, setTheme] = useState<DeckTheme>("dark");
  const [instruction, setInstruction] = useState("");
  const timer = useRef<number | undefined>(undefined);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setRows((await api<{ decks: DeckRow[] }>("/api/slides/decks")).decks);
    } catch { /* the list is optional */ }
  }, []);
  useEffect(() => {
    let on = true;
    api<{ decks: DeckRow[] }>("/api/slides/decks").then((r) => on && setRows(r.decks)).catch(() => undefined);
    return () => { on = false; };
  }, []);
  // "Open in Slides" (or a slide picked) on a chat card: open that deck at that slide, once.
  useEffect(() => {
    const h = takeHandoff<{ id?: string; slide?: number }>(SLIDES_OPEN_KEY);
    if (!h?.id) return;
    api<{ deck: Deck }>(`/api/slides/decks/${h.id}`)
      .then((r) => { setDeck(r.deck); setSel(Math.max(0, Math.min(h.slide ?? 0, r.deck.slides.length - 1))); })
      .catch((e: Error) => setError(e.message));
  }, []);

  const est = estimateDeckCredits(plan, topic.length + outline.length + material.length, count);

  const generate = async () => {
    setError(""); setBusy("gen"); setCredits(null);
    try {
      const r = await api<{ deck: Deck; credits: number }>("/api/slides/decks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic, outline, material, count, style, theme }) });
      setDeck(r.deck); setSel(0); setCredits(r.credits); void refresh();
      window.dispatchEvent(new Event("focus")); // refresh the Usage meter
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(null); }
  };

  const open = async (id: string) => {
    setError("");
    try { const r = await api<{ deck: Deck }>(`/api/slides/decks/${id}`); setDeck(r.deck); setSel(0); setCredits(null); } catch (e) { setError((e as Error).message); }
  };

  const del = async (id: string) => {
    if (!window.confirm("Delete this deck? This can't be undone.")) return;
    try { await api(`/api/slides/decks/${id}`, { method: "DELETE" }); if (deck?.id === id) setDeck(null); void refresh(); } catch (e) { setError((e as Error).message); }
  };

  /** Edits are saved a moment after the last change (no model, no cost). */
  const edit = (next: Deck) => {
    setDeck(next); setSaved("saving");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        await api(`/api/slides/decks/${next.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: next.title, theme: next.theme, slides: next.slides }) });
        setSaved("saved"); void refresh();
      } catch (e) { setError((e as Error).message); setSaved("idle"); }
    }, 700);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const patchSlide = (i: number, p: Partial<Slide>) => deck && edit({ ...deck, slides: deck.slides.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const move = (i: number, d: number) => {
    if (!deck) return;
    const j = i + d;
    if (j < 0 || j >= deck.slides.length) return;
    const slides = [...deck.slides];
    [slides[i], slides[j]] = [slides[j], slides[i]];
    edit({ ...deck, slides }); setSel(j);
  };
  const removeSlide = (i: number) => {
    if (!deck || deck.slides.length <= 1) return;
    edit({ ...deck, slides: deck.slides.filter((_, j) => j !== i) }); setSel(Math.max(0, i - 1));
  };
  const addSlide = () => {
    if (!deck || deck.slides.length >= L.maxSlides) return;
    const slide: Slide = { id: `sl_${Math.random().toString(36).slice(2, 10)}`, layout: "content", title: "New slide", section: deck.slides[sel]?.section ?? "", bullets: ["Add your point"], notes: "", imagePrompt: "" };
    const slides = [...deck.slides.slice(0, sel + 1), slide, ...deck.slides.slice(sel + 1)];
    edit({ ...deck, slides }); setSel(sel + 1);
  };

  const regen = async () => {
    if (!deck) return;
    setError(""); setBusy("regen");
    try {
      window.clearTimeout(timer.current);
      await api(`/api/slides/decks/${deck.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: deck.title, theme: deck.theme, slides: deck.slides }) });
      const r = await api<{ deck: Deck; credits: number }>(`/api/slides/decks/${deck.id}/regenerate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ index: sel, instruction }) });
      setDeck(r.deck); setCredits(r.credits); setInstruction("");
      window.dispatchEvent(new Event("focus"));
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError("");
    const fd = new FormData();
    fd.append("file", f);
    try {
      const r = await api<{ name: string; text: string }>("/api/slides/extract", { method: "POST", body: fd });
      setMaterial(r.text); setFileName(r.name);
    } catch (e) { setError((e as Error).message); }
    if (fileRef.current) fileRef.current.value = "";
  };

  const slide = deck?.slides[sel];

  return (
    <div className={s.studio}>
      <header className={s.head}>
        <div>
          <h1 className={s.title}>Slides</h1>
          <p className={s.lede}>Describe the talk. Keplar writes the deck, you edit it, present it and export it.</p>
        </div>
        {deck ? <button type="button" className={s.ghost} onClick={() => { setDeck(null); setCredits(null); }}>New deck</button> : null}
      </header>

      {error ? <p className={s.error} role="alert">{error}</p> : null}

      {!deck ? (
        <div className={s.grid}>
          <form className={s.card} onSubmit={(e) => { e.preventDefault(); void generate(); }}>
            <label className={s.field}>
              <span className={s.label}>Topic</span>
              <input className={s.input} value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} placeholder="e.g. How vaccines train the immune system" required />
            </label>
            <label className={s.field}>
              <span className={s.label}>Outline or notes <em>(optional)</em></span>
              <textarea className={s.input} rows={5} value={outline} onChange={(e) => setOutline(e.target.value)} maxLength={6000} placeholder="Points you want covered, in your own words." />
            </label>
            <div className={s.field}>
              <span className={s.label}>Source file <em>(optional · PDF, .txt or .md)</em></span>
              <div className={s.fileRow}>
                <input ref={fileRef} id="sl-file" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" className={s.fileInput} onChange={(e) => void onFile(e.target.files?.[0])} />
                <label htmlFor="sl-file" className={s.ghost}>Attach file</label>
                {fileName ? <span className={s.fileName}>{fileName} <button type="button" className={s.linkBtn} onClick={() => { setMaterial(""); setFileName(""); }}>Remove</button></span> : <span className={s.hint}>Used as source material, never as instructions.</span>}
              </div>
            </div>
            <div className={s.row}>
              <label className={s.field}>
                <span className={s.label}>Slides: {count}</span>
                <input type="range" min={3} max={L.maxSlides} value={count} onChange={(e) => setCount(Number(e.target.value))} className={s.range} aria-valuetext={`${count} slides`} />
              </label>
              <label className={s.field}>
                <span className={s.label}>Style</span>
                <select className={s.input} value={style} onChange={(e) => setStyle(e.target.value as DeckStyle)}>
                  {STYLES.map((o) => <option key={o.id} value={o.id}>{o.label} · {o.hint}</option>)}
                </select>
              </label>
            </div>
            <div className={s.field}>
              <span className={s.label}>Theme</span>
              <div className={s.seg} role="radiogroup" aria-label="Deck theme">
                {THEMES.map((t) => (
                  <button key={t.id} type="button" role="radio" aria-checked={theme === t.id} className={s.segBtn} onClick={() => setTheme(t.id)}>{t.label}</button>
                ))}
              </div>
            </div>
            <div className={s.submitRow}>
              <button type="submit" className={s.primary} disabled={busy !== null || topic.trim().length < 3}>{busy === "gen" ? "Writing your deck…" : "Create deck"}</button>
              <span className={s.estimate}>Estimate: about {est.toLocaleString("en-US")} credits. You&rsquo;re charged the actual cost.</span>
            </div>
          </form>

          <aside className={s.card} aria-labelledby="sl-decks">
            <h2 id="sl-decks" className={s.cardTitle}>Your decks</h2>
            {rows.length ? (
              <ul className={s.deckList}>
                {rows.map((r) => (
                  <li key={r.id} className={s.deckRow}>
                    <button type="button" className={s.deckOpen} onClick={() => void open(r.id)}>
                      <span className={s.deckName}>{r.title}</span>
                      <span className={s.deckMeta}>{r.slides} slides · {new Date(r.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    </button>
                    <button type="button" className={s.linkBtn} onClick={() => void del(r.id)} aria-label={`Delete ${r.title}`}>Delete</button>
                  </li>
                ))}
              </ul>
            ) : <p className={s.hint}>Decks you create are saved here.</p>}
          </aside>
        </div>
      ) : (
        <div className={s.editor}>
          <div className={s.toolbar}>
            <input className={`${s.input} ${s.titleInput}`} value={deck.title} onChange={(e) => edit({ ...deck, title: e.target.value.slice(0, 120) })} aria-label="Deck title" />
            <div className={s.seg} role="radiogroup" aria-label="Deck theme">
              {THEMES.map((t) => <button key={t.id} type="button" role="radio" aria-checked={deck.theme === t.id} className={s.segBtn} onClick={() => edit({ ...deck, theme: t.id })}>{t.label}</button>)}
            </div>
            <button type="button" className={s.primary} onClick={() => setPresent(sel)}>Present</button>
            <a className={s.ghost} href={`/api/slides/decks/${deck.id}/export?format=pptx`} download>PPTX</a>
            <a className={s.ghost} href={`/api/slides/decks/${deck.id}/export?format=pdf`} download>PDF</a>
            <button type="button" className={s.linkBtn} onClick={() => void del(deck.id)}>Delete</button>
            <span className={s.deckMeta}>{deck.slides.length} slides · {THEMES.find((t) => t.id === deck.theme)?.label ?? "Dark"} theme</span>
            <span className={s.saved} role="status">{saved === "saving" ? "Saving…" : saved === "saved" ? "Saved" : ""}{credits ? ` · charged ${credits} credits` : ""}</span>
          </div>

          <div className={s.workbench}>
            <ol className={s.rail} aria-label="Slides">
              {deck.slides.map((x, i) => (
                <li key={x.id} className={s.thumbItem} data-active={i === sel || undefined}>
                  <button type="button" className={s.thumb} onClick={() => setSel(i)} aria-current={i === sel ? "true" : undefined} aria-label={`Slide ${i + 1}: ${x.title}`}>
                    <SlideView slide={x} theme={deck.theme} index={i} />
                  </button>
                  <div className={s.thumbTools}>
                    <button type="button" className={s.tiny} onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move slide ${i + 1} up`}>↑</button>
                    <button type="button" className={s.tiny} onClick={() => move(i, 1)} disabled={i === deck.slides.length - 1} aria-label={`Move slide ${i + 1} down`}>↓</button>
                  </div>
                </li>
              ))}
              <li><button type="button" className={s.ghost} onClick={addSlide} disabled={deck.slides.length >= L.maxSlides}>Add slide</button></li>
            </ol>

            {slide ? (
              <div className={s.stage}>
                <SlideView slide={slide} theme={deck.theme} index={sel} />
                <div className={s.card}>
                  <label className={s.field}><span className={s.label}>Title</span><input className={s.input} value={slide.title} maxLength={120} onChange={(e) => patchSlide(sel, { title: e.target.value })} /></label>
                  <label className={s.field}><span className={s.label}>Section</span><input className={s.input} value={slide.section} maxLength={60} onChange={(e) => patchSlide(sel, { section: e.target.value })} /></label>
                  <label className={s.field}><span className={s.label}>Bullets <em>(one per line)</em></span><textarea className={s.input} rows={5} value={slide.bullets.join("\n")} onChange={(e) => patchSlide(sel, { bullets: e.target.value.split("\n").slice(0, 8) })} /></label>
                  <label className={s.field}><span className={s.label}>Speaker notes</span><textarea className={s.input} rows={3} value={slide.notes} maxLength={1200} onChange={(e) => patchSlide(sel, { notes: e.target.value })} /></label>
                  <label className={s.field}><span className={s.label}>Image idea</span><input className={s.input} value={slide.imagePrompt} maxLength={300} onChange={(e) => patchSlide(sel, { imagePrompt: e.target.value })} placeholder="Shown as a placeholder. Images aren't generated yet." /></label>
                  <div className={s.regen}>
                    <input className={s.input} value={instruction} onChange={(e) => setInstruction(e.target.value)} maxLength={500} placeholder="Optional: how should this slide change?" aria-label="Rewrite instruction" />
                    <button type="button" className={s.ghost} onClick={() => void regen()} disabled={busy !== null}>{busy === "regen" ? "Rewriting…" : "Regenerate slide"}</button>
                    <span className={s.estimate}>About {estimateSlideCredits(plan, JSON.stringify(deck.slides).length)} credits</span>
                  </div>
                  <button type="button" className={s.linkBtn} onClick={() => removeSlide(sel)} disabled={deck.slides.length <= 1}>Delete this slide</button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
      {deck && present !== null ? <Present deck={deck} start={present} onClose={() => setPresent(null)} /> : null}
    </div>
  );
}
