"use client";
/**
 * Look: flat palette + type swatches for each direction. "Keplar picks" art-directs a look for the idea while it plans.
 * Fine-tune opens the full design picker (palette from words or an image, fonts, density, motion), loaded only when asked for.
 */
import { memo, useEffect } from "react";
import { ensurePreviewFonts } from "@/lib/app-builder/design/preview-fonts";
import s from "./studio.module.css";
import type { Config, Design } from "./types";

export const RADIUS_PX: Record<Design["shape"], number> = { sharp: 2, soft: 9, round: 16, pill: 999 };

type Props = { cfg: Config; design: Design; auto: boolean; onAuto: () => void; onStyle: (id: string) => void; onMode: (m: "light" | "dark") => void; onFineTune: () => void; tuned: boolean };

export const LookTiles = memo(function LookTiles({ cfg, design, auto, onAuto, onStyle, onMode, onFineTune, tuned }: Props) {
  useEffect(() => {
    ensurePreviewFonts(cfg.fonts);
  }, [cfg.fonts]);
  const mode = design.mode;
  return (
    <div className={s.look}>
      <div className={s.tiles} role="radiogroup" aria-label="Look">
        <button type="button" role="radio" aria-checked={auto} className={`${s.tile} ${s.tileAuto}`} onClick={onAuto}>
          <span className={s.tileArt} aria-hidden="true">
            <span className={s.swatchBars}>
              <i style={{ background: "var(--c-ink)" }} />
              <i style={{ background: "var(--c-ink-2)" }} />
              <i style={{ background: "var(--c-ink-3)" }} />
              <i style={{ background: "var(--c-surface-2)" }} />
            </span>
            <span className={s.tileAa}>Aa</span>
          </span>
          <span className={s.tileName}>Keplar picks</span>
          <span className={s.tileLine}>Matched to the brief</span>
        </button>
        {cfg.styles.map((st) => {
          const p = mode === "dark" ? st.dark : st.light;
          const f = cfg.fonts.find((x) => x.id === st.fonts) ?? cfg.fonts[0];
          const on = !auto && design.style === st.id;
          return (
            <button key={st.id} type="button" role="radio" aria-checked={on} className={s.tile} onClick={() => onStyle(st.id)} title={st.line}>
              <span className={s.tileArt} style={{ background: p.bg, color: p.ink }} aria-hidden="true">
                <span className={s.swatchBars}>
                  <i style={{ background: p.accent }} />
                  <i style={{ background: p.accent2 }} />
                  <i style={{ background: p.muted }} />
                  <i style={{ background: p.surface }} />
                </span>
                <span className={s.tileAa} style={{ fontFamily: f.displayStack }}>Aa</span>
              </span>
              <span className={s.tileName}>{st.name}</span>
              <span className={s.tileLine}>{f.display}</span>
            </button>
          );
        })}
      </div>
      <div className={s.lookFoot}>
        <div className={s.toggle} role="group" aria-label="Light or dark">
          {(["light", "dark"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => onMode(m)}>{m === "light" ? "Light" : "Dark"}</button>
          ))}
        </div>
        <button type="button" className={s.textBtn} onClick={onFineTune} aria-haspopup="dialog">
          {tuned ? "Edit colors, type and shape" : "Fine-tune colors, type and shape"}
        </button>
      </div>
    </div>
  );
});
