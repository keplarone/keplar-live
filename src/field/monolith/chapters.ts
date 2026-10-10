/**
 * Site chapters for the space scene: pure data + timing (no three.js, no DOM at import time).
 * See CHAPTERS.md for the host API. Every motif is drawn in a flat "motif plane" measured in units where
 * x ∈ [-4, 4] and y ∈ [-2.6, 2.6]; the layer scales that plane to the viewport. Colours index the four star families.
 */

export const CHAPTER_IDS = ["ask", "understand", "create", "together", "ship", "platform", "trust"] as const;
export type ChapterId = (typeof CHAPTER_IDS)[number];
export const isChapter = (v: unknown): v is ChapterId => typeof v === "string" && (CHAPTER_IDS as readonly string[]).includes(v);

/** Star colour families: hot blue, white, yellow, orange — the only star hues in the scene. */
export const SPECTRAL: readonly (readonly [number, number, number])[] = [[0.5, 0.67, 1.0], [1.0, 0.98, 0.95], [1.0, 0.87, 0.46], [1.0, 0.6, 0.26]];
/** Indices into SPECTRAL. */
export const C = { blue: 0, white: 1, yellow: 2, orange: 3 } as const;

export type MotifLight = {
  /** point indices walked in order */
  path: number[];
  color: number;
  /** path traversals per second */
  speed: number;
  /** 0..1 start offset */
  phase?: number;
  /** ping-pong instead of wrapping */
  bounce?: boolean;
};

export type Motif = {
  id: ChapterId;
  label: string;
  /** what the scene says, in one line (use it for aria / captions) */
  says: string;
  /** [x, y, colour, size] */
  pts: [number, number, number, number][];
  /** [a, b, flags] — flag 1: detail (dropped on mobile), flag 2: trail (only drawn up to the launch light) */
  lines: [number, number, number][];
  lights: MotifLight[];
  /** point pinned to the 3D logo's on-screen position */
  logo?: number;
  /** critic: line `line` first points at star `wrong`, then is corrected to its true end */
  fix?: { line: number; wrong: number; critic: number };
  /** ship: a light rides `path` and lights up `to` on arrival */
  launch?: { path: number[]; to: number };
  /** create: lines resolve from sketch (thin, warm) to final (bright white) */
  resolves?: boolean;
  /** draw the lines on in order with a pen light at the tip */
  pen?: number;
};

class B {
  pts: Motif["pts"] = [];
  lines: Motif["lines"] = [];
  p(x: number, y: number, c: number = C.white, s = 1) { this.pts.push([x, y, c, s]); return this.pts.length - 1; }
  l(a: number, b: number, f = 0) { this.lines.push([a, b, f]); return this.lines.length - 1; }
  chain(ix: number[], close = false, f = 0) { for (let i = 0; i < ix.length - (close ? 0 : 1); i++) this.l(ix[i], ix[(i + 1) % ix.length], f); }
  rect(x0: number, y0: number, x1: number, y1: number, c: number = C.white, s = 0.7, f = 0) {
    const r = [this.p(x0, y0, c, s), this.p(x1, y0, c, s), this.p(x1, y1, c, s), this.p(x0, y1, c, s)];
    this.chain(r, true, f);
    return r;
  }
}

const ring = (n: number) => Array.from({ length: n }, (_, i) => i);

function ask(): Motif {
  const b = new B();
  const o = b.p(0, 0, C.white, 1.8);
  const cols = [C.blue, C.yellow, C.white, C.orange, C.blue, C.yellow];
  const outer: number[] = [], mid: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.35;
    outer.push(b.p(Math.cos(a) * 3.7, Math.sin(a) * 2.3, cols[i], 1.15));
    // a bent waypoint so the trails curve in, like the story paths
    mid.push(b.p(Math.cos(a + 0.32) * 1.9, Math.sin(a + 0.32) * 1.15, cols[i], 0.45));
  }
  for (let i = 0; i < 6; i++) { b.l(outer[i], mid[i]); b.l(mid[i], o); b.l(outer[i], outer[(i + 1) % 6], 1); }
  return {
    id: "ask", label: "Ask", says: "Every question becomes trails of light converging on Keplar.",
    pts: b.pts, lines: b.lines, logo: o,
    lights: outer.map((s, i) => ({ path: [s, mid[i], o], color: cols[i], speed: 0.42, phase: i / 6 })),
  };
}

function understand(): Motif {
  const b = new B();
  const o = b.p(0, 0, C.white, 1.6);
  // link: two interlocked rhombi
  const L = (cx: number, cy: number) => { const r = [b.p(cx - 0.32, cy, C.blue, 0.6), b.p(cx, cy + 0.24, C.blue, 0.6), b.p(cx + 0.32, cy, C.blue, 0.6), b.p(cx, cy - 0.24, C.blue, 0.6)]; b.chain(r, true); return r; };
  const l1 = L(-3.35, 1.7), l2 = L(-2.85, 1.55);
  // image: frame, mountain, sun
  const im = b.rect(2.4, 1.2, 3.5, 2.05, C.yellow);
  const m = [b.p(2.5, 1.3, C.yellow, 0.45), b.p(2.85, 1.72, C.yellow, 0.55), b.p(3.05, 1.5, C.yellow, 0.45), b.p(3.25, 1.68, C.yellow, 0.5), b.p(3.42, 1.3, C.yellow, 0.45)];
  b.chain(m, false, 1); b.p(3.2, 1.88, C.orange, 0.7);
  // video: frame + play triangle
  const vd = b.rect(-3.5, -2.05, -2.4, -1.2, C.orange);
  const pl = [b.p(-3.1, -1.85, C.orange, 0.55), b.p(-3.1, -1.4, C.orange, 0.55), b.p(-2.72, -1.62, C.orange, 0.7)];
  b.chain(pl, true);
  // doc: folded page + text lines
  const d = [b.p(2.55, -2.1, C.white, 0.6), b.p(3.35, -2.1, C.white, 0.6), b.p(3.35, -1.35, C.white, 0.6), b.p(3.1, -1.1, C.white, 0.6), b.p(2.55, -1.1, C.white, 0.6)];
  b.chain(d, true); b.l(d[3], b.p(3.1, -1.35, C.white, 0.35), 1);
  for (let i = 0; i < 3; i++) b.l(b.p(2.7, -1.45 - i * 0.2, C.white, 0.3), b.p(3.2 - (i === 2 ? 0.2 : 0), -1.45 - i * 0.2, C.white, 0.3), 1);
  // streams: dotted star trails from each medium into the logo
  const anchors: [number, number, number][] = [[l2[2], -2.0, 1.15], [im[3], 1.7, 1.0], [vd[1], -1.7, -1.0], [d[4], 1.7, -1.0]];
  const cols = [C.blue, C.yellow, C.orange, C.white];
  const lights: MotifLight[] = [];
  anchors.forEach(([a, sx, sy], i) => {
    const s1 = b.p(sx, sy, cols[i], 0.4), s2 = b.p(sx * 0.55, sy * 0.55, cols[i], 0.4);
    b.l(a, s1, 0); b.l(s1, s2, 0); b.l(s2, o, 0);
    for (let k = 0; k < 2; k++) lights.push({ path: [a, s1, s2, o], color: cols[i], speed: 0.55, phase: i * 0.13 + k * 0.5 });
  });
  void l1;
  return { id: "understand", label: "Understands everything", says: "Links, images, video and docs stream in as light and are understood together.", pts: b.pts, lines: b.lines, logo: o, lights };
}

function create(): Motif {
  const b = new B();
  // a site wireframe sketched in stars: browser frame, nav, hero, image, cards
  b.rect(-3.3, -2.15, 3.3, 2.15, C.white, 0.85);
  const bar = [b.p(-3.3, 1.65, C.white, 0.4), b.p(3.3, 1.65, C.white, 0.4)]; b.l(bar[0], bar[1]);
  [C.orange, C.yellow, C.blue].forEach((c, i) => b.p(-3.05 + i * 0.22, 1.9, c, 0.55));
  b.l(b.p(1.3, 1.9, C.white, 0.3), b.p(2.95, 1.9, C.white, 0.3), 1);
  // hero copy block
  b.l(b.p(-2.85, 1.15, C.yellow, 0.55), b.p(-0.35, 1.15, C.yellow, 0.55));
  b.l(b.p(-2.85, 0.82, C.white, 0.4), b.p(-0.9, 0.82, C.white, 0.4));
  b.rect(-2.85, 0.15, -1.75, 0.5, C.orange, 0.55);
  // hero image with a diagonal
  const im = b.rect(0.15, 0.1, 2.85, 1.3, C.blue, 0.6); b.l(im[0], im[2], 1);
  // three cards
  for (let i = 0; i < 3; i++) {
    const x0 = -2.85 + i * 1.95;
    const r = b.rect(x0, -1.85, x0 + 1.75, -0.35, i === 1 ? C.yellow : C.white, 0.55);
    b.l(b.p(x0 + 0.2, -0.65, C.white, 0.3), b.p(x0 + 1.2, -0.65, C.white, 0.3), 1);
    void r;
  }
  return { id: "create", label: "Create", says: "A constellation sketches a site's wireframe, then resolves into the finished page.", pts: b.pts, lines: b.lines, lights: [], resolves: true, pen: C.yellow };
}

function together(): Motif {
  const b = new B();
  // one constellation (a long W with a tail) traced by two collaborators from either end
  const xy: [number, number, number][] = [[-3.5, 0.9, C.blue], [-2.4, -0.6, C.white], [-1.3, 0.55, C.yellow], [-0.2, -0.9, C.white], [0.9, 0.7, C.orange], [2.0, -0.4, C.white], [2.9, 0.9, C.blue], [3.6, 1.9, C.yellow]];
  const s = xy.map(([x, y, c]) => b.p(x, y, c, 1.05));
  b.chain(s);
  const wrong = b.p(1.55, -1.95, C.orange, 0.7); // the star the line first (wrongly) reaches for
  const critic = b.p(1.95, -1.25, C.yellow, 1.25); // the critic star
  return {
    id: "together", label: "Build together", says: "Two cursor-lights trace one constellation while a critic star corrects a line.",
    pts: b.pts, lines: b.lines,
    fix: { line: 4, wrong, critic },
    lights: [
      { path: s, color: C.blue, speed: 0.16, bounce: true },
      { path: [...s].reverse(), color: C.orange, speed: 0.16, bounce: true, phase: 0.12 },
    ],
  };
}

function ship(): Motif {
  const b = new B();
  const from = b.p(-3.3, -1.95, C.orange, 1.25);
  const to = b.p(3.25, 1.75, C.blue, 1.9);
  // custom-domain ring around the far star
  const rg = ring(8).map((i) => { const a = (i / 8) * Math.PI * 2; return b.p(3.25 + Math.cos(a) * 0.5, 1.75 + Math.sin(a) * 0.5, C.white, 0.35); });
  b.chain(rg, true, 1);
  // trajectory: a quadratic arc of faint dots
  const path = [from];
  const N = 16, cx = -1.2, cy = 2.4;
  for (let i = 1; i < N; i++) {
    const u = i / N, x = (1 - u) * (1 - u) * -3.3 + 2 * (1 - u) * u * cx + u * u * 3.25, y = (1 - u) * (1 - u) * -1.95 + 2 * (1 - u) * u * cy + u * u * 1.75;
    path.push(b.p(x, y, i < 6 ? C.orange : i < 11 ? C.yellow : C.white, 0.3));
  }
  path.push(to);
  for (let i = 0; i < path.length - 1; i++) b.l(path[i], path[i + 1], 2);
  // a few background stars so the far star reads as distant
  [[-1.8, -2.2], [0.6, -1.6], [2.2, -2.1], [-2.6, 1.6], [0.4, 2.3]].forEach(([x, y], i) => b.p(x, y, [C.white, C.blue, C.yellow, C.white, C.orange][i], 0.35));
  return { id: "ship", label: "Ship", says: "A light launches to a far star: deploy, with your own domain.", pts: b.pts, lines: b.lines, launch: { path, to }, lights: [] };
}

function platform(): Motif {
  const b = new B();
  const o = b.p(0, 0, C.white, 1.6);
  const hubs: [number, number, number][] = [[-3.0, 1.35, C.blue], [3.0, 1.35, C.yellow], [-3.0, -1.45, C.white], [3.0, -1.45, C.orange]]; // API, Embed, Teams, Referrals
  const h = hubs.map(([x, y, c]) => b.p(x, y, c, 1.3));
  const lights: MotifLight[] = [];
  h.forEach((n, i) => {
    b.l(o, n);
    const [x, y, c] = hubs[i];
    const sx = Math.sign(x), sy = Math.sign(y);
    if (i === 3) { // referrals: a branching tree
      const a = b.p(x - 0.15, y - 0.75, c, 0.6), a1 = b.p(x - 0.65, y - 1.0, c, 0.45), a2 = b.p(x + 0.4, y - 1.05, c, 0.45);
      b.l(n, a, 1); b.l(a, a1, 1); b.l(a, a2, 1);
    } else { // a little cluster of clients
      for (let k = 0; k < 3; k++) { const ang = (k / 3) * Math.PI * 0.9 + (sy > 0 ? 0.2 : Math.PI + 0.2) + (sx < 0 ? 0.3 : -0.3); b.l(n, b.p(x + Math.cos(ang) * 0.75, y + Math.sin(ang) * 0.55, c, 0.45), 1); }
    }
    lights.push({ path: [o, n], color: c, speed: 0.5, phase: i * 0.25 });
  });
  b.chain([h[0], h[1], h[3], h[2]], true, 1);
  return { id: "platform", label: "Platform", says: "A network constellation: API, embed, Teams and referrals all wired to one core.", pts: b.pts, lines: b.lines, logo: o, lights };
}

function trust(): Motif {
  const b = new B();
  const o = b.p(0, 0.35, C.white, 1.4);
  const cols = [C.blue, C.white, C.yellow, C.white, C.orange, C.white];
  const orb = ring(14).map((i) => { const a = (i / 14) * Math.PI * 2; return b.p(Math.cos(a) * 2.7, 0.35 + Math.sin(a) * 1.05, cols[i % cols.length], 0.45); });
  b.chain(orb, true);
  // changelog timeline: steady, evenly spaced releases, the newest the brightest
  const tl = ring(8).map((i) => b.p(-3.4 + i * (6.8 / 7), -2.15, i === 7 ? C.yellow : i % 3 === 0 ? C.blue : C.white, 0.5 + i * 0.09));
  b.chain(tl);
  return {
    id: "trust", label: "Trust & changelog", says: "A steady orbit and an even timeline of releases: reliable, and always improving.",
    pts: b.pts, lines: b.lines, logo: o,
    lights: [
      { path: [...orb, orb[0]], color: C.yellow, speed: 0.07 },
      { path: tl, color: C.blue, speed: 0.12 },
    ],
  };
}

export const MOTIFS: Record<ChapterId, Motif> = {
  ask: ask(), understand: understand(), create: create(), together: together(), ship: ship(), platform: platform(), trust: trust(),
};

const sm = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

export type ChapterState = { draw: number; resolve: number; correct: number; launch: number; arrive: number };

/**
 * Timing for a chapter. `progress` is the visitor's scroll position through the section (0 top-at-centre … 1 bottom-at-centre)
 * or null when the host only set the id, in which case the beats play on a clock. `still` = reduced motion: final state.
 */
export function chapterState(id: ChapterId, progress: number | null, elapsed: number, still = false): ChapterState {
  if (still) return { draw: 1, resolve: 1, correct: 1, launch: 1, arrive: 1 };
  const draw = sm(0, id === "create" ? 2.4 : 1.4, elapsed);
  const p = progress == null ? null : Math.min(1, Math.max(0, progress));
  const resolve = p == null ? sm(2.6, 3.6, elapsed) : Math.max(sm(0.35, 0.65, p), sm(5, 6, elapsed));
  const correct = p == null ? sm(3.2, 4.2, elapsed) : Math.max(sm(0.4, 0.62, p), sm(6, 7, elapsed));
  // ship: scroll drives the launch; on a clock it relaunches every 5 s
  const launch = p == null ? sm(0.6, 3.4, elapsed % 5) : sm(0.12, 0.7, p);
  const arrive = sm(0.9, 1, launch);
  return { draw, resolve, correct, launch, arrive };
}

/** Position along a polyline of motif points at u ∈ [0,1] (by segment count, which keeps the lights' pace even on these short paths). */
export function along(m: Motif, path: number[], u: number, out: [number, number] = [0, 0]): [number, number] {
  const n = path.length - 1;
  if (n <= 0) { const p = m.pts[path[0]]; out[0] = p[0]; out[1] = p[1]; return out; }
  const f = Math.min(0.99999, Math.max(0, u)) * n, i = Math.floor(f), k = f - i;
  const a = m.pts[path[i]], b = m.pts[path[i + 1]];
  out[0] = a[0] + (b[0] - a[0]) * k; out[1] = a[1] + (b[1] - a[1]) * k;
  return out;
}

/** Where a light is on its path at time t (seconds). */
export const lightU = (l: MotifLight, t: number) => {
  const x = t * l.speed + (l.phase ?? 0);
  if (l.bounce) { const f = x % 2; return f < 1 ? f : 2 - f; }
  return x % 1;
};

export type ChapterTarget = { setChapter(id: ChapterId | null, progress?: number | null): void };

/**
 * Connect a scene to the page: every element with `data-chapter="<id>"` drives the scene while it crosses the viewport's
 * centre line, and a `keplar:chapter` CustomEvent ({ detail: { id, progress? } }) sets it imperatively.
 * Returns a disposer. Safe to call before the sections exist (it re-scans on DOM changes).
 */
export function watchChapters(target: ChapterTarget, root: ParentNode = document): () => void {
  let els: HTMLElement[] = [];
  let raf = 0;
  let manual = false;
  let lastId: ChapterId | null | undefined;
  let lastP = -1;
  // <html data-chapter> / <body data-chapter> are page-level mirrors (ChapterSync), not sections: never treat them as one
  const scan = () => { els = Array.from(root.querySelectorAll<HTMLElement>("[data-chapter]")).filter((e) => e !== document.documentElement && e !== document.body && isChapter(e.dataset.chapter)); };
  const measure = () => {
    raf = 0;
    if (manual) return;
    const mid = window.innerHeight * 0.5;
    let id: ChapterId | null = null, p = 0;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.top <= mid && r.bottom > mid && r.height > 0) { id = el.dataset.chapter as ChapterId; p = (mid - r.top) / r.height; break; }
    }
    if (id !== lastId || (id && Math.abs(p - lastP) > 0.004)) { lastId = id; lastP = p; target.setChapter(id, id ? p : null); }
  };
  const queue = () => { if (!raf) raf = requestAnimationFrame(measure); };
  const onEvent = (e: Event) => {
    const d = (e as CustomEvent<{ id: unknown; progress?: number }>).detail ?? { id: null };
    if (d.id == null) { manual = false; lastId = undefined; queue(); return; }
    if (!isChapter(d.id)) return;
    manual = true;
    target.setChapter(d.id, typeof d.progress === "number" ? d.progress : null);
  };
  scan();
  const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(() => { scan(); queue(); }) : null;
  mo?.observe(root === document ? document.body : (root as Node), { subtree: true, childList: true, attributes: true, attributeFilter: ["data-chapter"] });
  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", queue);
  window.addEventListener("keplar:chapter", onEvent);
  queue();
  return () => {
    if (raf) cancelAnimationFrame(raf);
    mo?.disconnect();
    window.removeEventListener("scroll", queue);
    window.removeEventListener("resize", queue);
    window.removeEventListener("keplar:chapter", onEvent);
  };
}
