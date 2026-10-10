/**
 * Embed widgets (BETA). A widget has a public id (`emb_…`) safe to put on other sites.
 * Asks are metered to the publisher's personal workspace. Origin allowlist is optional
 * (empty = any origin, rate-limited). Revoking is immediate.
 */
import { HttpError } from "@/lib/create/platform/http";
import { id as newId, now } from "@/lib/create/platform/ids";
import { clientIpOf, rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { collection } from "@/lib/create/platform/store";
import { workspaceById, type Workspace } from "@/lib/create/platform/workspace";
import { siteUrl } from "@/lib/site";
import { readEmbedGrant } from "./grant";
import {
  EMBED_NAME_MAX,
  EMBED_ORIGIN_MAX,
  EMBED_POLICY,
  EMBED_SIZE_PX,
  embedAvailable,
  isAccent,
  isModelLane,
  isSize,
  isTheme,
  looksLikeEmbedId,
  type EmbedAccent,
  type EmbedModelLane,
  type EmbedSize,
  type EmbedTheme,
} from "./config";

export type EmbedWidgetRow = {
  id: string;
  workspaceId: string;
  name: string;
  theme: EmbedTheme;
  size: EmbedSize;
  accent: EmbedAccent;
  /** free = force OpenRouter :free; plan = publisher's plan models. */
  models: EmbedModelLane;
  /** Allowed parent origins (https://example.com). Empty = any (still rate-limited). */
  origins: string[];
  createdAt: string;
  revokedAt: string | null;
  requests: number;
  credits: number;
};

export const embedWidgets = () => collection<EmbedWidgetRow>("embed_widgets");

export const publicWidget = (w: EmbedWidgetRow) => ({
  id: w.id,
  name: w.name,
  theme: w.theme,
  size: w.size,
  accent: w.accent,
  models: w.models,
  origins: w.origins,
  createdAt: w.createdAt,
  revokedAt: w.revokedAt,
  requests: w.requests,
  credits: w.credits,
});

const active = (w: EmbedWidgetRow) => !w.revokedAt;

/** Keplar's own origin is always allowed (the owner's preview). */
const ownOrigin = () => { try { return new URL(siteUrl).origin; } catch { return "https://keplar.one"; } };

/** May a page at `origin` use this widget? No allowlist = any origin (still rate-limited). */
export function widgetAllows(w: Pick<EmbedWidgetRow, "origins">, origin: string | null): boolean {
  if (!w.origins.length) return true;
  const o = origin ? normalizeOrigin(origin) : null;
  return Boolean(o && (o === ownOrigin() || w.origins.includes(o)));
}

/** CSP frame-ancestors for a widget's framed page: the browser itself refuses to show it inside any other site. */
export function frameAncestorsFor(w: Pick<EmbedWidgetRow, "origins">): string {
  return w.origins.length ? `frame-ancestors 'self' ${w.origins.join(" ")}` : "frame-ancestors *";
}

/** Normalize and validate an origin string (scheme + host, no path). */
export function normalizeOrigin(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase().replace(/\/$/, "");
  if (!t) return null;
  try {
    const u = new URL(t.includes("://") ? t : `https://${t}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (process.env.NODE_ENV === "production" && u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") return null;
    if (!u.hostname) return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function parseOrigins(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new HttpError(400, "origins must be an array of site addresses.", "bad_origins");
  if (raw.length > EMBED_ORIGIN_MAX) throw new HttpError(400, `At most ${EMBED_ORIGIN_MAX} allowed origins.`, "bad_origins");
  const out: string[] = [];
  for (const x of raw) {
    const o = normalizeOrigin(x);
    if (!o) throw new HttpError(400, "Each origin must look like https://example.com.", "bad_origins");
    if (!out.includes(o)) out.push(o);
  }
  return out;
}

export async function listWidgets(wsId: string): Promise<EmbedWidgetRow[]> {
  return (await embedWidgets().list(wsId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createWidget(
  ws: Pick<Workspace, "id" | "plan" | "verified" | "team" | "admin">,
  input: { name?: unknown; theme?: unknown; size?: unknown; accent?: unknown; models?: unknown; origins?: unknown },
): Promise<EmbedWidgetRow> {
  if (ws.team) throw new HttpError(403, "Embed widgets belong to a personal workspace.", "personal_only");
  if (!ws.verified) throw new HttpError(403, "Verify your email address first.", "unverified");
  if (!embedAvailable(ws.plan) && !ws.admin) throw new HttpError(402, "Embed widgets need a plan that includes them.", "plan_required");
  const name = typeof input.name === "string" ? input.name.replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, EMBED_NAME_MAX) : "";
  if (!name) throw new HttpError(400, "Give the widget a name so you can recognize it.");
  const theme: EmbedTheme = isTheme(input.theme) ? input.theme : "dark";
  const size: EmbedSize = isSize(input.size) ? input.size : "standard";
  const accent: EmbedAccent = isAccent(input.accent) ? input.accent : "graphite";
  // Free publishers always force the free model lane.
  const models: EmbedModelLane = ws.plan === "free" ? "free" : isModelLane(input.models) ? input.models : "plan";
  const origins = parseOrigins(input.origins);
  const live = (await listWidgets(ws.id)).filter(active);
  const max = EMBED_POLICY[ws.admin ? "business" : ws.plan].maxWidgets;
  if (live.length >= max) throw new HttpError(409, `Your plan allows ${max} active widgets. Revoke one to create another.`, "limit");
  if (live.some((w) => w.name.toLowerCase() === name.toLowerCase())) throw new HttpError(409, "A widget with that name exists. Pick another name.", "duplicate");
  const row: EmbedWidgetRow = {
    id: newId("emb"),
    workspaceId: ws.id,
    name,
    theme,
    size,
    accent,
    models,
    origins,
    createdAt: now(),
    revokedAt: null,
    requests: 0,
    credits: 0,
  };
  await embedWidgets().insert(row);
  return row;
}

export async function updateWidget(
  wsId: string,
  id: string,
  input: { name?: unknown; theme?: unknown; size?: unknown; accent?: unknown; models?: unknown; origins?: unknown; plan?: string },
): Promise<EmbedWidgetRow | null> {
  const w = await embedWidgets().get(wsId, id);
  if (!w || w.revokedAt) return null;
  const patch: Partial<EmbedWidgetRow> = {};
  if (input.name !== undefined) {
    const name = typeof input.name === "string" ? input.name.replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, EMBED_NAME_MAX) : "";
    if (!name) throw new HttpError(400, "Give the widget a name so you can recognize it.");
    patch.name = name;
  }
  if (input.theme !== undefined) {
    if (!isTheme(input.theme)) throw new HttpError(400, "theme must be dark or light.");
    patch.theme = input.theme;
  }
  if (input.size !== undefined) {
    if (!isSize(input.size)) throw new HttpError(400, "size must be compact, standard or tall.");
    patch.size = input.size;
  }
  if (input.accent !== undefined) {
    if (!isAccent(input.accent)) throw new HttpError(400, "Unknown accent.");
    patch.accent = input.accent;
  }
  if (input.models !== undefined) {
    if (!isModelLane(input.models)) throw new HttpError(400, "models must be free or plan.");
    patch.models = input.plan === "free" ? "free" : input.models;
  }
  if (input.origins !== undefined) patch.origins = parseOrigins(input.origins);
  return embedWidgets().update(wsId, id, patch);
}

export async function revokeWidget(wsId: string, id: string): Promise<boolean> {
  const w = await embedWidgets().get(wsId, id);
  if (!w || w.revokedAt) return false;
  await embedWidgets().update(wsId, id, { revokedAt: now() });
  return true;
}

export class EmbedError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfterSec?: number) {
    super(message);
  }
}

/**
 * Resolve a public widget for an ask. Checks revocation, publisher plan, origin allowlist, and per-widget rate limits.
 * When an allowlist is set, `grant` must be the signature issued while rendering /embed from that page's Referer.
 * A parent origin in the JSON body is not treated as proof.
 */
export async function resolveWidgetForAsk(req: Request, widgetId: string, grant: string | null): Promise<{ widget: EmbedWidgetRow; ws: Workspace }> {
  if (!looksLikeEmbedId(widgetId)) throw new EmbedError(400, "invalid_widget", "Unknown or malformed widget id.");
  const widget = await embedWidgets().findSystemBy("id", widgetId);
  if (!widget || !active(widget)) throw new EmbedError(404, "widget_gone", "This widget was revoked or does not exist.");
  const ws = await workspaceById(widget.workspaceId);
  if (!ws) throw new EmbedError(404, "widget_gone", "This widget was revoked or does not exist.");
  if (!embedAvailable(ws.plan) && !ws.admin) throw new EmbedError(403, "plan_required", "The publisher's plan no longer includes the Ask widget.");

  if (widget.origins.length) {
    const origin = readEmbedGrant(grant, widget.id);
    // The signature is minted from the Referer on /embed. Our own origin is the publisher preview, not a substitute for an allowlisted site.
    if (!origin || (origin !== ownOrigin() && !widget.origins.includes(origin))) throw new EmbedError(403, "origin_denied", "This site is not on the widget's allowlist.");
  }

  const pol = EMBED_POLICY[ws.admin ? "business" : ws.plan];
  const ip = clientIpOf(req) || "anon";
  try {
    await rateLimit(`embed:${widget.id}:min`, pol.perMinute, 60, { shared: true });
    await rateLimit(`embed:${widget.id}:day`, pol.perDay, 86_400, { shared: true });
    await rateLimit(`embed:ip:${ip}:min`, Math.max(6, pol.perMinute * 2), 60, { shared: true });
  } catch (e) {
    if (e instanceof RateLimitError) throw new EmbedError(429, "rate_limited", "Too many questions from this widget right now. Try again shortly.", e.retryAfterSec);
    throw e;
  }
  return { widget, ws };
}

export async function recordEmbedUse(widget: EmbedWidgetRow, credits: number): Promise<void> {
  try {
    await embedWidgets().increment(widget.workspaceId, widget.id, { requests: 1, credits: Math.max(0, Math.round(credits)) }, { ...widget, requests: 0, credits: 0 });
  } catch {
    /* counters informational */
  }
}

/** Snippet a publisher pastes on their site. */
export function embedSnippet(origin: string, widget: Pick<EmbedWidgetRow, "id" | "theme" | "size" | "accent">): string {
  const base = origin.replace(/\/$/, "");
  void EMBED_SIZE_PX; // dims are applied by embed.js from data-size
  return `<script src="${base}/embed.js" data-keplar-embed="${widget.id}" data-theme="${widget.theme}" data-size="${widget.size}" data-accent="${widget.accent}" async></script>`;
}

/** Public config a framed /embed page needs (no secrets). */
export function publicEmbedConfig(w: EmbedWidgetRow) {
  return {
    id: w.id,
    theme: w.theme,
    size: w.size,
    accent: w.accent,
    models: w.models,
    dims: EMBED_SIZE_PX[w.size],
  };
}
