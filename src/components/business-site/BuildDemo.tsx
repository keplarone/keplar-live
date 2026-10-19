"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import s from "./build-demo.module.css";

/**
 * The storefront's product demo: one representative coding session in the Keplar Business workspace, labelled as a demo.
 * Six stages (understand, inspect, edit, test, preview, review), each with its own pane. It plays only while on screen and
 * the tab is visible, pauses on hover or focus, and any click on a stage or tab takes over (autoplay stops until Play).
 * With reduced motion it never autoplays and every pane shows complete.
 */

type Stage = { id: string; tab: string; label: string; note: string; ticks: number };

const STAGES: Stage[] = [
  { id: "plan", tab: "Plan", label: "Understand the task", note: "Read the request and wrote a plan", ticks: 26 },
  { id: "files", tab: "Files", label: "Inspect the code", note: "Read 3 files, found where totals are computed", ticks: 26 },
  { id: "edit", tab: "pricing.ts", label: "Write the change", note: "Edited pricing.ts and checkout/page.tsx", ticks: 40 },
  { id: "test", tab: "Terminal", label: "Run the tests", note: "4 tests passed", ticks: 36 },
  { id: "preview", tab: "Preview", label: "Open a live preview", note: "Checked the checkout page at localhost:3000", ticks: 30 },
  { id: "review", tab: "Review", label: "Hand over for review", note: "3 files changed, ready for your approval", ticks: 46 },
];

const TASK = "Add a promo code field to checkout. Discounts should never push the total below zero.";

const PLAN = [
  "Find where the order total is computed",
  "Add applyPromo() to src/lib/pricing.ts with a floor at zero",
  "Add the code field to the checkout page",
  "Cover valid, expired and oversized discounts with tests",
  "Check the page in a live preview",
];

const TREE: { path: string; depth: number; dir?: boolean; read?: string }[] = [
  { path: "src", depth: 0, dir: true },
  { path: "app/checkout", depth: 1, dir: true },
  { path: "page.tsx", depth: 2, read: "84 lines" },
  { path: "lib", depth: 1, dir: true },
  { path: "pricing.ts", depth: 2, read: "41 lines" },
  { path: "cart.ts", depth: 2 },
  { path: "tests", depth: 0, dir: true },
  { path: "pricing.test.ts", depth: 1, read: "36 lines" },
];

type Tok = [string, string?];
type Line = { n: number; kind?: "add" | "del"; toks: Tok[] };
const DIFF: Line[] = [
  { n: 18, toks: [["export function ", "k"], ["orderTotal", "f"], ["(cart: Cart) {"]] },
  { n: 19, kind: "del", toks: [["  return ", "k"], ["sum(cart.items);"]] },
  { n: 19, kind: "add", toks: [["  return ", "k"], ["applyPromo", "f"], ["(sum(cart.items), cart.promo);"]] },
  { n: 20, toks: [["}"]] },
  { n: 21, toks: [[""]] },
  { n: 22, kind: "add", toks: [["export function ", "k"], ["applyPromo", "f"], ["(subtotal: number, promo?: Promo) {"]] },
  { n: 23, kind: "add", toks: [["  if ", "k"], ["(!promo || promo.expiresAt < Date.now()) "], ["return ", "k"], ["subtotal;"]] },
  { n: 24, kind: "add", toks: [["  const ", "k"], ["off = promo.percent ? subtotal * promo.percent / "], ["100", "n"], [" : promo.amount;"]] },
  { n: 25, kind: "add", toks: [["  return ", "k"], ["Math.max("], ["0", "n"], [", round(subtotal - off));"]] },
  { n: 26, kind: "add", toks: [["}"]] },
];

const TERM: { text: string; tone?: "ok" | "dim" | "cmd" }[] = [
  { text: "$ npm test -- pricing", tone: "cmd" },
  { text: "  pricing.test.ts", tone: "dim" },
  { text: "  ✓ applies a percentage code (2 ms)", tone: "ok" },
  { text: "  ✓ ignores an expired code", tone: "ok" },
  { text: "  ✓ never returns a negative total", tone: "ok" },
  { text: "  ✓ keeps totals without a code unchanged", tone: "ok" },
  { text: "" },
  { text: "  Tests  4 passed (4)", tone: "ok" },
  { text: "  Time   0.41 s", tone: "dim" },
];

const REVIEW = [
  { file: "src/lib/pricing.ts", add: 6, del: 1 },
  { file: "src/app/checkout/page.tsx", add: 19, del: 3 },
  { file: "tests/pricing.test.ts", add: 28, del: 0 },
];

function useInView<T extends Element>() {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setSeen(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, seen] as const;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return reduced;
}

const reveal = (t: number, total: number, ticks: number, lead = 4) => Math.max(0, Math.min(total, Math.floor(((t - lead) / (ticks - lead - 8)) * total)));

export function BuildDemo() {
  const [root, inView] = useInView<HTMLDivElement>();
  const reduced = useReducedMotion();
  const [{ stage, t }, setPos] = useState({ stage: 0, t: 0 });
  const [auto, setAuto] = useState(true);
  const [held, setHeld] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const on = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  const playing = auto && !reduced && !held && inView && visible;
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setPos((p) => (p.t + 1 < STAGES[p.stage].ticks ? { stage: p.stage, t: p.t + 1 } : { stage: (p.stage + 1) % STAGES.length, t: 0 }));
    }, 90);
    return () => window.clearInterval(id);
  }, [playing]);

  // A person choosing a stage takes over: show it complete and stop autoplay until they press Play.
  const choose = useCallback((i: number) => { setPos({ stage: i, t: STAGES[i].ticks }); setAuto(false); }, []);
  const full = reduced || !auto ? Infinity : t;
  const cur = STAGES[stage];

  return (
    <div
      ref={root}
      className={s.demo}
      data-kb-dark=""
      role="group"
      aria-roledescription="product demo"
      aria-label="Demo: an example coding session in Keplar Business"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false); }}
    >
      <div className={s.chrome}>
        <span className={s.repo}><span className={s.mono}>acme/storefront</span><span className={s.branch}>agent/promo-codes</span></span>
        <span className={s.tag}>Demo · example session</span>
      </div>

      <div className={s.body}>
        <aside className={s.thread} aria-label="Conversation">
          <p className={s.ask}>{TASK}</p>
          <ol className={s.steps}>
            {STAGES.map((x, i) => {
              const state = i < stage ? "done" : i === stage ? "now" : "next";
              return (
                <li key={x.id} data-state={state}>
                  <button type="button" className={s.step} onClick={() => choose(i)} aria-current={i === stage ? "step" : undefined}>
                    <span className={s.stepMark} aria-hidden="true">{state === "done" ? <Check /> : state === "now" ? <span className={s.pulse} /> : <span className={s.hollow} />}</span>
                    <span className={s.stepText}>
                      <span className={s.stepLabel}>{x.label}</span>
                      {state !== "next" ? <span className={s.stepNote}>{x.note}</span> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className={s.composer} aria-hidden="true"><span>Ask for a follow-up…</span><kbd>↵</kbd></div>
        </aside>

        <section className={s.pane} aria-label={`${cur.label} (demo)`}>
          <div className={s.tabs} role="tablist" aria-label="Workspace panes">
            {STAGES.map((x, i) => (
              <button key={x.id} type="button" role="tab" aria-selected={i === stage} tabIndex={i === stage ? 0 : -1} className={s.tab} onClick={() => choose(i)}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                  e.preventDefault();
                  const next = (i + (e.key === "ArrowRight" ? 1 : STAGES.length - 1)) % STAGES.length;
                  choose(next);
                  (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
                }}
              >
                {x.tab}
              </button>
            ))}
          </div>
          <div className={s.view} key={cur.id} role="tabpanel" aria-label={cur.tab}>
            {cur.id === "plan" ? <PlanView n={reveal(full, PLAN.length, cur.ticks)} />
              : cur.id === "files" ? <FilesView n={reveal(full, TREE.filter((x) => x.read).length, cur.ticks)} />
              : cur.id === "edit" ? <EditView n={reveal(full, DIFF.filter((x) => x.kind).length, cur.ticks)} />
              : cur.id === "test" ? <TermView n={reveal(full, TERM.length, cur.ticks, 2)} />
              : cur.id === "preview" ? <PreviewView applied={full >= 14} />
              : <ReviewView n={reveal(full, REVIEW.length + 2, cur.ticks)} />}
          </div>
        </section>
      </div>

      <div className={s.scrub}>
        <button type="button" className={s.play} onClick={() => { if (!auto) { setAuto(true); setPos((p) => ({ stage: p.stage, t: 0 })); } else setAuto(false); }} aria-label={auto && !reduced ? "Pause demo" : "Play demo"} disabled={reduced}>
          {auto && !reduced ? <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="1.5" width="2.6" height="9" rx="0.6" fill="currentColor" /><rect x="7.4" y="1.5" width="2.6" height="9" rx="0.6" fill="currentColor" /></svg>
            : <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.8v8.4a.6.6 0 0 0 .9.5l6.6-4.2a.6.6 0 0 0 0-1L3.9 1.3a.6.6 0 0 0-.9.5z" fill="currentColor" /></svg>}
        </button>
        <div className={s.bars} aria-hidden="true">
          {STAGES.map((x, i) => (
            <span key={x.id} className={s.bar} data-now={i === stage || undefined} data-done={i < stage || undefined}><i style={{ transform: `scaleX(${i < stage ? 1 : i > stage ? 0 : Math.min(1, full / x.ticks)})` }} /></span>
          ))}
        </div>
        <span className={s.counter}>{stage + 1}/{STAGES.length}</span>
      </div>
    </div>
  );
}

const Check = () => <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;

function PlanView({ n }: { n: number }) {
  return (
    <div className={s.plan}>
      <p className={s.caption}>Plan</p>
      <ol>{PLAN.map((p, i) => <li key={p} data-in={i < n || undefined}>{p}</li>)}</ol>
    </div>
  );
}

function FilesView({ n }: { n: number }) {
  let seen = 0;
  return (
    <ul className={s.tree}>
      {TREE.map((x) => {
        const on = x.read ? seen++ < n : false;
        return (
          <li key={`${x.depth}-${x.path}`} style={{ paddingLeft: 12 + x.depth * 16 }} data-dir={x.dir || undefined} data-read={on || undefined}>
            <span className={s.treeIcon} aria-hidden="true">{x.dir ? "▾" : "·"}</span>
            <span>{x.path}</span>
            {on ? <span className={s.treeRead}>read · {x.read}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

function EditView({ n }: { n: number }) {
  let seen = 0;
  return (
    <div className={s.code}>
      {DIFF.map((l, i) => {
        if (l.kind === "add" && seen++ >= n) return null;
        if (l.kind === "del" && n === 0) return <div key={i} className={s.line}><span className={s.ln}>{l.n}</span><span className={s.sign} /><code>{l.toks.map(([x, c], j) => <span key={j} className={c ? s[c] : undefined}>{x}</span>)}</code></div>;
        return (
          <div key={i} className={s.line} data-kind={l.kind}>
            <span className={s.ln}>{l.n}</span>
            <span className={s.sign}>{l.kind === "add" ? "+" : l.kind === "del" ? "−" : ""}</span>
            <code>{l.toks.map(([x, c], j) => <span key={j} className={c ? s[c] : undefined}>{x}</span>)}</code>
          </div>
        );
      })}
      {n < DIFF.filter((x) => x.kind === "add").length ? <span className={s.caret} aria-hidden="true" /> : null}
    </div>
  );
}

function TermView({ n }: { n: number }) {
  return (
    <div className={s.term}>
      {TERM.slice(0, n).map((l, i) => <div key={i} data-tone={l.tone}>{l.text || " "}</div>)}
      {n < TERM.length ? <span className={s.caret} aria-hidden="true" /> : null}
    </div>
  );
}

function PreviewView({ applied }: { applied: boolean }) {
  return (
    <div className={s.browser}>
      <div className={s.url}><span className={s.mono}>localhost:3000/checkout</span></div>
      <div className={s.page}>
        <div className={s.card}>
          <p className={s.cardTitle}>Order summary</p>
          <dl>
            <div><dt>Subtotal</dt><dd>$120.00</dd></div>
            <div className={s.promo}><dt>Promo code</dt><dd><span className={s.input}>SPRING20</span><span className={s.applied} data-on={applied || undefined}>{applied ? "Applied" : "Apply"}</span></dd></div>
            <div data-dim={!applied || undefined}><dt>Discount</dt><dd>{applied ? "−$24.00" : "—"}</dd></div>
            <div className={s.total}><dt>Total</dt><dd>{applied ? "$96.00" : "$120.00"}</dd></div>
          </dl>
        </div>
      </div>
    </div>
  );
}

function ReviewView({ n }: { n: number }) {
  return (
    <div className={s.review}>
      <p className={s.caption}>Ready for review</p>
      <ul className={s.files}>
        {REVIEW.map((f, i) => (
          <li key={f.file} data-in={i < n || undefined}>
            <span className={s.mono}>{f.file}</span>
            <span className={s.delta}><span className={s.plus}>+{f.add}</span><span className={s.minus}>−{f.del}</span></span>
          </li>
        ))}
      </ul>
      <dl className={s.checks} data-in={n > REVIEW.length || undefined}>
        <div><dt>Tests</dt><dd>4 passed</dd></div>
        <div><dt>Preview</dt><dd>Checked</dd></div>
        <div><dt>Branch</dt><dd className={s.mono}>agent/promo-codes</dd></div>
      </dl>
      <div className={s.actions} data-in={n > REVIEW.length + 1 || undefined}>
        <span className={s.ghost}>View diff</span>
        <span className={s.solid}>Approve and merge</span>
      </div>
    </div>
  );
}
