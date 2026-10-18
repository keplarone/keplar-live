"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import { isPhone } from "@/lib/fx/lite";
import { buildPaths, compact, dayLabel, dayLabelLong, easeOut, lerp, nearest, niceTicks, type TPoint, type XY } from "./chart";
import d from "./dashboard.module.css";

const PAD = { r: 14, t: 16, b: 30 };
type Drawn = { key: string; w: number; h: number; px: XY[] };

const REDUCE = "(prefers-reduced-motion: reduce)";
const onReduceChange = (cb: () => void) => {
  const mq = window.matchMedia(REDUCE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
/** Still charts for reduced motion and on phones (640px and narrower). */
const useStill = () => useSyncExternalStore(onReduceChange, () => window.matchMedia(REDUCE).matches || isPhone(), () => true);

/**
 * Space Studio's dashboard chart for the Business workspace: one line over a soft gradient area, drawn in pixel space (crisp
 * at any size) from real points only. It draws itself on with a horizontal motion blur, morphs when the timeframe changes,
 * and reads out a point under the pointer or with the arrow keys (a spring-placed crosshair and a glass tooltip). Phones and
 * reduced motion get the finished chart with no movement. Blue is traffic and people; green is money.
 */
export function TimeChart({ points, tone, label, describe, seriesKey, delay = 0 }: {
  points: TPoint[];
  tone: "blue" | "green";
  label: string;
  /** Tooltip and screen-reader value for one point, e.g. "1,204 views". */
  describe: (v: number) => string;
  /** Identifies the series (e.g. its timeframe). A new key morphs the line; the same key just repaints. */
  seriesKey: string;
  /** Draw-on delay for the first show, ms. */
  delay?: number;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const reduced = useStill();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      setSize((s) => (s && s.w === w && s.h === h ? s : w > 0 && h > 0 ? { w, h } : s));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ticks = useMemo(() => niceTicks(points.reduce((m, p) => Math.max(m, p.v), 0)), [points]);
  const yMax = ticks[ticks.length - 1]!;
  const padL = useMemo(() => Math.max(26, Math.max(...ticks.map((t) => compact(t).length)) * 7.4 + 14), [ticks]);

  const geo = useMemo(() => {
    if (!size || !points.length) return null;
    const plotW = Math.max(1, size.w - padL - PAD.r);
    const plotH = Math.max(1, size.h - PAD.t - PAD.b);
    const t0 = points[0]!.t;
    const t1 = points[points.length - 1]!.t;
    const X = (t: number) => padL + (t1 === t0 ? plotW / 2 : ((t - t0) / (t1 - t0)) * plotW);
    const Y = (v: number) => PAD.t + (1 - v / yMax) * plotH;
    return { plotW, plotH, X, Y, base: PAD.t + plotH };
  }, [size, padL, points, yMax]);

  /* ---------- imperative drawing ---------- */
  const lineRef = useRef<SVGPathElement>(null);
  const glowRef = useRef<SVGPathElement>(null);
  const areaRef = useRef<SVGPathElement>(null);
  const dotsRef = useRef<SVGPathElement>(null);
  const lastRef = useRef<SVGGElement>(null);
  const clipRef = useRef<SVGRectElement>(null);
  const plotRef = useRef<SVGGElement>(null);
  const drawn = useRef<Drawn | null>(null);
  const raf = useRef(0);
  const shownOnce = useRef(false);

  const paint = useCallback((px: XY[], base: number) => {
    const { line, area, dots } = buildPaths(px, base);
    lineRef.current?.setAttribute("d", line);
    glowRef.current?.setAttribute("d", line);
    areaRef.current?.setAttribute("d", area);
    dotsRef.current?.setAttribute("d", dots);
    const last = px[px.length - 1];
    if (lastRef.current && last) lastRef.current.setAttribute("transform", `translate(${last.x.toFixed(2)},${last.y.toFixed(2)})`);
    if (drawn.current) drawn.current.px = px;
  }, []);

  useLayoutEffect(() => {
    if (!geo || !size) return;
    cancelAnimationFrame(raf.current);
    const target = points.map((p) => ({ x: geo.X(p.t), y: geo.Y(p.v) }));
    const prev = drawn.current;
    drawn.current = { key: seriesKey, w: size.w, h: size.h, px: prev?.px ?? [] };

    const drawOn = () => {
      const line = lineRef.current;
      if (!line || typeof line.animate !== "function") return;
      const L = Math.ceil(line.getTotalLength()) + 2;
      const opts: KeyframeAnimationOptions = { duration: 1500, delay, easing: "cubic-bezier(0.65, 0, 0.25, 1)", fill: "backwards" };
      for (const p of [line, glowRef.current]) {
        if (!p) continue;
        p.style.strokeDasharray = `${L} ${L}`;
        const a = p.animate([{ strokeDashoffset: L, filter: "url(#sp-mb-x-soft)" }, { strokeDashoffset: L * 0.08, filter: "url(#sp-mb-x-soft)", offset: 0.85 }, { strokeDashoffset: 0, filter: "none" }], opts);
        a.onfinish = () => { p.style.strokeDasharray = ""; };
      }
      clipRef.current?.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], opts);
      lastRef.current?.firstElementChild?.animate([{ opacity: 0, transform: "scale(0)" }, { opacity: 1, transform: "scale(1)" }], { duration: 520, delay: delay + 1350, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)", fill: "backwards" });
    };

    const resized = prev && (prev.w !== size.w || prev.h !== size.h);
    if (reduced || !prev || resized || !shownOnce.current || prev.key === seriesKey) {
      paint(target, geo.base);
      if (!shownOnce.current && points.length) { shownOnce.current = true; if (!reduced) drawOn(); }
      return;
    }
    const from = prev.px;
    if (from.length === target.length && target.length > 1) {
      // Same number of points: every point travels to its new place.
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / 820);
        const e = easeOut(p);
        paint(from.map((a, i) => ({ x: lerp(a.x, target[i]!.x, e), y: lerp(a.y, target[i]!.y, e) })), geo.base);
        if (p < 1) raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
      return;
    }
    // A different shape: the new series resolves out of a blur.
    paint(target, geo.base);
    plotRef.current?.animate?.(
      [{ opacity: 0, filter: "blur(10px)", transform: "translateY(6px)" }, { opacity: 1, filter: "blur(0px)", transform: "none" }],
      { duration: 620, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
  }, [geo, size, points, seriesKey, reduced, paint, delay]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  /* ---------- hover and keyboard crosshair ---------- */
  const [hover, setHover] = useState<number | null>(null);
  const onMove = (e: PointerEvent) => {
    const px = drawn.current?.px;
    if (!px?.length || !wrapRef.current) return;
    const x = e.clientX - wrapRef.current.getBoundingClientRect().left;
    const i = nearest(px, x);
    if (i !== hover) setHover(i);
  };
  const onKey = (e: KeyboardEvent) => {
    if (!points.length) return;
    let n: number | null = null;
    if (e.key === "ArrowLeft") n = Math.max(0, (hover ?? points.length) - 1);
    else if (e.key === "ArrowRight") n = Math.min(points.length - 1, (hover ?? points.length - 2) + 1);
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = points.length - 1;
    else if (e.key === "Escape" && hover != null) { e.preventDefault(); setHover(null); return; }
    else return;
    e.preventDefault();
    setHover(n);
  };
  const shown = hover != null && hover < points.length ? hover : null;
  const hp = shown != null ? points[shown] : undefined;
  const hx = shown != null && geo ? geo.X(points[shown]!.t) : 0;
  const hy = shown != null && geo ? geo.Y(points[shown]!.v) : 0;
  const tipW = 150;
  const tipX = size ? Math.max(0, Math.min(size.w - tipW, hx - tipW / 2)) : 0;

  /* ---------- static layers ---------- */
  const xTicks = useMemo(() => {
    if (!geo || points.length < 2) return [];
    const every = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(geo.plotW / 72))));
    return points.filter((_, i) => (points.length - 1 - i) % every === 0);
  }, [geo, points]);

  return (
    <div
      ref={wrapRef}
      className={d.tchart}
      data-tone={tone}
      tabIndex={0}
      role="group"
      aria-label={`${label}. ${points.length ? `${points.length} days. Use the left and right arrow keys to read them.` : "No recorded days."}`}
      onKeyDown={onKey}
      onBlur={() => setHover(null)}
      onFocus={(e) => { if (hover == null && points.length && e.currentTarget.matches(":focus-visible")) setHover(points.length - 1); }}
    >
      {size && geo ? (
        <svg className={d.tsvg} width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`} aria-hidden="true">
          <defs>
            <linearGradient id={`${uid}fill`} x1="0" y1={PAD.t} x2="0" y2={geo.base} gradientUnits="userSpaceOnUse">
              <stop offset="0%" className={d.stopA} />
              <stop offset="100%" className={d.stopB} />
            </linearGradient>
            <filter id={`${uid}glow`} x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="5" /></filter>
            <clipPath id={`${uid}clip`}>
              <rect ref={clipRef} className={d.cliprect} x={padL - 6} y={0} width={geo.plotW + 12} height={size.h} />
            </clipPath>
          </defs>
          <g key={`y${yMax}`} className={d.ygrid}>
            {ticks.map((t) => (
              <g key={t} transform={`translate(0,${geo.Y(t).toFixed(1)})`}>
                <line x1={padL} x2={padL + geo.plotW} data-zero={t === 0 || undefined} />
                <text x={padL - 12} dy="0.32em">{compact(t)}</text>
              </g>
            ))}
          </g>
          <g className={d.xaxis}>
            {xTicks.map((p) => {
              const x = geo.X(p.t);
              const anchor = x < padL + 24 ? "start" : x > padL + geo.plotW - 24 ? "end" : "middle";
              return <text key={p.t} x={x} y={geo.base + 20} textAnchor={anchor}>{dayLabel(p.t)}</text>;
            })}
          </g>
          <g ref={plotRef} clipPath={`url(#${uid}clip)`}>
            <path ref={areaRef} className={d.area} fill={`url(#${uid}fill)`} />
            <path ref={glowRef} className={d.glow} filter={`url(#${uid}glow)`} />
            <path ref={lineRef} className={d.line} />
            <path ref={dotsRef} className={d.dots} />
          </g>
          <g ref={lastRef} className={d.last}>
            <g>
              <circle className={d.lastRing} r={5} />
              <circle className={d.lastDot} r={4.5} />
            </g>
          </g>
          <g className={d.cross} data-on={hp ? "" : undefined} style={{ transform: `translateX(${hx.toFixed(2)}px)` }}>
            <line y1={PAD.t - 6} y2={geo.base} />
            <circle r={5.5} cy={hy} />
          </g>
        </svg>
      ) : null}
      <div className={d.hit} style={{ left: padL, right: PAD.r, top: 0, bottom: PAD.b }} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} aria-hidden="true" />
      <div className={d.tip} data-on={hp ? "" : undefined} style={{ width: tipW, transform: `translate(${tipX.toFixed(1)}px, 0)` }} aria-hidden="true">
        {hp ? <><span className={d.tipT}>{dayLabelLong(hp.t)}</span><span className={d.tipV}>{describe(hp.v)}</span></> : null}
      </div>
      <span className={d.srOnly} aria-live="polite">{hp ? `${dayLabelLong(hp.t)}: ${describe(hp.v)}` : ""}</span>
    </div>
  );
}
