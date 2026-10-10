/**
 * AppSpec validation. The planner is a model, so everything it returns is treated as untrusted input: names are identifiers,
 * types and access levels come from fixed lists, sizes are bounded, and the plan's limits are applied (Free = front-end only).
 * The runtime trusts only a spec that went through normalizeSpec.
 */
import { ACCESS, APP_KINDS, FIELD_TYPES, type Access, type AiActionSpec, type AppKind, type AppSpec, type CollectionSpec, type FieldSpec, type FilePlan, type ImageSlot, type PageSpec } from "./types";
import type { AppBuildLimits } from "./models";

const IDENT = /^[a-z][a-zA-Z0-9_]{0,31}$/;
const RESERVED_FIELDS = new Set(["id", "_owner", "_ownerName", "_ownerAvatar", "createdAt", "updatedAt", "_app", "_env"]);
const s = (v: unknown, n: number) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, n);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const ident = (v: unknown) => {
  const x = s(v, 40).replace(/[^a-zA-Z0-9_]/g, "_").replace(/^[^a-zA-Z]+/, "");
  const c = x ? x[0].toLowerCase() + x.slice(1) : "";
  return IDENT.test(c) ? c : "";
};

function field(v: unknown, collections: Set<string>): FieldSpec | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const name = ident(o.name);
  if (!name || RESERVED_FIELDS.has(name)) return null;
  const type = oneOf(o.type, FIELD_TYPES, "text");
  const f: FieldSpec = { name, type };
  if (o.required === true) f.required = true;
  if (o.label) f.label = s(o.label, 60);
  if (type === "ref") {
    const ref = ident(o.ref) || "users";
    f.ref = ref === "users" || collections.has(ref) ? ref : "users";
  }
  if (type === "select") f.options = arr(o.options).map((x) => s(x, 40)).filter(Boolean).slice(0, 30);
  if (type === "select" && !f.options?.length) f.type = "text";
  const max = Number(o.max);
  if (Number.isFinite(max) && max > 0) f.max = Math.min(max, type === "number" ? 1e12 : 20_000);
  return f;
}

function collection(v: unknown, names: Set<string>): CollectionSpec | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const name = ident(o.name);
  if (!name || name === "users") return null;
  const fields = arr(o.fields).map((f) => field(f, names)).filter((f): f is FieldSpec => Boolean(f));
  const uniqFields = new Set(fields.map((f) => f.name).concat("_owner"));
  const seen = new Set<string>();
  const dedup = fields.filter((f) => (seen.has(f.name) ? false : (seen.add(f.name), true))).slice(0, 30);
  const acc = (x: unknown, d: Access) => oneOf(x, ACCESS, d);
  const unique = arr(o.unique).map((x) => (x === "_owner" ? "_owner" : ident(x))).filter((x) => x && uniqFields.has(x)).slice(0, 4);
  const seed = arr(o.seed).filter((x) => x && typeof x === "object" && !Array.isArray(x)).slice(0, 12).map((x) => {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(x as Record<string, unknown>)) if (seen.has(k) || k === "_ownerName") out[k] = typeof val === "string" ? val.slice(0, 2000) : val;
    return out;
  });
  return {
    name,
    label: s(o.label, 60) || name,
    fields: dedup,
    read: acc(o.read, "public"),
    create: acc(o.create, "auth"),
    update: acc(o.update, "owner"),
    delete: acc(o.delete, "owner"),
    ...(unique.length ? { unique } : {}),
    ...(o.realtime === true ? { realtime: true } : {}),
    ...(seed.length ? { seed } : {}),
  };
}

function page(v: unknown): PageSpec | null {
  const o = (v ?? {}) as Record<string, unknown>;
  let route = s(o.route, 60);
  if (!route.startsWith("/")) route = "/" + route;
  route = route.replace(/[^a-zA-Z0-9/:_-]/g, "");
  if (!route) return null;
  return { route, title: s(o.title, 60) || route, purpose: s(o.purpose, 300), ...(o.auth === true ? { auth: true } : {}), ...(o.admin === true ? { admin: true } : {}) };
}

function aiAction(v: unknown): AiActionSpec | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const name = ident(o.name);
  const system = s(o.system, 4000);
  if (!name || !system) return null;
  return {
    name,
    label: s(o.label, 60) || name,
    purpose: s(o.purpose, 300),
    system,
    input: arr(o.input).map((i) => {
      const x = (i ?? {}) as Record<string, unknown>;
      return { name: ident(x.name), max: Math.max(50, Math.min(20_000, Number(x.max) || 2000)) };
    }).filter((i) => i.name).slice(0, 6),
    output: o.output === "json" ? "json" : "text",
    maxTokens: Math.max(100, Math.min(4000, Number(o.maxTokens) || 800)),
    tier: o.tier === "smart" ? "smart" : "fast",
    auth: o.auth !== false,
  };
}

function filePlan(v: unknown): FilePlan | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const p = s(o.path, 80).replace(/^\.?\//, "").toLowerCase();
  if (!/^(?:[a-z0-9][a-z0-9_-]{0,30}\/){0,2}[a-z0-9][a-z0-9_.-]{0,40}\.(html|css|js|json|svg)$/.test(p) || p.includes("..")) return null;
  const ext = p.split(".").pop() as FilePlan["role"];
  return { path: p, role: ext, purpose: s(o.purpose, 400), ...(Array.isArray(o.exports) ? { exports: arr(o.exports).map((x) => s(x, 40)).filter((x) => /^[A-Za-z_$][\w$]*$/.test(x)).slice(0, 20) } : {}) };
}

export function normalizeSpec(raw: unknown, L: AppBuildLimits, prompt: string): AppSpec {
  const o = (raw ?? {}) as Record<string, unknown>;
  const names = new Set(arr(o.collections).map((c) => ident((c as Record<string, unknown>)?.name)).filter(Boolean));
  let collections = arr(o.collections).map((c) => collection(c, names)).filter((c): c is CollectionSpec => Boolean(c));
  const seenC = new Set<string>();
  collections = collections.filter((c) => (seenC.has(c.name) ? false : (seenC.add(c.name), true))).slice(0, L.collections);
  const authRaw = (o.auth ?? {}) as Record<string, unknown>;
  let pages = arr(o.pages).map(page).filter((p): p is PageSpec => Boolean(p));
  const seenP = new Set<string>();
  pages = pages.filter((p) => (seenP.has(p.route) ? false : (seenP.add(p.route), true))).slice(0, L.maxPages);
  if (!pages.some((p) => p.route === "/")) pages.unshift({ route: "/", title: "Home", purpose: "The first screen." });
  let ai = arr(o.ai).map(aiAction).filter((a): a is AiActionSpec => Boolean(a)).slice(0, 8);
  const notBuilt = arr(o.notBuilt).map((x) => s(x, 200)).filter(Boolean).slice(0, 8);
  if (!L.backend && (collections.length || authRaw.enabled === true)) {
    notBuilt.push("Accounts and saved data shared between visitors (Free builds keep data in the visitor's own browser). Upgrade to Lite or higher for a real backend.");
    collections = [];
  }
  if (!L.ai && ai.length) {
    notBuilt.push("AI features inside the app (the AI proxy is part of Plus and higher).");
    ai = [];
  }
  const authEnabled = L.backend && authRaw.enabled === true;
  let files = arr(o.files).map(filePlan).filter((f): f is FilePlan => Boolean(f));
  const seenF = new Set<string>();
  files = files.filter((f) => (seenF.has(f.path) ? false : (seenF.add(f.path), true))).slice(0, L.maxFiles);
  if (!files.some((f) => f.path === "index.html")) files.unshift({ path: "index.html", role: "html", purpose: "The app shell." });
  if (!files.some((f) => f.role === "css")) files.push({ path: "styles.css", role: "css", purpose: "The app's own composition styles on top of the design system." });
  const kind = oneOf(o.kind, APP_KINDS, "app") as AppKind;
  const uses = arr(o.uses).filter((u): u is "ui" | "three" => u === "ui" || u === "three");
  if (kind !== "site" && !uses.includes("ui") && files.some((f) => f.role === "js")) uses.push("ui");
  const images: ImageSlot[] = arr(o.images).map((i) => {
    const x = (i ?? {}) as Record<string, unknown>;
    const aspect = oneOf(x.aspect, ["1:1", "4:3", "3:2", "16:9", "3:4", "2:3"] as const, "3:2");
    return { slot: ident(x.slot), prompt: s(x.prompt, 600), aspect, alt: s(x.alt, 140) };
  }).filter((i) => i.slot && i.prompt).slice(0, L.images);
  return {
    name: s(o.name, 60) || "Untitled app",
    tagline: s(o.tagline, 140),
    kind,
    summary: s(o.summary, 800) || s(prompt, 400),
    audience: s(o.audience, 300),
    pages,
    collections,
    auth: {
      enabled: authEnabled,
      methods: authEnabled ? (arr(authRaw.methods).filter((m): m is "password" | "magic" => m === "password" || m === "magic").slice(0, 2) as ("password" | "magic")[]) : [],
      roles: authEnabled ? [...new Set(["member", "admin", ...arr(authRaw.roles).map((r) => ident(r)).filter(Boolean)])].slice(0, 6) : [],
      profileFields: authEnabled ? arr(authRaw.profileFields).map((f) => ident(f)).filter((f) => f && !["email", "role", "id"].includes(f)).slice(0, 10) : [],
    },
    ai,
    features: arr(o.features).map((f, i) => {
      const x = (f ?? {}) as Record<string, unknown>;
      return { id: ident(x.id) || `f${i + 1}`, title: s(x.title, 100), detail: s(x.detail, 300), must: x.must !== false };
    }).filter((f) => f.title).slice(0, 24),
    uses: [...new Set(uses)],
    images,
    copy: { voice: s((o.copy as Record<string, unknown>)?.voice, 200), keyMessages: arr((o.copy as Record<string, unknown>)?.keyMessages).map((x) => s(x, 200)).filter(Boolean).slice(0, 6) },
    files,
    scope: L.backend ? "full" : "reduced",
    notBuilt: [...new Set(notBuilt)],
    decisions: arr(o.decisions).map((d) => {
      const x = (d ?? {}) as Record<string, unknown>;
      return { choice: s(x.choice, 120), why: s(x.why, 280), ...(s(x.tradeoff, 200) ? { tradeoff: s(x.tradeoff, 200) } : {}) };
    }).filter((d) => d.choice && d.why).slice(0, 3),
    assumptions: arr(o.assumptions).map((x) => s(x, 160)).filter(Boolean).slice(0, 3),
  };
}

/** password is always available when accounts are on; magic link is added when the spec asks for it. */
export function authMethods(spec: AppSpec): ("password" | "magic")[] {
  if (!spec.auth.enabled) return [];
  return spec.auth.methods.length ? spec.auth.methods : ["password"];
}

export const collectionOf = (spec: AppSpec, name: string) => spec.collections.find((c) => c.name === name) ?? null;
