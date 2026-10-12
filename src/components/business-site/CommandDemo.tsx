"use client";

import { useEffect, useState } from "react";
import s from "./business-site.module.css";

/**
 * The storefront hero's command center: what the Business workspace looks like with an example company's numbers. Everything in
 * it is sample data and the panel says so in its header; it moves (a ticking clock, agents progressing, commands being typed,
 * the sparkline redrawing) so the page shows the product working, and holds still for people who prefer reduced motion.
 */
const COMMANDS = [
  "research competitor pricing in Austin and cite every page",
  "draft follow-ups for the 31 open leads, hold for my approval",
  "build the spring landing page and deploy it to the domain",
  "reason through hiring a second support rep vs. an agent",
];
const AGENTS = [
  { name: "Outreach", task: "drafting follow-up emails", tone: "ai" },
  { name: "Revenue Guard", task: "replaying checkout and refunds", tone: "ok" },
  { name: "Research", task: "reading 14 competitor pages", tone: "accent" },
] as const;
const SERIES = [18, 22, 19, 26, 31, 28, 34, 39, 36, 44, 41, 48, 52, 49, 57, 61];

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return reduced;
}

function Spark({ data }: { data: number[] }) {
  const max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${36 - ((v - min) / Math.max(1, max - min)) * 32}`);
  return (
    <svg className={s.demoSpark} viewBox="0 0 100 38" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="bz-spark-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity="0.35" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient>
      </defs>
      <polygon points={`0,38 ${pts.join(" ")} 100,38`} fill="url(#bz-spark-fill)" />
      <polyline points={pts.join(" ")} fill="none" stroke="currentColor" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function CommandDemo() {
  const reduced = useReducedMotion();
  const [tick, setTick] = useState(0);
  const [typed, setTyped] = useState(0);
  const [clock, setClock] = useState("");

  useEffect(() => {
    const show = () => setClock(new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    show();
    const t = window.setInterval(show, 1000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (reduced) return;
    const t = window.setInterval(() => setTick((x) => x + 1), 1600);
    return () => window.clearInterval(t);
  }, [reduced]);
  const cmd = COMMANDS[Math.floor(tick / 6) % COMMANDS.length]!;
  useEffect(() => {
    if (reduced) return;
    let i = 0;
    const t = window.setInterval(() => { i += 1; setTyped(i); if (i >= cmd.length) window.clearInterval(t); }, 34);
    return () => { window.clearInterval(t); setTyped(0); };
  }, [cmd, reduced]);

  const series = reduced ? SERIES : SERIES.map((v, i) => v + ((i * 7 + tick * 3) % 5) - 2);
  const progress = AGENTS.map((_, i) => (reduced ? [72, 40, 88][i]! : (tick * (9 + i * 4) + i * 30) % 100));
  const revenue = 48210 + (reduced ? 0 : (tick % 12) * 37);

  return (
    <figure className={s.demo} aria-label="Example of the Keplar Business workspace with sample data">
      <div className={s.demoHead}>
        <span className={s.demoTitle}><span className={s.live} aria-hidden="true" />Workspace</span>
        <span className={s.demoSample}>Sample data</span>
        <span className={s.demoClock} aria-hidden="true">{clock}</span>
      </div>
      <div className={s.demoKpis}>
        <div className={s.kpi}>
          <span className={s.kpiLabel}>Revenue · 30d</span>
          <span className={s.kpiValue}>${revenue.toLocaleString("en-US")}</span>
          <span className={s.kpiDelta} data-tone="up">▲ 12.4%</span>
        </div>
        <div className={s.kpi}>
          <span className={s.kpiLabel}>Open leads</span>
          <span className={s.kpiValue}>31</span>
          <span className={s.kpiDelta}>9 new this week</span>
        </div>
        <div className={s.kpi}>
          <span className={s.kpiLabel}>Agents live</span>
          <span className={s.kpiValue}>3<span className={s.kpiOf}>/5</span></span>
          <span className={s.kpiDelta} data-tone="ai">within budget</span>
        </div>
      </div>
      <div className={s.demoChart}>
        <span className={s.kpiLabel}>Site views · 16 days</span>
        <Spark data={series} />
      </div>
      <ul className={s.demoAgents}>
        {AGENTS.map((a, i) => (
          <li key={a.name}>
            <span className={s.agentName}><span className={s.agentDot} data-tone={a.tone} aria-hidden="true" />{a.name}</span>
            <span className={s.agentTask}>{a.task}</span>
            <span className={s.agentBar} aria-hidden="true"><i style={{ width: `${progress[i]}%` }} data-tone={a.tone} /></span>
          </li>
        ))}
      </ul>
      <div className={s.demoApproval}>
        <span className={s.approvalGlyph} aria-hidden="true">◆</span>
        <span className={s.approvalText}><strong>Approval needed</strong> · $1,200 ad budget for the spring launch</span>
        <span className={s.approvalBtn} aria-hidden="true">Review</span>
      </div>
      <div className={s.demoPrompt} aria-hidden="true">
        <span className={s.promptGlyph}>›</span>
        <span className={s.promptText}>{reduced ? cmd : cmd.slice(0, typed)}<span className={s.caret} /></span>
        <kbd className={s.promptKbd}>⌘K</kbd>
      </div>
      <figcaption className={s.srOnly}>An example workspace: revenue, leads, agents at work, an approval waiting and a command being typed. The numbers are sample data.</figcaption>
    </figure>
  );
}
