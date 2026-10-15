/**
 * Lightweight error tracking, no vendor needed. Unhandled server errors (route handlers, server components, the
 * `onRequestError` hook) and browser error boundaries are grouped by fingerprint (source + name + normalised message + route) in
 * collection system_error_events: first/last seen, count, one sample request id. /admin/errors lists them.
 *
 * Privacy: messages are scrubbed (emails, tokens, long ids, query strings) and capped; no request bodies, headers, cookies, prompts
 * or user ids are stored. If SENTRY_DSN is set, each event is also forwarded to Sentry's store endpoint with plain fetch (no SDK).
 * That forwarder is tested against a mock only, NOT against a real Sentry project.
 */
import { keepAlive } from "@/lib/create/platform/after";
import { createHash } from "node:crypto";
import { collection } from "@/lib/create/platform/store";
import { logEvent } from "./log";

export type ErrorSource = "server" | "render" | "client" | "job";
export type ErrorRow = {
  id: string;
  workspaceId: string;
  /** Last seen (ISO). */
  at: string;
  firstAt: string;
  count: number;
  source: ErrorSource;
  name: string;
  message: string;
  route: string;
  /** One sample request id / Next digest to find the log line. */
  sample: string;
  status: "open" | "resolved";
};

const rows = () => collection<ErrorRow>("system_error_events");

/** Remove anything that could identify a person or act as a credential. */
export function scrub(text: string, max = 300): string {
  return String(text ?? "")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\b(?:sk|pk|rk|whsec|xox[abp]|ghp|gho|ya29|AIza)[-_A-Za-z0-9]{8,}/g, "[key]")
    .replace(/\bBearer\s+[\w.~+/=-]{8,}/gi, "Bearer [token]")
    .replace(/\b[A-Fa-f0-9]{24,}\b/g, "[hex]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[id]")
    .replace(/\?[^\s"')]*/g, "?[query]")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .slice(0, max);
}

/** Routes keep their path shape but lose ids: /api/chats/abc123 -> /api/chats/:id */
export const normRoute = (p: string): string =>
  scrub(String(p ?? "").split("?")[0], 120).replace(/\/(?:[0-9a-f]{8,}|[A-Za-z0-9_-]{16,}|\d+)(?=\/|$)/g, "/:id") || "unknown";

/** Best-effort route from a stack trace ("…/app/api/chats/[id]/route.js" -> /api/chats/[id]). */
export const routeFromStack = (stack: string | undefined): string => {
  const m = /app\/(api\/[^:)\s]*?)\/route\.[jt]s/.exec(stack ?? "");
  return m ? `/${m[1]}` : "unknown";
};

export const fingerprint = (source: string, name: string, message: string, route: string): string =>
  "er_" + createHash("sha256").update(`${source}|${name}|${scrub(message, 160).replace(/\d+/g, "N")}|${route}`).digest("hex").slice(0, 16);

let windowStart = 0;
let windowCount = 0;
/** At most 60 writes per minute per instance: an error storm must not become a database storm. */
const allow = (now: number) => {
  if (now - windowStart > 60_000) { windowStart = now; windowCount = 0; }
  return ++windowCount <= 60;
};
export const resetErrorBudget = () => { windowStart = 0; windowCount = 0; };

export type ErrorInput = { source: ErrorSource; name?: string; message?: string; route?: string; sample?: string };

export async function recordError(input: ErrorInput, now = Date.now()): Promise<void> {
  try {
    const name = scrub(input.name || "Error", 60);
    const message = scrub(input.message || "", 300);
    const route = normRoute(input.route || "unknown");
    const sample = scrub(input.sample || "", 60);
    logEvent("error", "tracked_error", { source: input.source, name, route, sample });
    keepAlive(forwardToSentry({ ...input, name, message, route, sample }), "sentry forward");
    if (!allow(now)) return;
    const id = fingerprint(input.source, name, message, route);
    const iso = new Date(now).toISOString();
    const { inserted } = await rows().insertIfAbsent({ id, workspaceId: "system", at: iso, firstAt: iso, count: 1, source: input.source, name, message, route, sample, status: "open" });
    if (!inserted) await rows().increment("system", id, { count: 1 }, { id, workspaceId: "system", at: iso, firstAt: iso, count: 0, source: input.source, name, message, route, sample, status: "open" }).then(() => rows().update("system", id, { at: iso, sample: sample || undefined, status: "open" }));
  } catch (e) {
    console.error("[errors] could not record:", e instanceof Error ? e.name : "error");
  }
}

export async function listErrors(days = 30, limit = 200): Promise<ErrorRow[]> {
  const list = await rows().listSystemRange({ field: "at", gte: new Date(Date.now() - days * 864e5).toISOString() }, limit);
  return list.sort((a, b) => b.at.localeCompare(a.at));
}

export async function setErrorStatus(id: string, status: ErrorRow["status"]): Promise<boolean> {
  return Boolean(await rows().update("system", id, { status }));
}

/* ── optional Sentry forwarder (no SDK; plain envelope-less "store" API) ── */

export function parseDsn(dsn: string | undefined): { url: string; key: string } | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const project = u.pathname.replace(/^\/+/, "");
    if (!u.username || !/^\d+$/.test(project)) return null;
    return { url: `${u.protocol}//${u.host}/api/${project}/store/`, key: u.username };
  } catch {
    return null;
  }
}

export const sentryConfigured = (env: Record<string, string | undefined> = process.env) => parseDsn(env.SENTRY_DSN) !== null;

export async function forwardToSentry(e: Required<Pick<ErrorInput, "source">> & ErrorInput, env: Record<string, string | undefined> = process.env): Promise<boolean> {
  const d = parseDsn(env.SENTRY_DSN);
  if (!d) return false;
  try {
    const res = await fetch(d.url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-sentry-auth": `Sentry sentry_version=7, sentry_client=keplar/1, sentry_key=${d.key}` },
      body: JSON.stringify({
        event_id: crypto.randomUUID().replace(/-/g, ""),
        timestamp: Date.now() / 1000,
        platform: "node",
        level: "error",
        environment: env.VERCEL_ENV || env.NODE_ENV || "unknown",
        exception: { values: [{ type: e.name || "Error", value: e.message || "" }] },
        tags: { source: e.source, route: e.route || "unknown" },
        extra: { sample: e.sample || "" },
      }),
      signal: AbortSignal.timeout(3000), // error reporting must never hold up the request that failed
    });
    return res.ok;
  } catch {
    return false;
  }
}
