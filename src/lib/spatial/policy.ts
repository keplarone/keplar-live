/**
 * Spatial layer policy (pure, no DOM, no three). One place decides how much spatial effect a surface
 * gets and how heavy it may be on this device. Effects are driven by real product data only: nothing
 * here invents progress, agreement or activity.
 *
 * Intensity by surface: Create is the most immersive, Ask/Projects/Memory/Business moderate,
 * Admin and Settings are deliberately flat (no scene at all).
 */
export type Surface = "create" | "ask" | "projects" | "memory" | "agents" | "business" | "approvals" | "marketing" | "admin" | "settings";
export type Intensity = "none" | "subtle" | "rich" | "immersive";

export const SURFACE_INTENSITY: Record<Surface, Intensity> = {
  create: "immersive",
  ask: "subtle",
  projects: "rich",
  memory: "rich",
  agents: "rich",
  business: "subtle",
  approvals: "subtle",
  marketing: "rich",
  admin: "none",
  settings: "none",
};

export type Caps = {
  webgl: boolean;
  reducedMotion: boolean;
  /** Data-saver / low-power hints. */
  saveData?: boolean;
  mobile: boolean;
  deviceMemoryGb?: number;
  cores?: number;
  devicePixelRatio: number;
};

export type Quality = "off" | "static" | "low" | "medium" | "high";

/** What this device may run for a surface. `static` = draw one still frame, no animation loop. */
export function resolveQuality(intensity: Intensity, caps: Caps): Quality {
  if (intensity === "none" || !caps.webgl) return "off";
  if (caps.reducedMotion) return "static";
  const weak = Boolean(caps.saveData) || (caps.deviceMemoryGb !== undefined && caps.deviceMemoryGb <= 2) || (caps.cores !== undefined && caps.cores <= 2);
  if (weak) return "static";
  if (caps.mobile) return intensity === "immersive" ? "medium" : "low";
  return intensity === "immersive" ? "high" : intensity === "rich" ? "medium" : "low";
}

export type Tier = { quality: "low" | "medium" | "high"; /** motion multiplier: 1 normal, reduced-motion = a very slow drift (never 0) */ speed: number; /** why this tier (shown by ?fxdebug=1) */ reason: string };

/**
 * The tier for a surface. The field is NEVER switched off or frozen by a heuristic: weak devices, data saver, small screens
 * and reduced motion only lower the particle count / pixel ratio / motion speed. (resolveQuality above keeps the old
 * "static"/"off" answers for callers that still want them; the live field uses this.)
 */
export function resolveTier(intensity: Intensity, caps: Caps): Tier {
  const reasons: string[] = [];
  const weak = Boolean(caps.saveData) || (caps.deviceMemoryGb !== undefined && caps.deviceMemoryGb <= 2) || (caps.cores !== undefined && caps.cores <= 2);
  if (caps.saveData) reasons.push("data-saver: low tier");
  if (caps.deviceMemoryGb !== undefined && caps.deviceMemoryGb <= 2) reasons.push(`deviceMemory ${caps.deviceMemoryGb}GB: low tier`);
  if (caps.cores !== undefined && caps.cores <= 2) reasons.push(`${caps.cores} cores: low tier`);
  let quality: Tier["quality"] = caps.mobile ? (intensity === "immersive" ? "medium" : "low") : intensity === "immersive" ? "high" : intensity === "rich" ? "medium" : "low";
  if (caps.mobile) reasons.push("mobile: capped tier");
  if (intensity === "none") { quality = "low"; reasons.push("quiet surface: low tier"); }
  if (weak) quality = "low";
  let speed = 1;
  if (caps.reducedMotion) { speed = 0.12; reasons.push("prefers-reduced-motion: slow drift (still moving)"); }
  if (!caps.webgl) reasons.push("webgl probe failed: trying anyway");
  return { quality, speed, reason: reasons.join("; ") || "full tier" };
}

const DPR_CAP: Record<Exclude<Quality, "off" | "static">, number> = { low: 1, medium: 1.5, high: 2 };

/** Starting pixel ratio for a quality tier. */
export function startDpr(q: Quality, devicePixelRatio: number): number {
  if (q === "off") return 1;
  const cap = q === "static" ? 1.5 : DPR_CAP[q];
  return Math.max(1, Math.min(devicePixelRatio || 1, cap));
}

/**
 * Adaptive pixel ratio from measured frame time (ms, smoothed). Drops fast when frames are slow,
 * recovers slowly, never below 0.75 or above the tier cap.
 */
export function adaptDpr(current: number, frameMs: number, cap: number): number {
  if (frameMs > 24) return Math.max(0.75, +(current - 0.25).toFixed(2));
  if (frameMs < 12 && current < cap) return Math.min(cap, +(current + 0.1).toFixed(2));
  return current;
}

/**
 * Particle density (0.3..1) from measured frame time: sheds 20% per second while frames are slow (after the pixel ratio has
 * already been lowered), regains 5% per second when there is headroom. Keeps the field at frame rate on any device.
 */
export function adaptDensity(density: number, frameMs: number): number {
  if (frameMs > 22) return Math.max(0.3, +(density - 0.2).toFixed(2));
  if (frameMs < 12 && density < 1) return Math.min(1, +(density + 0.05).toFixed(2));
  return density;
}

/** Particle / element budget per tier. */
export function budget(q: Quality, base: number): number {
  const f = q === "high" ? 1 : q === "medium" ? 0.6 : q === "low" ? 0.3 : q === "static" ? 0.5 : 0;
  return Math.round(base * f);
}

/* ───────────── Agreement scene layout (from a real consensus result) ───────────── */

export type ModelStatus = "responded" | "failed" | "refused" | "not-needed";
export type AgreementInput = {
  level: "consensus" | "partial" | "none" | "single" | "unscored";
  models: { id: string; status: ModelStatus; stance?: string }[];
};
export type AgreementNode = {
  id: string;
  group: "majority" | "dissent" | "unscored" | "missing";
  /** Normalised scene coordinates, -1..1. */
  x: number;
  y: number;
};

/**
 * Lays out the models that were actually consulted. Majority = responders sharing the most common
 * stance, dissent = other stances, missing = failed/refused (never counted as dissent), unscored =
 * responders with no extracted stance (we do not claim agreement we did not measure).
 * Returns [] when there is nothing to compare (single model or <2 consulted).
 */
export function agreementLayout(input: AgreementInput): AgreementNode[] {
  const asked = input.models.filter((m) => m.status !== "not-needed");
  if (input.level === "single" || asked.length < 2) return [];
  const responders = asked.filter((m) => m.status === "responded");
  const counts = new Map<string, number>();
  for (const m of responders) if (m.stance) counts.set(m.stance, (counts.get(m.stance) ?? 0) + 1);
  let top: string | null = null;
  let best = 0;
  for (const [stance, n] of counts) if (n > best) { best = n; top = stance; }
  const measured = input.level !== "unscored" && top !== null;
  const group = (m: (typeof asked)[number]): AgreementNode["group"] =>
    m.status !== "responded" ? "missing" : !measured || !m.stance ? "unscored" : m.stance === top ? "majority" : "dissent";
  const bins: Record<AgreementNode["group"], typeof asked> = { majority: [], dissent: [], unscored: [], missing: [] };
  for (const m of asked) bins[group(m)].push(m);
  const out: AgreementNode[] = [];
  const ring = (list: typeof asked, cx: number, cy: number, r: number, g: AgreementNode["group"]) =>
    list.forEach((m, i) => {
      const a = (i / Math.max(1, list.length)) * Math.PI * 2 + Math.PI / 6;
      out.push({ id: m.id, group: g, x: +(cx + (list.length === 1 ? 0 : Math.cos(a) * r)).toFixed(3), y: +(cy + (list.length === 1 ? 0 : Math.sin(a) * r)).toFixed(3) });
    });
  // Majority converges toward the centre, dissent holds its own distance, unscored floats, missing sits dim at the edge.
  ring(bins.majority, -0.25, 0, 0.22, "majority");
  ring(bins.dissent, 0.5, 0, 0.18, "dissent");
  ring(bins.unscored, 0, 0, 0.5, "unscored");
  ring(bins.missing, 0, 0.78, 0.5, "missing");
  return out;
}

/** Text twin of the scene, so it is never the only way to read the result. */
export function agreementSummary(nodes: AgreementNode[]): string {
  if (!nodes.length) return "";
  const n = (g: AgreementNode["group"]) => nodes.filter((x) => x.group === g).length;
  const parts = [`${n("majority")} agreed`, `${n("dissent")} dissented`];
  if (n("unscored")) parts.push(`${n("unscored")} answered (not scored)`);
  if (n("missing")) parts.push(`${n("missing")} did not respond`);
  return parts.join(", ");
}

/* ───────────── Activation scene (a live answer in progress, from real stream state) ───────────── */

export type ActivationInput = {
  /** Models actually asked (stream "capabilities" event), or 0 when not known yet. */
  count: number;
  /** One entry per model result that has really arrived. */
  ticks: ("responded" | "failed" | "refused")[];
  /** The stage the pipeline is really in. */
  stage: "understand" | "select" | "compare" | "disagree" | "verify" | "synthesize" | string | null;
};
export type ActivationNode = { state: "pending" | "responded" | "missing" };

/** Null until there is something real to show (more than one model asked). */
export function activationState(i: ActivationInput): { nodes: ActivationNode[]; converge: number } | null {
  if (i.count < 2) return null;
  const nodes: ActivationNode[] = Array.from({ length: i.count }, (_, k) => {
    const t = i.ticks[k];
    return { state: !t ? "pending" : t === "responded" ? "responded" : "missing" };
  });
  const converge = i.stage === "synthesize" ? 1 : i.stage === "compare" || i.stage === "disagree" || i.stage === "verify" ? 0.5 : 0;
  return { nodes, converge };
}

/** Text twin for assistive tech. */
export function activationSummary(i: ActivationInput): string {
  const s = activationState(i);
  if (!s) return "";
  const done = s.nodes.filter((n) => n.state !== "pending").length;
  return `${done} of ${s.nodes.length} models have answered`;
}

/* ───────────── Memory constellation (one dot per real memory record) ───────────── */

export type MemoryRecord = { id: string; kind: string; source: "auto" | "user"; createdAt: string };
export type MemoryNode = { id: string; kind: string; source: "auto" | "user"; x: number; y: number };

const fnv = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
};

/**
 * Meaning of the layout (and nothing else): records of the same kind share an angular sector, older records sit further
 * from the centre, and position within the sector is a stable hash of the id (no meaning). Same input, same picture.
 */
export function memoryLayout(items: MemoryRecord[]): MemoryNode[] {
  if (!items.length) return [];
  const kinds = [...new Set(items.map((i) => i.kind))].sort();
  const sector = (Math.PI * 2) / kinds.length;
  const byAge = [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)); // newest first
  const rank = new Map(byAge.map((it, idx) => [it.id, items.length === 1 ? 0 : idx / (items.length - 1)]));
  return items.map((it) => {
    const a = kinds.indexOf(it.kind) * sector + sector * (0.1 + 0.8 * fnv(it.id)) - Math.PI / 2;
    const r = 0.22 + 0.68 * (rank.get(it.id) ?? 0);
    return { id: it.id, kind: it.kind, source: it.source, x: +(Math.cos(a) * r * 1.5).toFixed(3), y: +(Math.sin(a) * r).toFixed(3) };
  });
}

/** Nearest node to a scene point within `maxDist`, for hover. */
export function nearestNode<T extends { x: number; y: number }>(nodes: T[], x: number, y: number, maxDist = 0.12): T | null {
  let best: T | null = null;
  let bd = maxDist;
  for (const n of nodes) {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d <= bd) {
      bd = d;
      best = n;
    }
  }
  return best;
}

/* ───────────── Projects timeline (real project + thread timestamps) ───────────── */

export type TimelineLane = {
  id: string;
  name: string;
  /** 0..1 along the shared time axis. */
  start: number;
  items: { id: string; title: string; at: number; pos: number }[];
};

/** One lane per project plus "No project"; positions are linear in real time over the span of the data. */
export function projectTimeline(projects: { id: string; name: string; createdAt: number }[], threads: { id: string; title: string; projectId: string | null; createdAt: number }[]): { lanes: TimelineLane[]; from: number; to: number } | null {
  const stamps = [...projects.map((p) => p.createdAt), ...threads.map((t) => t.createdAt)].filter((n) => Number.isFinite(n));
  if (stamps.length < 2) return null;
  const from = Math.min(...stamps);
  const to = Math.max(...stamps);
  const span = Math.max(1, to - from);
  const pos = (t: number) => +((t - from) / span).toFixed(4);
  const lane = (id: string, name: string, start: number, list: typeof threads): TimelineLane => ({
    id,
    name,
    start: pos(start),
    items: list.sort((a, b) => a.createdAt - b.createdAt).map((t) => ({ id: t.id, title: t.title, at: t.createdAt, pos: pos(t.createdAt) })),
  });
  const lanes = projects.map((p) => lane(p.id, p.name, p.createdAt, threads.filter((t) => t.projectId === p.id)));
  const loose = threads.filter((t) => !t.projectId || !projects.some((p) => p.id === t.projectId));
  if (loose.length) lanes.push(lane("_none", "No project", Math.min(...loose.map((t) => t.createdAt)), loose));
  return { lanes, from, to };
}

/* ───────────── Create lane (driven by the real build job) ───────────── */

export type LaneInput = {
  /** Pages the site really has. */
  pages: string[];
  /** Paths the running build has really reported writing ("Writing x" events). */
  written: string[];
  /** The build reported "Checking and saving". */
  saving: boolean;
  busy: boolean;
  failed: boolean;
  /** A version is published (and live). */
  published: boolean;
  /** The head version is newer than the published one. */
  ahead: boolean;
};
export type LaneState = "dormant" | "waiting" | "written" | "ready" | "live" | "ahead" | "failed";
export type LaneNode = { id: string; x: number; y: number; state: LaneState };
export type Lane = { nodes: LaneNode[]; boundary: "none" | "checking" | "passed"; flow: boolean };

/** One node per page (plus any file a running build has written that is not yet a page). Nothing invented. */
export function createLane(i: LaneInput): Lane {
  const ids = [...i.pages];
  for (const w of i.written) if (!ids.includes(w)) ids.push(w);
  const n = ids.length;
  const nodes: LaneNode[] = ids.map((id, k) => {
    const wrote = i.written.includes(id);
    let state: LaneState;
    if (i.busy) state = wrote ? "written" : "waiting";
    else if (i.failed) state = wrote ? "written" : "failed";
    else if (i.published) state = i.ahead ? "ahead" : "live";
    else state = "ready";
    const x = n === 1 ? 0 : -0.78 + (1.56 * k) / (n - 1);
    return { id, x, y: Math.sin(k * 1.9) * 0.14, state };
  });
  const boundary: Lane["boundary"] = i.busy && i.saving ? "checking" : !i.busy && !i.failed && n > 0 ? "passed" : "none";
  return { nodes, boundary, flow: i.busy };
}

export function laneSummary(i: LaneInput): string {
  const l = createLane(i);
  const n = l.nodes.length;
  if (!n) return i.busy ? "Starting the build." : "No pages yet.";
  if (i.busy) return `${i.written.length} of ${n} page${n === 1 ? "" : "s"} written${i.saving ? ", checking and saving" : ""}.`;
  if (i.failed) return `The last build did not finish. ${i.written.length} of ${n} page${n === 1 ? "" : "s"} were written.`;
  if (i.published) return i.ahead ? `${n} page${n === 1 ? "" : "s"}, live, with unpublished changes.` : `${n} page${n === 1 ? "" : "s"}, live.`;
  return `${n} page${n === 1 ? "" : "s"}, not published.`;
}
