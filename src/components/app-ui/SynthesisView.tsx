"use client";

import { useEffect, useId, useState } from "react";
import { KeplarSymbol } from "@/components/brand";
import { prefersReducedMotion } from "@/lib/ui/presence";
import { modelMark } from "./model-marks";
import type { ModelTick } from "./state/types";
import s from "./SynthesisView.module.css";

/** The scene's own units: the box keeps this aspect ratio, so the SVG streams and the HTML discs line up at any width. */
const W = 440;
const H = 200;
const CX = W / 2;
const CY = H / 2;

/**
 * The consensus answer being written: every model that was asked sits on a ring around Keplar, each with its own mark.
 * Models that answered stream into the center (their answers are what is being combined); ones that failed or refused stay
 * dim with a broken line and no stream; seats still waiting are faint. The line under it names the models and says what the
 * writing step is doing right now, in plain words. Reduced motion: the same picture, still.
 */
export function SynthesisView({ models, count, disagreement }: { models: ModelTick[]; count: number; disagreement?: string }) {
  const gid = `kSynth${useId().replace(/[^A-Za-z0-9]/g, "")}`;
  const [reduced, setReduced] = useState(false);
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    const r = prefersReducedMotion();
    setReduced(r);
    if (r) return;
    const t = window.setInterval(() => setBeat((b) => b + 1), 2400);
    return () => window.clearInterval(t);
  }, []);

  const seats = Math.max(count, models.length, 2);
  const answered = models.filter((m) => m.status === "responded");
  const n = answered.length;
  // Ring radii shrink a little for big panels so the discs never touch the center.
  const rx = W * (seats > 6 ? 0.4 : 0.36);
  const ry = H * 0.38;
  // Half a step off vertical, so no disc sits straight above or below the center (those streams would be too short to see).
  const place = Array.from({ length: seats }, (_, i) => {
    const a = ((i + 0.5) / seats) * Math.PI * 2 - Math.PI / 2;
    return { x: CX + Math.cos(a) * rx, y: CY + Math.sin(a) * ry };
  });

  const names = answered.map((m) => modelMark(m.id, m.name).family).filter((f, i, all) => all.indexOf(f) === i);
  const list = names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const lines = [
    n > 1 ? `Weighing ${n} answers against each other` : "Reading the answer back",
    disagreement ? "Working out which side holds up better" : "Checking they really agree",
    "Keeping only the points that hold up",
    "Writing it up in plain words",
  ];
  const line = lines[reduced ? 0 : beat % lines.length];

  return (
    <figure className={s.wrap} data-reduced={reduced || undefined} aria-label={`Combining ${n} model answers into one`}>
      <div className={s.scene} style={{ aspectRatio: `${W} / ${H}` }}>
        <svg className={s.streams} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          <defs>
            <radialGradient id={gid}>
              <stop offset="0%" stopColor="var(--v-reasoning)" stopOpacity="0.32" />
              <stop offset="100%" stopColor="var(--v-reasoning)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx={CX} cy={CY} r={H * 0.42} fill={`url(#${gid})`} className={s.glow} />
          {place.map((p, i) => {
            const st = models[i]?.status ?? "pending";
            const path = `M ${p.x} ${p.y} L ${CX} ${CY}`;
            return (
              <g key={i} data-state={st}>
                <path d={path} className={s.line} data-state={st} />
                {st === "responded" && !reduced
                  ? [0, 1].map((k) => (
                      <circle key={k} r="2.6" className={s.packet}>
                        <animateMotion dur="1.8s" repeatCount="indefinite" begin={`${(i * 0.37 + k * 0.9).toFixed(2)}s`} path={path} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.4 0 0.6 1" />
                        <animate attributeName="opacity" dur="1.8s" repeatCount="indefinite" begin={`${(i * 0.37 + k * 0.9).toFixed(2)}s`} values="0;1;1;0" keyTimes="0;0.15;0.8;1" />
                      </circle>
                    ))
                  : null}
              </g>
            );
          })}
        </svg>

        {place.map((p, i) => {
          const m = models[i];
          const st = m?.status ?? "pending";
          const mark = m ? modelMark(m.id, m.name) : null;
          return (
            <span
              key={i}
              className={s.seat}
              data-state={st}
              title={m ? `${m.name}${st === "responded" ? "" : st === "refused" ? " (declined)" : st === "failed" ? " (didn't answer)" : ""}` : undefined}
              style={{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%`, "--dx": `${CX - p.x}px`, "--dy": `${CY - p.y}px`, "--i": i } as React.CSSProperties}
            >
              <span className={s.disc}>
                {mark?.kind === "logo" ? <img src={mark.src} alt="" width={18} height={18} /> : mark ? <span className={s.mono}>{mark.text}</span> : null}
              </span>
            </span>
          );
        })}

        <span className={s.core} aria-hidden="true">
          <span className={s.ring} />
          <span className={s.coreDisc}>
            <KeplarSymbol size={22} />
          </span>
        </span>
      </div>
      <figcaption className={s.caption}>
        <span className={s.headline} key={line}>{line}…</span>
        {list ? <span className={s.sub}>Combining {list} into one answer</span> : null}
      </figcaption>
    </figure>
  );
}
