"use client";
/**
 * The look-and-feel picker for a generated app: style direction, light/dark, palette (from the style, picked by hand, extracted
 * from words/brand colors or an image), typography pairing, density, shape, motion, the owner's own words, and "Surprise me".
 * The sample at the top renders in the owner's chosen colors and fonts (Keplar's own UI stays graphite around it).
 */
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { ensurePreviewFonts } from "@/lib/app-builder/design/preview-fonts";
import s from "./apps.module.css";
import type { Config, Design, Palette } from "./types";

const KEYS: (keyof Palette)[] = ["bg", "surface", "ink", "muted", "accent", "accent2"];
const KEY_LABEL: Record<keyof Palette, string> = { bg: "Background", surface: "Surface", ink: "Text", muted: "Quiet text", accent: "Accent", accent2: "Second accent" };
const RADIUS: Record<Design["shape"], string> = { sharp: "0px", soft: "10px", round: "18px", pill: "999px" };

export function paletteOf(d: Design, cfg: Config): Palette {
  const st = cfg.styles.find((x) => x.id === d.style) ?? cfg.styles[0];
  return d.palette ?? (d.mode === "dark" ? st.dark : st.light);
}

/** Self-hosted preview cuts for most pairings, Google Fonts only for the rest (see lib/app-builder/design/preview-fonts.ts). */
function useFontLinks(cfg: Config) {
  useEffect(() => {
    ensurePreviewFonts(cfg.fonts);
  }, [cfg]);
}

export function DesignPicker({ cfg, design, onChange, idea, compact }: { cfg: Config; design: Design; onChange: (d: Design) => void; idea: string; compact?: boolean }) {
  useFontLinks(cfg);
  const [busy, setBusy] = useState<"" | "surprise" | "extract">("");
  const [err, setErr] = useState("");
  const [brandText, setBrandText] = useState("");
  const pal = paletteOf(design, cfg);
  const font = cfg.fonts.find((f) => f.id === design.fonts) ?? cfg.fonts[0];
  const set = (p: Partial<Design>) => onChange({ ...design, ...p });
  const pickStyle = (id: string) => {
    const st = cfg.styles.find((x) => x.id === id)!;
    onChange({ ...design, style: id, fonts: st.fonts, shape: st.shape, density: st.density, motion: st.motion, palette: design.paletteSource === "style" || design.paletteSource === "surprise" ? null : design.palette, paletteSource: design.paletteSource === "surprise" ? "style" : design.paletteSource, direction: undefined });
  };
  const surprise = async () => {
    setBusy("surprise");
    setErr("");
    try {
      const r = await api<{ design: Design }>("/api/apps/design", { method: "POST", body: JSON.stringify({ action: "surprise", idea, notes: design.notes }) });
      onChange(r.design);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const extract = async (input: { text?: string; imageDataUrl?: string }) => {
    setBusy("extract");
    setErr("");
    try {
      const r = await api<{ palette: Palette; mode: "light" | "dark"; why: string }>("/api/apps/design", { method: "POST", body: JSON.stringify({ action: "extract", ...input }) });
      onChange({ ...design, palette: r.palette, mode: r.mode, paletteSource: input.imageDataUrl ? "image" : "description" });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const fromImage = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 2_000_000) return setErr("Use an image under 2 MB.");
    const r = new FileReader();
    r.onload = () => void extract({ imageDataUrl: String(r.result), text: brandText });
    r.readAsDataURL(f);
  };
  const sampleStyle = useMemo(() => ({ background: pal.bg, color: pal.ink, fontFamily: font.bodyStack }), [pal, font]);

  return (
    <div className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.h2}>Look and feel</h2>
        <span className={s.meta}>Your app gets its own design system from these choices. Nothing generic.</span>
        <span className={s.grow} />
        <button type="button" className={s.btn} onClick={surprise} disabled={busy !== ""}>{busy === "surprise" ? "Composing a direction…" : "Surprise me"}</button>
      </div>
      {err ? <div className={s.error} role="alert">{err}</div> : null}
      {design.direction ? <p className={s.direction}>{design.direction}</p> : null}

      <div className={s.sample} aria-label="Sample in your design">
        <div className={s.sampleInner} style={sampleStyle}>
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: pal.accent }}>{cfg.styles.find((x) => x.id === design.style)?.name} · {design.mode}</span>
          <h3 className={s.sampleTitle} style={{ fontFamily: font.displayStack, color: pal.ink }}>{idea.trim() ? idea.trim().split(/[.,:;\n]/)[0].slice(0, 42) : "Your app, in your look"}</h3>
          <p className={s.sampleText} style={{ color: pal.muted }}>Body text in {font.body}. Headlines in {font.display}. Every screen is composed for what your app does.</p>
          <div className={s.sampleRow}>
            <button type="button" tabIndex={-1} className={s.sampleBtn} style={{ background: pal.accent, color: "#fff", borderRadius: RADIUS[design.shape], fontFamily: font.bodyStack, mixBlendMode: "normal" }}>Primary action</button>
            <span className={s.sampleCard} style={{ background: pal.surface, borderRadius: RADIUS[design.shape] === "999px" ? "22px" : RADIUS[design.shape], border: `1px solid ${pal.muted}33`, color: pal.ink }}>A card on the surface color</span>
            <span style={{ width: 22, height: 22, borderRadius: "50%", background: pal.accent2, display: "inline-block" }} aria-hidden="true" />
          </div>
        </div>
      </div>

      <div className={s.label}>Style direction</div>
      <div className={s.styles}>
        {cfg.styles.map((st) => {
          const p = design.mode === "dark" ? st.dark : st.light;
          return (
            <button key={st.id} type="button" className={s.style} aria-pressed={design.style === st.id} onClick={() => pickStyle(st.id)}>
              <span className={s.swatch} aria-hidden="true"><span style={{ background: p.bg }} /><span style={{ background: p.accent }} /><span style={{ background: p.ink }} /></span>
              <span className={s.styleName}>{st.name}</span>
              {compact ? null : <span className={s.styleLine}>{st.line}</span>}
            </button>
          );
        })}
      </div>

      <div className={s.grid2}>
        <div className={s.panel}>
          <div className={s.row}>
            <span className={s.label}>Colors</span>
            <span className={s.grow} />
            <div className={s.seg} role="group" aria-label="Light or dark">
              {(["light", "dark"] as const).map((m) => <button key={m} type="button" className={s.segBtn} aria-pressed={design.mode === m} onClick={() => set({ mode: m, ...(design.paletteSource === "style" ? { palette: null } : {}) })}>{m === "light" ? "Light" : "Dark"}</button>)}
            </div>
          </div>
          <div className={s.colors}>
            {KEYS.map((k) => (
              <label key={k} className={s.color}>
                <input type="color" value={pal[k]} onChange={(e) => set({ palette: { ...pal, [k]: e.target.value }, paletteSource: "picked" })} aria-label={KEY_LABEL[k]} />
                {KEY_LABEL[k]}
              </label>
            ))}
          </div>
          <input className={s.input} value={brandText} onChange={(e) => setBrandText(e.target.value)} placeholder="Describe colors, a mood or brand: “#0B3D2E and cream”, “Tokyo at night”" maxLength={300} />
          <div className={s.row}>
            <button type="button" className={`${s.btn} ${s.sm}`} disabled={busy !== "" || brandText.trim().length < 3} onClick={() => void extract({ text: brandText })}>{busy === "extract" ? "Reading…" : "Extract palette"}</button>
            <label className={`${s.btn} ${s.sm}`}>
              From an image
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => fromImage(e.target.files?.[0])} />
            </label>
            {design.palette ? <button type="button" className={`${s.btn} ${s.sm} ${s.quiet}`} onClick={() => set({ palette: null, paletteSource: "style" })}>Use the style&apos;s colors</button> : null}
          </div>
        </div>
        <div className={s.panel}>
          <span className={s.label}>Typography</span>
          <div className={s.fontList}>
            {cfg.fonts.map((f) => (
              <button key={f.id} type="button" className={s.font} aria-pressed={design.fonts === f.id} onClick={() => set({ fonts: f.id })}>
                <span className={s.fontDisplay} style={{ fontFamily: f.displayStack }}>{f.display}</span>
                <span className={s.fontBody} style={{ fontFamily: f.bodyStack }}>with {f.body}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={s.grid2}>
        <div className={s.panel}>
          <span className={s.label}>Density</span>
          <div className={s.seg} role="group" aria-label="Density">{(["airy", "balanced", "dense"] as const).map((v) => <button key={v} type="button" className={s.segBtn} aria-pressed={design.density === v} onClick={() => set({ density: v })}>{v[0].toUpperCase() + v.slice(1)}</button>)}</div>
          <span className={s.label}>Corners</span>
          <div className={s.seg} role="group" aria-label="Corners">{(["sharp", "soft", "round", "pill"] as const).map((v) => <button key={v} type="button" className={s.segBtn} aria-pressed={design.shape === v} onClick={() => set({ shape: v })}>{v[0].toUpperCase() + v.slice(1)}</button>)}</div>
          <span className={s.label}>Motion</span>
          <div className={s.seg} role="group" aria-label="Motion">{(["none", "subtle", "expressive"] as const).map((v) => <button key={v} type="button" className={s.segBtn} aria-pressed={design.motion === v} onClick={() => set({ motion: v })}>{v === "none" ? "Still" : v[0].toUpperCase() + v.slice(1)}</button>)}</div>
        </div>
        <div className={s.panel}>
          <span className={s.label}>In your own words (optional)</span>
          <textarea className={s.textarea} value={design.notes} onChange={(e) => set({ notes: e.target.value.slice(0, 600) })} placeholder="“Feels like a darkroom: red safelight accents, film-grain texture, big contact-sheet grids.”" />
        </div>
      </div>
    </div>
  );
}
