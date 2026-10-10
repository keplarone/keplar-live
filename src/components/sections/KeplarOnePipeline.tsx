"use client";

import { brand } from "@/lib/site";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { KeplarSymbol } from "@/components/brand";
import { color } from "@/lib/tokens";
import { pipeline, type PipelineStage } from "@/lib/sections";
import s from "./KeplarOnePipeline.module.css";

/*
 * A spatial pipeline, not a flowchart: one stream enters, fans into the lanes
 * Keplar-One selects (unselected candidates stop short), one warm lane dissents
 * and is pulled back in at verification, and a single stream leaves as the answer.
 * Geometry is authored on a floor plane and tilted in CSS for depth.
 */

const W = 1200;
const H = 420;
const MID = 210;
const X: Record<PipelineStage["id"], number> = {
  prompt: 70, classify: 235, route: 400, compare: 650, verify: 830, synthesize: 995, answer: 1135,
};
const LANES = [-150, -90, -30, 30, 90, 150]; // selected intelligences (index 5 dissents)
const IDLE = [-195, 195, -120]; // candidates weighed but not selected

function lanePath(offset: number, dissent: boolean) {
  const y = MID + offset;
  const dy = dissent ? MID + 150 + 40 : MID;
  return [
    `M ${X.prompt} ${MID}`,
    `L ${X.route} ${MID}`,
    `C ${X.route + 90} ${MID}, ${X.route + 120} ${y}, ${X.route + 170} ${y}`,
    `L ${X.compare} ${y}`,
    dissent
      ? `C ${X.compare + 60} ${y}, ${X.compare + 70} ${dy}, ${X.compare + 110} ${dy} C ${X.verify - 40} ${dy}, ${X.verify - 30} ${MID}, ${X.verify} ${MID}`
      : `C ${X.compare + 90} ${y}, ${X.verify - 90} ${MID}, ${X.verify} ${MID}`,
    `L ${X.answer} ${MID}`,
  ].join(" ");
}

function idlePath(offset: number) {
  const y = MID + offset;
  return `M ${X.route} ${MID} C ${X.route + 90} ${MID}, ${X.route + 110} ${y}, ${X.route + 150} ${y} L ${X.route + 210} ${y}`;
}

export function KeplarOnePipeline() {
  const [active, setActive] = useState<PipelineStage["id"]>("route");
  const svgRef = useRef<SVGSVGElement>(null);
  const uid = useId();
  const lanes = useMemo(() => LANES.map((o, i) => lanePath(o, i === 5)), []);
  const stage = pipeline.find((p) => p.id === active)!;

  // Packets: small dots travelling each lane. Paused offscreen and for reduced motion.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const paths = [...svg.querySelectorAll<SVGPathElement>("[data-lane]")];
    const dots = [...svg.querySelectorAll<SVGCircleElement>("[data-packet]")];
    const lengths = paths.map((p) => p.getTotalLength());
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const place = (t: number) => {
      dots.forEach((d) => {
        const lane = Number(d.dataset.lane);
        const off = Number(d.dataset.offset);
        const u = (t * 0.06 + off) % 1;
        const pt = paths[lane].getPointAtLength(u * lengths[lane]);
        d.setAttribute("cx", pt.x.toFixed(1));
        d.setAttribute("cy", pt.y.toFixed(1));
        // fade in at the prompt, out at the answer
        d.setAttribute("opacity", String(Math.min(1, u * 12, (1 - u) * 12)));
      });
    };
    place(0.35);
    if (reduce) return;
    let raf = 0;
    let visible = false;
    const start = performance.now();
    const loop = (now: number) => {
      place((now - start) / 1000);
      raf = visible ? requestAnimationFrame(loop) : 0;
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(loop);
    });
    io.observe(svg);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  const packets = LANES.flatMap((_, lane) => Array.from({ length: 5 }, (_, k) => ({ lane, offset: k / 5 + lane * 0.031 })));

  return (
    <div className={s.root}>
      <div className={s.plane} aria-hidden="true">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className={s.svg}>
          {/* floor grid: faint, gives the plane its depth */}
          <g className={s.grid}>
            {Array.from({ length: 13 }, (_, i) => (
              <line key={`v${i}`} x1={i * 100} y1={0} x2={i * 100} y2={H} />
            ))}
            {Array.from({ length: 6 }, (_, i) => (
              <line key={`h${i}`} x1={0} y1={i * 84} x2={W} y2={i * 84} />
            ))}
          </g>
          {IDLE.map((o) => (
            <path key={o} d={idlePath(o)} className={s.idle} />
          ))}
          {lanes.map((d, i) => (
            <path
              key={d}
              d={d}
              data-lane={i}
              className={s.lane}
              stroke={color.streams[i]}
              data-dim={active === "prompt" || active === "classify" ? true : undefined}
            />
          ))}
          {packets.map((p) => (
            <circle
              key={`${p.lane}-${p.offset}`}
              r={3.2}
              data-packet
              data-lane={p.lane}
              data-offset={p.offset}
              fill={color.streams[p.lane]}
            />
          ))}
          {pipeline.map((st) => {
            const x = X[st.id];
            const on = st.id === active;
            return (
              <g
                key={st.id}
                className={s.node}
                data-active={on || undefined}
                transform={`translate(${x} ${MID})`}
                onPointerEnter={() => setActive(st.id)}
                onClick={() => setActive(st.id)}
              >
                <circle r={26} className={s.halo} />
                <circle r={st.id === "answer" ? 18 : 9} className={s.core} />
                <text y={-44} className={s.nodeLabel} textAnchor="middle">
                  {st.name}
                </text>
              </g>
            );
          })}
          <g transform={`translate(${X.answer - 10} ${MID - 10})`} className={s.answerMark}>
            <svg width={20} height={20} viewBox="0 0 398 398">
              <rect width="229" height="229" rx="70" />
              <path d="M204.95 11.95A7 7 0 0 1 209.9 0L362 0A16 16 0 0 1 378 16L378 168.1A7 7 0 0 1 366.05 173.05Z" />
              <circle cx="281" cy="281" r="117" />
            </svg>
          </g>
        </svg>
      </div>

      <div className={s.controls}>
        <ol className={s.tabs} role="tablist" aria-label={`${brand.engineName} stages`}>
          {pipeline.map((st, i) => (
            <li key={st.id} role="presentation">
              <button
                type="button"
                role="tab"
                id={`${uid}-tab-${st.id}`}
                aria-selected={st.id === active}
                aria-controls={`${uid}-panel`}
                tabIndex={st.id === active ? 0 : -1}
                className={s.tab}
                onClick={() => setActive(st.id)}
                onFocus={() => setActive(st.id)}
                onKeyDown={(e) => {
                  const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
                  if (!dir) return;
                  e.preventDefault();
                  const next = pipeline[(i + dir + pipeline.length) % pipeline.length];
                  document.getElementById(`${uid}-tab-${next.id}`)?.focus();
                }}
              >
                <span className={s.tabIndex}>{String(i + 1).padStart(2, "0")}</span>
                <span className={s.tabName}>{st.name}</span>
              </button>
            </li>
          ))}
        </ol>

        <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-tab-${active}`} className={s.panel}>
          <div className={s.panelMain}>
            <h3 className={s.panelTitle}>
              {stage.id === "answer" ? <KeplarSymbol size={18} /> : null}
              {stage.name}
              <span className={s.panelShort}>{stage.short}</span>
            </h3>
            <p className={s.panelDetail}>{stage.detail}</p>
            {stage.id === "route" ? (
              <p className={s.formula} aria-label="Routing weighs quality times reliability times latency times cost">
                <span>Quality</span>×<span>Reliability</span>×<span>Latency</span>×<span>Cost</span>
              </p>
            ) : null}
          </div>
          <div className={s.panelExample}>
            <p className={s.exampleLabel}>In the example</p>
            <p className={s.exampleText}>{stage.example}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
