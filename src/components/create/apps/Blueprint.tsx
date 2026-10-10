"use client";
/**
 * The canvas drawing of the app being made. Before the build it is a line blueprint inferred from the prompt, in the chosen
 * look (accent, corners, display face). During the build each screen inks in as its code is written and gets a mark when the
 * browser test passes or fails. Pure SVG + CSS (no WebGL): it is cheap to render and says something real about the build.
 */
import { memo } from "react";
import type { Blueprint as BP, BlueprintScreen, Layout } from "./blueprint";
import s from "./studio.module.css";

export type BlueprintLook = { accent: string; surface: string; bg: string; ink: string; radius: number; display: string } | null;

type G = { a: string };
const W = 160;
const H = 104;

/** Wireframe glyphs per layout, drawn in a 160x104 box under a 12px top bar. Strokes use currentColor; one accent per screen. */
function glyph(layout: Layout, { a }: G) {
  const L = (x: number, y: number, w: number, o = 1) => <rect x={x} y={y} width={w} height={3} rx={1.5} className={s.bpLine} style={{ opacity: o }} />;
  const B = (x: number, y: number, w: number, h: number, r = 3) => <rect x={x} y={y} width={w} height={h} rx={r} className={s.bpBlock} />;
  const A = (x: number, y: number, w: number, h: number, r = 3) => <rect x={x} y={y} width={w} height={h} rx={r} fill={a} className={s.bpAccent} />;
  const C = (cx: number, cy: number, r: number, acc = false) => <circle cx={cx} cy={cy} r={r} className={acc ? s.bpAccent : s.bpBlock} fill={acc ? a : undefined} />;
  switch (layout) {
    case "feed":
      return <>{[20, 58].map((y) => <g key={y}>{C(18, y + 4, 5)}{L(28, y, 40)}{L(28, y + 6, 24, 0.6)}{B(12, y + 13, 92, 20)}</g>)}{B(112, 20, 36, 30)}{A(112, 56, 36, 8, 4)}</>;
    case "profile":
      return <>{C(30, 34, 13, true)}{L(50, 26, 46)}{L(50, 33, 30, 0.6)}{[50, 72, 94].map((x) => <g key={x}>{B(x, 40, 18, 9)}</g>)}{[0, 1, 2, 3, 4, 5].map((i) => B(12 + (i % 3) * 46, 56 + Math.floor(i / 3) * 22, 42, 18))}</>;
    case "grid":
      return <>{L(12, 20, 54)}{[0, 1, 2, 3, 4, 5].map((i) => <g key={i}>{B(12 + (i % 3) * 46, 30 + Math.floor(i / 3) * 36, 42, 22)}{L(12 + (i % 3) * 46, 55 + Math.floor(i / 3) * 36, 26, 0.6)}</g>)}{A(118, 18, 30, 7, 4)}</>;
    case "detail":
      return <>{B(12, 20, 72, 60)}{L(92, 22, 56)}{L(92, 30, 44, 0.7)}{L(92, 40, 56, 0.5)}{L(92, 46, 50, 0.5)}{L(92, 52, 54, 0.5)}{A(92, 64, 40, 10, 5)}{L(12, 88, 120, 0.4)}</>;
    case "form":
      return <>{L(40, 20, 80)}{[32, 48, 64].map((y) => <rect key={y} x={40} y={y} width={80} height={11} rx={3} className={s.bpField} />)}{A(40, 82, 80, 11, 5)}</>;
    case "chat":
      return <>{B(12, 20, 70, 12, 6)}{A(70, 38, 78, 12, 6)}{B(12, 56, 92, 12, 6)}{<rect x={12} y={80} width={136} height={14} rx={7} className={s.bpField} />}{C(140, 87, 4, true)}</>;
    case "board":
      return <>{[12, 62, 112].map((x, i) => <g key={x}>{L(x, 20, 26)}{B(x, 28, 36, 16)}{B(x, 48, 36, 16)}{i === 1 ? A(x, 68, 36, 16) : i === 0 ? B(x, 68, 36, 16) : null}</g>)}</>;
    case "calendar":
      return <>{L(12, 20, 50)}{Array.from({ length: 28 }, (_, i) => {
        const x = 12 + (i % 7) * 20;
        const y = 30 + Math.floor(i / 7) * 17;
        return [9, 17, 18].includes(i) ? <g key={i}>{A(x, y, 16, 13, 2)}</g> : <rect key={i} x={x} y={y} width={16} height={13} rx={2} className={s.bpField} />;
      })}</>;
    case "hero":
      return <><rect x={12} y={24} width={78} height={9} rx={2} className={s.bpHeadline} /><rect x={12} y={37} width={60} height={9} rx={2} className={s.bpHeadline} />{L(12, 54, 70, 0.6)}{L(12, 60, 56, 0.6)}{A(12, 72, 38, 11, 5.5)}{B(98, 22, 50, 66, 4)}</>;
    case "table":
      return <>{L(12, 20, 40)}{A(120, 18, 28, 8, 4)}<rect x={12} y={32} width={136} height={8} rx={2} className={s.bpBlock} />{[44, 54, 64, 74, 84].map((y) => <g key={y}>{L(14, y, 30, 0.7)}{L(54, y, 40, 0.5)}{L(104, y, 22, 0.5)}<line x1={12} x2={148} y1={y + 7} y2={y + 7} className={s.bpRule} /></g>)}</>;
    case "canvas":
      return <><rect x={12} y={20} width={136} height={70} rx={4} className={s.bpField} />{[0, 1, 2, 3, 4].map((i) => <g key={i}>{C(34 + i * 23, 50 + (i % 2 ? 10 : -6), 7, i === 2)}</g>)}<path d="M34 44 L57 60 L80 44 L103 60 L126 44" className={s.bpPath} />{L(16, 24, 22, 0.8)}{A(124, 24, 20, 6, 3)}</>;
    case "list":
      return <>{L(12, 20, 46)}{[30, 46, 62, 78].map((y, i) => <g key={y}>{B(12, y, 12, 12, i === 0 ? 6 : 3)}{L(30, y + 2, 70)}{L(30, y + 8, 44, 0.5)}{i === 1 ? A(126, y + 2, 22, 8, 4) : null}</g>)}</>;
    case "auth":
      return <><rect x={44} y={18} width={72} height={78} rx={6} className={s.bpField} />{L(54, 28, 40)}{[40, 54].map((y) => <rect key={y} x={54} y={y} width={52} height={9} rx={3} className={s.bpBlock} />)}{A(54, 70, 52, 10, 5)}{L(62, 86, 36, 0.5)}</>;
    case "checkout":
      return <>{[22, 40, 58].map((y) => <g key={y}>{B(12, y, 14, 14)}{L(32, y + 3, 48)}{L(32, y + 9, 28, 0.5)}</g>)}<rect x={100} y={22} width={48} height={62} rx={4} className={s.bpField} />{L(106, 30, 30)}{L(106, 38, 36, 0.5)}{L(106, 46, 32, 0.5)}{A(106, 68, 36, 10, 5)}</>;
    case "stats":
      return <>{[12, 58, 104].map((x, i) => <g key={x}><rect x={x} y={20} width={44} height={22} rx={3} className={s.bpField} />{i === 0 ? A(x + 6, 26, 20, 6, 2) : L(x + 6, 26, 22)}{L(x + 6, 34, 14, 0.5)}</g>)}<polyline points="12,86 32,74 52,78 72,62 92,66 112,52 148,56" className={s.bpPath} />{[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x={14 + i * 22} y={92 - (i % 3) * 3} width={12} height={4 + (i % 3) * 3} className={s.bpBlock} />)}</>;
    case "settings":
      return <>{L(12, 20, 40)}{[32, 48, 64, 80].map((y, i) => <g key={y}>{L(12, y + 3, 64, 0.7)}<rect x={124} y={y} width={22} height={10} rx={5} className={i % 2 ? s.bpField : s.bpBlock} />{i === 0 ? <circle cx={141} cy={y + 5} r={3.5} fill={a} className={s.bpAccent} /> : null}</g>)}</>;
  }
}

const Frame = memo(function Frame({ screen, i, look, big }: { screen: BlueprintScreen; i: number; look: BlueprintLook; big: boolean }) {
  const st = screen.state ?? "idle";
  const style = look ? ({ "--bp-accent": look.accent, "--bp-surface": look.surface, "--bp-bg": look.bg, "--bp-ink": look.ink, "--bp-radius": `${look.radius}px` } as React.CSSProperties) : undefined;
  return (
    <figure className={`${s.bpFrame} ${big ? s.bpBig : ""}`} data-state={st} style={{ ...style, animationDelay: `${i * 70}ms` }}>
      <figcaption className={s.bpCap}>
        <span className={s.bpNum}>{String(i + 1).padStart(2, "0")}</span>
        <span className={s.bpTitle} style={look ? { fontFamily: look.display } : undefined}>{screen.title}</span>
        <span className={s.bpRoute}>{screen.route}</span>
        {st === "tested" ? <span className={s.bpMark} data-ok="true" aria-label="tested, works">✓</span> : st === "failed" ? <span className={s.bpMark} data-ok="false" aria-label="test found a problem">!</span> : st === "writing" ? <span className={s.bpWriting} aria-label="being written" /> : null}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className={s.bpSvg} role="img" aria-label={`${screen.title} screen, ${screen.layout} layout${st === "idle" ? "" : `, ${st}`}`}>
        <rect x={0.5} y={0.5} width={W - 1} height={H - 1} rx={look ? Math.min(14, look.radius) : 6} className={s.bpOutline} />
        <line x1={0} x2={W} y1={12} y2={12} className={s.bpRule} />
        <circle cx={7} cy={6} r={1.6} className={s.bpBlock} />
        <circle cx={12} cy={6} r={1.6} className={s.bpBlock} />
        <rect x={110} y={4} width={40} height={4} rx={2} className={s.bpBlock} />
        {glyph(screen.layout, { a: look?.accent ?? "currentColor" })}
      </svg>
    </figure>
  );
});

export const Blueprint = memo(function Blueprint({ bp, look, building, progress, caption }: { bp: BP; look: BlueprintLook; building?: boolean; progress?: number; caption?: string }) {
  const screens = bp.screens.slice(0, building ? 8 : 6);
  return (
    <div className={s.bp} data-building={building ? "true" : undefined} data-confident={bp.confident ? "true" : undefined}>
      <div className={s.bpHead}>
        <span className={s.bpKicker}>{building ? "Building" : "Preview"}</span>
        <span className={s.bpLabel} style={look ? { fontFamily: look.display } : undefined}>{bp.label}</span>
        <span className={s.bpMeta}>{screens.length} screen{screens.length === 1 ? "" : "s"}{bp.data.length ? ` · ${bp.data.join(", ")}` : ""}</span>
      </div>
      {bp.traits.length ? <div className={s.bpTraits}>{bp.traits.map((t) => <span key={t} className={s.bpTrait}>{t}</span>)}</div> : null}
      <div className={s.bpGrid}>
        {screens.map((sc, i) => <Frame key={`${sc.route}-${i}`} screen={sc} i={i} look={look} big={i === 0} />)}
      </div>
      {building && typeof progress === "number" ? (
        <div className={s.bpProgress} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Build progress">
          <span style={{ transform: `scaleX(${Math.max(0.02, progress)})` }} />
        </div>
      ) : null}
      {caption ? <p className={s.bpCaption}>{caption}</p> : null}
    </div>
  );
});
