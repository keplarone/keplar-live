"use client";

import { useEffect, useRef, useState } from "react";
import { Orb } from "./Orb";
import s from "./product-tiles.module.css";

/**
 * The storefront's product grid, right under the hero: one tile per part of the workspace (Chat, Build, Agents, Research,
 * Design), each with a small moving example of that module and a link to explore it, plus the "Several models" sphere (Orb.tsx).
 * Every example tile is marked "Example": the content shows how the module works, not a customer's data. Motion runs only while the grid is on screen and stops for
 * people who prefer reduced motion (every tile then shows its finished state).
 */

function useLive<T extends Element>() {
  const ref = useRef<T | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, on] as const;
}

/** A counter that steps while `on`, looping with a pause at `max`. Off (or reduced motion) it rests at `max`, the finished state. */
function useStep(on: boolean, max: number, every: number) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => setI((x) => (x + 1) % (max + 6)), every);
    return () => window.clearInterval(id);
  }, [on, max, every]);
  return on ? Math.min(i, max) : max;
}

function Tile({ title, href, wide, example = true, children }: { title: string; href: string; wide?: boolean; example?: boolean; children: React.ReactNode }) {
  return (
    <article className={s.tile} data-wide={wide || undefined}>
      {example ? <span className={s.example}>Example</span> : null}
      <div className={s.stage}>{children}</div>
      <a href={href} className={s.foot}>
        <span className={s.title}>{title}</span>
        <span className={s.explore}>Explore <span aria-hidden="true">→</span></span>
      </a>
    </article>
  );
}

const CHAT = [
  { me: true, text: "Which of our plans had the most upgrades last month?" },
  { me: false, text: "Growth, with 41 upgrades from Starter. Most came after the pricing page change on the 12th.", cite: "Orders · Analytics" },
  { me: true, text: "Draft a note to the team about it." },
  { me: false, text: "Done. It's in the project notes, ready for you to edit and send." },
];

function ChatTile({ on }: { on: boolean }) {
  const n = useStep(on, CHAT.length, 1500);
  return (
    <div className={s.chat}>
      {CHAT.map((m, i) => (
        <p key={i} className={s.bubble} data-me={m.me || undefined} data-in={i < n || undefined}>
          {m.text}
          {m.cite ? <span className={s.cite}>{m.cite}</span> : null}
        </p>
      ))}
    </div>
  );
}

const BUILD: { k: "cmd" | "think" | "tool" | "agent" | "done" | "edit"; a: string; b?: string; c?: string }[] = [
  { k: "cmd", a: "Add a promo code field to checkout" },
  { k: "think", a: "Thinking…" },
  { k: "tool", a: "read_file", b: "src/app/checkout/page.tsx", c: "84 lines" },
  { k: "tool", a: "grep", b: "\"orderTotal\" src/", c: "3 matches" },
  { k: "agent", a: "Write applyPromo()", b: "general", c: "running" },
  { k: "agent", a: "Add tests for discounts", b: "tests", c: "running" },
  { k: "done", a: "Edit", b: "src/lib/pricing.ts", c: "+6 −1" },
  { k: "done", a: "Run", b: "npm test -- pricing", c: "4 passed" },
];

function BuildTile({ on }: { on: boolean }) {
  const n = useStep(on, BUILD.length, 650);
  return (
    <div className={s.term}>
      <div className={s.termBar}><span>acme/storefront</span><span className={s.termRight}>agent/promo-codes</span></div>
      <div className={s.termBody}>
        {BUILD.map((l, i) => (
          <div key={i} className={s.tl} data-k={l.k} data-in={i < n || undefined}>
            {l.k === "cmd" ? <><span className={s.prompt}>❯</span>{l.a}</>
              : l.k === "think" ? <span className={s.dim}>{l.a}</span>
              : l.k === "agent" ? <><span className={s.dim}>│</span>{l.a}<span className={s.dim}>{l.b}</span><span className={s.status} data-done={n >= BUILD.length || undefined}>[{n >= BUILD.length ? "done" : l.c}]</span></>
              : <><span className={s.caret}>{l.k === "done" ? "◆" : "▸"}</span><span className={s.tool}>{l.a}</span><span className={s.path}>{l.b}</span><span className={s.dim}>{l.c}</span></>}
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentsTile({ on }: { on: boolean }) {
  const n = useStep(on, 3, 1400);
  return (
    <div className={s.agents}>
      <ul className={s.agentList}>
        <li><span className={s.agentName}>Daily brief</span><span className={s.dim}>Every day · 08:00</span></li>
        <li><span className={s.agentName}>Lead follow-up</span><span className={s.dim}>When a form is sent</span></li>
        <li><span className={s.agentName}>Refund check</span><span className={s.dim}>Every hour</span></li>
      </ul>
      <div className={s.approval} data-in={n >= 1 || undefined}>
        <p className={s.approvalHead}>Waiting for approval</p>
        <p className={s.approvalText}>Lead follow-up wants to email 12 new leads.</p>
        <div className={s.approvalActions}>
          <span className={s.btnDark}>Review</span>
          <span className={s.btnLight} data-pressed={n >= 2 || undefined}>{n >= 3 ? "Approved" : "Approve"}</span>
        </div>
      </div>
    </div>
  );
}

function ResearchTile({ on }: { on: boolean }) {
  const n = useStep(on, 4, 1100);
  return (
    <div className={s.report}>
      <p className={s.reportTitle}>Market brief: bookkeeping software for agencies</p>
      <p className={s.reportLine} data-in={n >= 1 || undefined}>Most agencies under 20 people use one general tool and add plug-ins for invoicing <sup>1</sup>.</p>
      <p className={s.reportLine} data-in={n >= 2 || undefined}>Pricing clusters around per-seat plans with a free tier <sup>2</sup> <sup>3</sup>.</p>
      <ol className={s.sources} data-in={n >= 3 || undefined}>
        <li><span>1</span>Industry survey · 2026</li>
        <li><span>2</span>Vendor pricing pages</li>
        <li><span>3</span>Public filings</li>
      </ol>
    </div>
  );
}

function DesignTile({ on }: { on: boolean }) {
  const n = useStep(on, 2, 1600);
  const mode = ["Design", "Code", "AI"][n];
  return (
    <div className={s.canvas}>
      <div className={s.modes} role="presentation">
        {["Design", "Code", "AI"].map((m) => <span key={m} data-on={m === mode || undefined}>{m}</span>)}
      </div>
      <div className={s.frame}>
        <div className={s.wNav}><i /><i /><i /><i /></div>
        <div className={s.wHero} data-sel={mode === "Design" || undefined}>
          <i className={s.wH1} /><i className={s.wP} /><i className={s.wBtn} />
          {mode === "Design" ? <><b className={s.h} data-c="tl" /><b className={s.h} data-c="tr" /><b className={s.h} data-c="bl" /><b className={s.h} data-c="br" /></> : null}
        </div>
        <div className={s.wGrid}><i /><i /><i /></div>
        {mode === "Code" ? <pre className={s.code}>{`<section class="hero">\n  <h1>Spring menu</h1>\n  <a class="btn">Order</a>\n</section>`}</pre> : null}
        {mode === "AI" ? <p className={s.ai}>Make the hero warmer and the button larger.</p> : null}
      </div>
    </div>
  );
}

export function ProductTiles() {
  const [ref, on] = useLive<HTMLDivElement>();
  return (
    <div ref={ref} className={s.grid}>
      <Tile title="Chat" href="/work"><ChatTile on={on} /></Tile>
      <Tile title="Build" href="#product"><BuildTile on={on} /></Tile>
      <Tile title="Agents" href="#control"><AgentsTile on={on} /></Tile>
      <Tile title="Deep Research" href="#product"><ResearchTile on={on} /></Tile>
      <Tile title="Design Canvas" href="#product"><DesignTile on={on} /></Tile>
      <Tile title="Several models" href="#product" example={false}><Orb className={s.orb} /></Tile>
    </div>
  );
}

export type DemoKind = "chat" | "build" | "agents" | "research" | "design";

/** One of the tile examples at full size, for the Product section's feature rows. It animates only while on screen. */
export function ProductDemo({ kind }: { kind: DemoKind }) {
  const [ref, on] = useLive<HTMLDivElement>();
  const Demo = { chat: ChatTile, build: BuildTile, agents: AgentsTile, research: ResearchTile, design: DesignTile }[kind];
  return (
    <div ref={ref} className={s.demo} data-kind={kind}>
      <span className={s.example}>Example</span>
      <div className={s.demoStage}><Demo on={on} /></div>
    </div>
  );
}
