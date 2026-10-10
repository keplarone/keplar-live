"use client";
import { useRef, useState } from "react";
import type { SiteBrief } from "@/lib/site-builder/brief";
import { ProductCard, productReady } from "../ProductImport";
import type { Flow } from "./flow";
import s from "./ws.module.css";

const MOTIONS: { id: SiteBrief["motion"]; label: string; note: string }[] = [
  { id: "none", label: "Still", note: "No animation. Fastest." },
  { id: "subtle", label: "Subtle", note: "Gentle reveals as you scroll." },
  { id: "expressive", label: "Expressive", note: "A fine 3D point field behind the hero." },
];

const list = (v: string, max: number) => v.split(",").map((x) => x.trim()).filter(Boolean).slice(0, max);

/** The brief, shown in the chat for approval: the improved description beside the original, the look, the structure, and an edit-everything fold. */
export function BriefReview({ flow, busy, onApprove, onStartOver }: { flow: Flow; busy: boolean; onApprove: (b: SiteBrief) => void; onStartOver: () => void }) {
  const { brief, info, enh, estimate, working } = flow;
  const [moodBusy, setMoodBusy] = useState(false);
  const [moodErr, setMoodErr] = useState<string | null>(null);
  const [links, setLinks] = useState((brief?.mood?.links ?? []).join("\n"));
  const fileRef = useRef<HTMLInputElement>(null);
  if (!brief || !info) return null;
  const set = <K extends keyof SiteBrief>(k: K, v: SiteBrief[K]) => flow.setBrief((p) => (p ? { ...p, [k]: v } : p));
  const mood = brief.mood ?? { colors: [], links: [], notes: "" };
  const setMood = (m: Partial<typeof mood>) => set("mood", { ...mood, ...m });
  const reviewProduct = brief.product ?? null;

  async function addImages(files: FileList | null) {
    if (!files?.length) return;
    setMoodBusy(true);
    setMoodErr(null);
    const colors = [...mood.colors];
    try {
      for (const f of Array.from(files).slice(0, 4)) {
        const res = await fetch("/api/sites/import/mood", { method: "POST", headers: { "content-type": f.type || "application/octet-stream" }, body: f });
        const data = (await res.json().catch(() => ({}))) as { colors?: string[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Couldn't read that image.");
        for (const c of data.colors ?? []) if (!colors.includes(c)) colors.push(c);
      }
      setMood({ colors: colors.slice(0, 6) });
    } catch (e) {
      setMoodErr(e instanceof Error ? e.message : "Couldn't read that image.");
    } finally {
      setMoodBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  const shownIdea = enh.used && enh.enhanced ? enh.enhanced.idea : brief.idea;

  return (
    <div className={s.card} data-testid="brief-review">
      <div>
        <h3 className={s.cardTitle}>Here&rsquo;s the brief. Change anything, then approve.</h3>
        <p className={s.muted}>The site is built from exactly this. Anything you leave out gets a clearly marked placeholder, never invented facts.</p>
      </div>

      <section className={s.enh} aria-label="Improved description" aria-live="polite">
        <div className={s.enhHead}>
          <strong>Your idea</strong>
          {enh.status === "working" ? <span className={s.muted}>Sharpening the description…</span> : null}
        </div>
        <p className={`${s.idea} ${enh.used ? s.ideaOld : ""}`}>{brief.idea}</p>
        {enh.status === "ready" && enh.enhanced ? (
          <>
            <div className={s.enhHead}><strong>Improved</strong><span className={s.tag}>Suggested</span></div>
            <p className={`${s.idea} ${enh.used ? s.ideaNew : ""}`}>{enh.enhanced.idea}</p>
            {enh.enhanced.adds.length ? <ul className={s.bullets}>{enh.enhanced.adds.map((a) => <li key={a}>{a}</li>)}</ul> : null}
            {enh.enhanced.missing.length ? <p className={s.muted}>Worth telling me: {enh.enhanced.missing.join(" · ")}</p> : null}
            <div className={s.row}>
              {enh.used ? (
                <button type="button" className={s.btnGhost} onClick={() => { set("idea", flow.idea); flow.setEnh({ ...enh, used: false }); }}>Use my original</button>
              ) : (
                <button type="button" className={s.btn} onClick={() => { set("idea", enh.enhanced!.idea); flow.setEnh({ ...enh, used: true }); }}>Use the improved version</button>
              )}
              <span className={s.muted}>{enh.used ? "The improved description will be used." : "Your original is used unless you choose this."}</span>
            </div>
          </>
        ) : enh.status === "unavailable" || enh.status === "failed" ? (
          <p className={s.muted}>{enh.message || "No improvement this time."} Your original description is used.</p>
        ) : null}
      </section>

      <div className={s.summary}>
        <div><span>Name</span><strong>{brief.name}</strong></div>
        <div><span>Goal</span><strong>{brief.goal || "Not set"}</strong></div>
        <div><span>For</span><strong>{brief.audience || "Not set"}</strong></div>
        <div><span>Pages</span><strong>{brief.pages.join(", ")}</strong></div>
      </div>

      <div className={s.field}>
        <span id="brief-style">Art direction</span>
        <div className={s.dirs} role="radiogroup" aria-labelledby="brief-style">
          {info.directions.map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={brief.direction === x.id} className={s.dir} onClick={() => set("direction", x.id as SiteBrief["direction"])}>
              <span className={s.sw} aria-hidden="true">{x.swatch.map((c, i) => <i key={i} style={{ background: c }} />)}</span>
              <strong>{x.name}</strong>
              <small>{x.tagline}</small>
              <small className={s.fonts}>{x.display} + {x.body}</small>
            </button>
          ))}
        </div>
      </div>

      <div className={s.field}>
        <span id="brief-motion">Motion</span>
        <div className={s.seg} role="group" aria-labelledby="brief-motion">
          {MOTIONS.map((m) => <button key={m.id} type="button" className={s.segBtn} aria-pressed={brief.motion === m.id} onClick={() => set("motion", m.id)}>{m.label}</button>)}
        </div>
        <small className={s.muted}>{MOTIONS.find((m) => m.id === brief.motion)?.note}</small>
      </div>

      <details className={s.fold}>
        <summary>Structure this site will use</summary>
        <p className={s.muted}>Drawn for this project so it doesn&rsquo;t share a skeleton with other sites. You can draw another.</p>
        <dl className={s.dl}>
          {info.structure.map((r) => <div key={r.label}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}
        </dl>
        <button type="button" className={s.btnGhost} disabled={working} onClick={() => void flow.reroll()}>Draw a different structure</button>
      </details>

      <details className={s.fold}>
        <summary>Mood board and references{mood.colors.length || mood.links.length ? ` · ${mood.colors.length} colors, ${mood.links.length} links` : ""}</summary>
        <p className={s.muted}>Drop images you like. Keplar reads their colors; the images themselves are not saved. Add links to sites you admire as notes for the designer.</p>
        <div className={s.row}>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="visually-hidden" id="mood-files" onChange={(e) => void addImages(e.target.files)} />
          <label htmlFor="mood-files" className={s.btnGhost} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click(); }}>{moodBusy ? "Reading…" : "Add reference images"}</label>
          {mood.colors.map((c) => (
            <button key={c} type="button" className={s.chipColor} title={`Use ${c} as the accent color`} aria-pressed={brief.accent === c} onClick={() => set("accent", brief.accent === c ? null : c)}>
              <i style={{ background: c }} aria-hidden="true" />{c}
            </button>
          ))}
        </div>
        {mood.colors.length ? <small className={s.muted}>Tap a color to use it as the accent. Tap again to let the art direction choose.</small> : null}
        {moodErr ? <p className={s.error} role="alert">{moodErr}</p> : null}
        <label className={s.field}><span>Reference links (one per line)</span>
          <textarea className={s.input} rows={2} value={links} placeholder="https://example.com" onChange={(e) => { setLinks(e.target.value); setMood({ links: e.target.value.split(/\s+/).filter((x) => /^https?:\/\//i.test(x)).slice(0, 5) }); }} />
        </label>
        <label className={s.field}><span>What you like about them</span>
          <input className={s.input} maxLength={300} value={mood.notes} placeholder="e.g. the big quiet type, the way the menu opens" onChange={(e) => setMood({ notes: e.target.value })} />
        </label>
      </details>

      {reviewProduct ? (
        <ProductCard compact product={reviewProduct} assets={flow.assets} maxImages={flow.maxImages} onChange={(next) => flow.setBrief((p) => (p ? { ...p, product: next } : p))} onAssets={flow.setAssets} onRemove={flow.removeProduct} />
      ) : null}

      <details className={s.fold}>
        <summary>Edit details</summary>
        <div className={s.grid}>
          <label className={s.field}><span>Name</span><input className={s.input} value={brief.name} maxLength={60} onChange={(e) => set("name", e.target.value)} /></label>
          <label className={s.field}><span>Goal of the site</span><input className={s.input} value={brief.goal} maxLength={300} onChange={(e) => set("goal", e.target.value)} /></label>
          <label className={s.field}><span>Who it&rsquo;s for</span><input className={s.input} value={brief.audience} maxLength={300} onChange={(e) => set("audience", e.target.value)} /></label>
          <label className={s.field}><span>What it is</span><input className={s.input} value={brief.purpose} maxLength={300} onChange={(e) => set("purpose", e.target.value)} /></label>
          <label className={s.field}><span>Tone</span><input className={s.input} defaultValue={brief.tone.join(", ")} onBlur={(e) => set("tone", list(e.target.value, 5))} /></label>
          <label className={s.field}><span>Pages (up to {info.limits.pages})</span><input className={s.input} defaultValue={brief.pages.join(", ")} onBlur={(e) => set("pages", list(e.target.value, info.limits.pages))} /></label>
        </div>
        <label className={s.field}><span>Real content to use (hours, prices, address, copy). Optional</span><textarea className={s.input} rows={3} maxLength={2400} value={brief.content} placeholder="Paste anything true that should appear. Without it, Keplar leaves marked placeholders." onChange={(e) => set("content", e.target.value)} /></label>
      </details>

      {flow.err ? <p className={s.error} role="alert">{flow.err}</p> : null}
      <div className={s.row}>
        <button type="button" className={s.btn} disabled={busy || brief.name.trim().length < 1 || (reviewProduct ? !productReady(reviewProduct) : false)} onClick={() => onApprove({ ...brief, idea: shownIdea, name: brief.name.trim() })}>{busy ? "Building…" : "Approve and build"}</button>
        <button type="button" className={s.btnGhost} disabled={busy} onClick={onStartOver}>Start over</button>
        <span className={s.muted} aria-live="polite">{estimate ? (estimate.free ? `Free · ${estimate.modelLabel} · text only` : `About ${estimate.units.toLocaleString()} credits (usually ${estimate.low.toLocaleString()}–${estimate.high.toLocaleString()}) · ${estimate.modelLabel}`) : ""}</span>
      </div>
    </div>
  );
}
