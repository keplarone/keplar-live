"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { tryHref } from "@/lib/site";
import { askFromMarks, markBounds, type Mark, type MarkKind, type Pt } from "./draw";
import s from "./DesktopDock.module.css";

type Panel = "chat" | "draw" | "stats" | null;

type Stats = {
  revenue: { last30: number; currency: string };
  orders: { last30: number };
  leads: { last30: number };
  traffic: { last14: number };
  conversion: { windowDays: number; rate: number | null };
};

function money(cents: number, currency: string) {
  const code = currency?.toLowerCase() === "usd" ? "USD" : "USD";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format((Number(cents) || 0) / 100);
}

function wordsIn(rect: { left: number; top: number; width: number; height: number }): string {
  if (!document.body) return "";
  const left = rect.left - 8;
  const top = rect.top - 8;
  const right = rect.left + rect.width + 8;
  const bottom = rect.top + rect.height + 8;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const skip = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA"]);
  const hits: { text: string; top: number; left: number }[] = [];
  let n = walker.nextNode();
  while (n && hits.length < 80) {
    const parent = n.parentElement;
    const raw = n.nodeValue?.replace(/\s+/g, " ").trim();
    if (parent && raw && !skip.has(parent.tagName) && !parent.closest("[data-keplar-dock]")) {
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        if (r.right > left && r.left < right && r.bottom > top && r.top < bottom) {
          hits.push({ text: raw, top: r.top, left: r.left });
          break;
        }
      }
    }
    n = walker.nextNode();
  }
  const seen = new Set<string>();
  return hits
    .sort((a, b) => a.top - b.top || a.left - b.left)
    .filter((h) => (seen.has(h.text) ? false : (seen.add(h.text), true)))
    .map((h) => h.text)
    .join(" ")
    .slice(0, 1200);
}

function useWideDesktop() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1100px)");
    const sync = () => setOn(mq.matches || document.documentElement.getAttribute("data-desktop") === "1");
    sync();
    mq.addEventListener("change", sync);
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-desktop"] });
    return () => { mq.removeEventListener("change", sync); obs.disconnect(); };
  }, []);
  return on;
}

export function DesktopDock() {
  const path = usePathname() || "/";
  const wide = useWideDesktop();
  const [pro, setPro] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [draft, setDraft] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsErr, setStatsErr] = useState("");
  const [tool, setTool] = useState<MarkKind>("pen");
  const [marks, setMarks] = useState<Mark[]>([]);
  const [live, setLive] = useState<Mark | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const liveRef = useRef<Mark | null>(null);

  useEffect(() => {
    if (!wide || path.startsWith("/embed")) return;
    let cancel = false;
    void fetch("/api/compute", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { plan?: string } | null) => {
        if (!cancel && (d?.plan === "pro" || d?.plan === "business")) setPro(true);
      })
      .catch(() => {});
    return () => { cancel = true; };
  }, [wide, path]);

  useEffect(() => {
    if (panel !== "stats" || stats || statsErr) return;
    let cancel = false;
    void fetch("/api/business/dashboard", { credentials: "same-origin" })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 401 ? "Sign in again to see these numbers." : "Couldn't load these numbers.");
        return r.json() as Promise<Stats>;
      })
      .then((d) => { if (!cancel) setStats(d); })
      .catch((e: Error) => { if (!cancel) setStatsErr(e.message || "Couldn't load these numbers."); });
    return () => { cancel = true; };
  }, [panel, stats, statsErr]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || panel !== "draw") return;
    const paint = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.floor(c.clientWidth * dpr);
      c.height = Math.floor(c.clientHeight * dpr);
      const g = c.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, c.clientWidth, c.clientHeight);
      g.lineWidth = 2.5;
      g.strokeStyle = "#5ecad8";
      g.lineJoin = "round";
      g.lineCap = "round";
      for (const m of [...marks, ...(live ? [live] : [])]) stroke(g, m);
    };
    paint();
    window.addEventListener("resize", paint);
    return () => window.removeEventListener("resize", paint);
  }, [panel, marks, live]);

  if (!wide || path.startsWith("/embed")) return null;

  const open = (next: Panel) => setPanel((cur) => (cur === next ? null : next));
  const go = (q: string) => {
    const text = q.trim().slice(0, 4000);
    if (!text) return;
    window.location.href = `${tryHref}#q=${encodeURIComponent(text)}`;
  };
  const askDrawing = () => {
    const all = live ? [...marks, live] : marks;
    const usable = all.filter((m) => { const b = markBounds(m); return b.width > 8 || b.height > 8; });
    if (!usable.length) return;
    go(askFromMarks(usable.map((m) => ({ kind: m.kind, words: wordsIn(markBounds(m)) }))));
  };
  const remember = (next: Mark | null) => { liveRef.current = next; setLive(next); };
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = { x: e.clientX, y: e.clientY };
    remember(tool === "pen" ? { kind: "pen", a: p, b: p, points: [p] } : { kind: tool, a: p, b: p });
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !liveRef.current) return;
    const p = { x: e.clientX, y: e.clientY };
    const cur = liveRef.current;
    remember(cur.kind === "pen" ? { ...cur, b: p, points: [...(cur.points ?? []), p] } : { ...cur, b: p });
  };
  const up = () => {
    drawing.current = false;
    const cur = liveRef.current;
    liveRef.current = null;
    setLive(null);
    if (cur) setMarks((list) => [...list, cur].slice(-24));
  };

  return (
    <div className={s.dock} data-keplar-dock="">
      {panel === "chat" && (
        <form className={s.panel} role="dialog" aria-label="Quick ask" onSubmit={(e) => { e.preventDefault(); go(draft); }}>
          <header className={s.head}><h2>Ask Keplar</h2><button type="button" className={s.x} onClick={() => setPanel(null)} aria-label="Close">×</button></header>
          <textarea className={s.input} rows={3} value={draft} placeholder="Ask anything" aria-label="Ask anything" onChange={(e) => setDraft(e.target.value)} />
          <p className={s.note}>Opens in Ask. Nothing is sent until you press Send.</p>
          <button type="submit" className={s.primary} disabled={!draft.trim()}>Send</button>
        </form>
      )}
      {panel === "stats" && (
        <section className={s.panel} role="dialog" aria-label="Business stats">
          <header className={s.head}><h2>Business</h2><button type="button" className={s.x} onClick={() => setPanel(null)} aria-label="Close">×</button></header>
          {!stats && !statsErr && <p className={s.note}>Loading…</p>}
          {statsErr && <p className={s.err} role="alert">{statsErr}</p>}
          {stats && (
            <dl className={s.stats}>
              <div><dt>Revenue, 30 days</dt><dd>{money(stats.revenue?.last30, stats.revenue?.currency)}</dd></div>
              <div><dt>Orders, 30 days</dt><dd>{stats.orders?.last30 ?? 0}</dd></div>
              <div><dt>Leads, 30 days</dt><dd>{stats.leads?.last30 ?? 0}</dd></div>
              <div><dt>Views, 14 days</dt><dd>{stats.traffic?.last14 ?? 0}</dd></div>
              <div><dt>Conversion, {stats.conversion?.windowDays ?? 14} days</dt><dd>{stats.conversion?.rate == null ? "—" : `${(stats.conversion.rate * 100).toFixed(1)}%`}</dd></div>
            </dl>
          )}
        </section>
      )}
      {panel === "draw" && (
        <div className={s.draw} role="dialog" aria-label="Draw on this page">
          <canvas ref={canvasRef} className={s.sheet} onPointerDown={down} onPointerMove={move} onPointerUp={up} />
          <div className={s.tools}>
            {(["pen", "rect", "ellipse", "arrow"] as const).map((k) => (
              <button key={k} type="button" className={tool === k ? s.toolOn : s.tool} onClick={() => setTool(k)}>{k === "pen" ? "Pen" : k === "rect" ? "Rectangle" : k === "ellipse" ? "Ellipse" : "Arrow"}</button>
            ))}
            <button type="button" className={s.tool} onClick={() => { setMarks([]); setLive(null); }}>Clear</button>
            <button type="button" className={s.primary} onClick={askDrawing} disabled={!marks.length && !live}>Ask about this</button>
            <button type="button" className={s.x} onClick={() => setPanel(null)} aria-label="Close">×</button>
          </div>
          <p className={s.drawNote}>Draw on this page. Ask sends the words under each shape, not the picture.</p>
        </div>
      )}
      <div className={s.bar}>
        <button type="button" className={s.pill} onClick={() => open("chat")}>Chat</button>
        <button type="button" className={s.pill} onClick={() => open("draw")}>Draw</button>
        {pro && <button type="button" className={s.pill} onClick={() => open("stats")}>Stats</button>}
      </div>
    </div>
  );
}

function stroke(g: CanvasRenderingContext2D, m: Mark) {
  g.beginPath();
  if (m.kind === "pen" && m.points && m.points.length) {
    g.moveTo(m.points[0].x, m.points[0].y);
    for (const p of m.points.slice(1)) g.lineTo(p.x, p.y);
  } else if (m.kind === "ellipse") {
    const b = markBounds(m);
    g.ellipse(b.left + b.width / 2, b.top + b.height / 2, Math.max(1, b.width / 2), Math.max(1, b.height / 2), 0, 0, Math.PI * 2);
  } else if (m.kind === "arrow") {
    arrow(g, m.a, m.b);
  } else {
    const b = markBounds(m);
    g.rect(b.left, b.top, b.width, b.height);
  }
  g.stroke();
}

function arrow(g: CanvasRenderingContext2D, a: Pt, b: Pt) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  const head = 14;
  g.moveTo(b.x, b.y);
  g.lineTo(b.x - head * Math.cos(ang - 0.4), b.y - head * Math.sin(ang - 0.4));
  g.moveTo(b.x, b.y);
  g.lineTo(b.x - head * Math.cos(ang + 0.4), b.y - head * Math.sin(ang + 0.4));
}
