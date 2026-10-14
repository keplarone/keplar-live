"use client";
/**
 * Create, "Style" tab: switch the style direction, accent and light/dark for the whole site (no model call, no credits:
 * Keplar rewrites its design layer into a new version you can undo), choose motion and 3D effects, and read the last
 * quality check. Effects are per site, off unless you turn them on, and always fall back to a still page on phones,
 * reduced-motion and slow devices.
 */
import { useState } from "react";
import type { LintSummary, SiteDesign } from "@/lib/site-builder/types";
import type { SiteFx } from "@/lib/site-builder/fx/types";
import { FX_EFFECT_INFO, FX_EFFECTS } from "@/lib/site-builder/fx/types";
import d from "./discovery.module.css";
import s from "./create.module.css";
import b from "./builder.module.css";
import { Button } from "@/components/kit";

export type DirectionInfo = { id: string; name: string; tagline: string; swatch: string[]; mode: string; display: string; body: string; effect: string };
type SiteLike = { id: string; headVersion: number; design?: SiteDesign | null; fx?: SiteFx | null };

async function call<T>(path: string, method: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(data.error ?? `Request failed (${res.status})`));
  return data as T;
}

export function StylePane({ site, directions, lint, disabled, onChanged }: { site: SiteLike; directions: DirectionInfo[]; lint: LintSummary | null; disabled: boolean; onChanged: () => void }) {
  const design = site.design ?? null;
  const [fx, setFx] = useState<SiteFx>(site.fx ?? { enabled: false, intensity: 55, effect: "auto" });
  const [accent, setAccent] = useState(design?.accent ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setErr(null); setMsg(null);
    try { await fn(); setMsg(ok); onChanged(); } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong."); } finally { setBusy(false); }
  }
  const applyDesign = (patch: Record<string, unknown>) => run(() => call(`/api/sites/${site.id}/design`, "POST", patch), "Style applied. It's saved as a new version you can undo.");
  const saveFx = (next: SiteFx) => { setFx(next); return run(() => call(`/api/sites/${site.id}`, "PATCH", { fx: next }), "Motion saved."); };
  const off = disabled || busy || site.headVersion < 1;

  return (
    <div className={b.pane}>
      <div className={b.card}>
        <strong>Style</strong>
        <p className={s.muted}>{design ? "Fonts, colors and spacing for every page. Changing it doesn't touch your text or use credits." : "This site was made before Keplar styles. Pick one to restyle it: your text and pages stay, the look is replaced."}</p>
        <div className={d.dirs} role="radiogroup" aria-label="Style direction">
          {directions.map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={design?.direction === x.id} disabled={off} className={d.dir} onClick={() => void applyDesign({ direction: x.id })}>
              <span className={d.sw} aria-hidden="true">{x.swatch.map((c, i) => <i key={i} style={{ background: c }} />)}</span>
              <strong>{x.name}</strong>
              <small>{x.tagline}</small>
              <small className={d.fonts}>{x.display} + {x.body}</small>
            </button>
          ))}
        </div>
        <div className={b.row}>
          <div className={b.field}>
            <span id="st-mode">Light or dark</span>
            <div className={b.seg} role="group" aria-labelledby="st-mode">
              {(["auto", "light", "dark"] as const).map((m) => <button key={m} type="button" className={b.segBtn} disabled={off || !design} aria-pressed={(design?.mode ?? "auto") === m} onClick={() => void applyDesign({ mode: m })}>{m === "auto" ? "Match style" : m[0].toUpperCase() + m.slice(1)}</button>)}
            </div>
          </div>
          <label className={b.field}>
            <span>Accent color</span>
            <span className={b.row}>
              <input className={s.input} style={{ width: 120 }} value={accent} placeholder="#1f4bff" maxLength={7} disabled={off || !design} onChange={(e) => setAccent(e.target.value)} />
              <Button variant="secondary" size="sm" disabled={off || !design || !/^#?[0-9a-fA-F]{6}$/.test(accent)} onClick={() => void applyDesign({ accent })}>Apply</Button>
              {design?.accent ? <Button variant="secondary" size="sm" disabled={off} onClick={() => { setAccent(""); void applyDesign({ accent: null }); }}>Reset</Button> : null}
            </span>
            <span className={b.hint}>Text on it is adjusted automatically so it stays readable.</span>
          </label>
        </div>
      </div>

      <div className={b.card}>
        <strong>Motion and 3D</strong>
        <p className={s.muted}>A fine point field or wireframe behind the hero, soft reveals and gentle parallax. Off by default. Phones get a lighter version; people who ask their device for less motion, and slow or data-saving connections, get a still page. The 3D code (about 140 KB) loads only when a visitor scrolls to it.</p>
        <label className={b.row}>
          <input type="checkbox" checked={fx.enabled} disabled={off || !design} onChange={(e) => void saveFx({ ...fx, enabled: e.target.checked })} />
          <span>Enable effects on this site</span>
        </label>
        {fx.enabled ? (
          <>
            <label className={b.field}>
              <span>Intensity: {fx.intensity}</span>
              <input type="range" min={0} max={100} step={5} value={fx.intensity} disabled={off} onChange={(e) => setFx({ ...fx, intensity: Number(e.target.value) })} onPointerUp={() => void saveFx(fx)} onKeyUp={() => void saveFx(fx)} aria-label="Effect intensity" />
              <span className={b.hint}>0 = still pictures only. Higher adds more points and movement.</span>
            </label>
            <label className={b.field}>
              <span>Effect</span>
              <select className={s.select} value={fx.effect} disabled={off} onChange={(e) => void saveFx({ ...fx, effect: e.target.value as SiteFx["effect"] })}>
                <option value="auto">Match the style</option>
                {FX_EFFECTS.map((e) => <option key={e} value={e}>{FX_EFFECT_INFO[e].label}: {FX_EFFECT_INFO[e].blurb}</option>)}
              </select>
            </label>
          </>
        ) : null}
      </div>

      <div className={b.card}>
        <strong>Quality check</strong>
        {lint ? (
          <>
            <p className={s.muted}>
              {lint.errors === 0 && lint.warnings === 0 ? "No issues found in the last build." : `${lint.errors} issue${lint.errors === 1 ? "" : "s"} and ${lint.warnings} note${lint.warnings === 1 ? "" : "s"} remain.`}
              {lint.fixed.length ? ` ${lint.fixed.length} fixed automatically${lint.repaired ? ", including one repair pass" : ""}.` : ""}
              {lint.placeholders ? ` ${lint.placeholders} placeholder${lint.placeholders === 1 ? "" : "s"} marked for you to fill in with real details.` : ""}
            </p>
            {lint.remaining.length ? (
              <ul className={b.list}>
                {lint.remaining.slice(0, 8).map((r, i) => <li key={i} className={b.item}><span className={r.severity === "error" ? b.warn : b.hint}>{r.severity === "error" ? "Issue" : "Note"}</span><span className={b.itemMain}>{r.message}<small>{r.file}</small></span></li>)}
              </ul>
            ) : null}
          </>
        ) : <p className={s.muted}>Runs after each AI build: contrast, headings, alt text, invented claims, layout clichés and mobile layout. Build something to see results.</p>}
      </div>
      {err ? <p className={s.error} role="alert">{err}</p> : null}
      {msg ? <p className={b.ok} role="status">{msg}</p> : null}
    </div>
  );
}
