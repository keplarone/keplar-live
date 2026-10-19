/**
 * Built-in tools for POST /api/v1/ask. A caller lists tools in `tools`; each one either switches on a mode the app's pipeline
 * already has (web search, deep research, reasoning, debate) or fetches material first and hands it to the models as attached
 * documents (reading links, recent posts on X). Every tool reports what actually happened in the answer's `tools` list, so a
 * caller can tell "ran" from "not available here". The pipeline's own gates still apply on top (plan, flags, capacity).
 */
import { OFF_NOT_ENABLED } from "@/lib/orchestration/research-notes";
import { readLink, LinkError } from "@/lib/attachments/link";
import { limitsForPlan } from "@/lib/attachments/kinds";
import { dailyLimit } from "@/lib/tools/access";
import { getFamily } from "@/lib/personalize/family";
import { searchRecentPosts, xConfigured, xQueryFrom, cleanXQuery, X_LIMITS, type XPost } from "@/lib/providers/x-posts";
import type { ChatDoc } from "@/lib/documents/chat-docs";
import type { Workspace } from "@/lib/create/platform/workspace";
import { ApiError } from "./keys";

export const API_TOOLS = ["web_search", "deep_research", "reason", "debate", "read_url", "x_search"] as const;
export type ApiToolType = (typeof API_TOOLS)[number];
export const API_TOOL_LIMITS = { tools: 6, urls: 3, urlChars: 2048, xResults: 15 } as const;

export type ApiTool = { type: ApiToolType; urls?: string[]; query?: string };
/** `requested`: the mode was switched on for the pipeline (its own gates may still skip it; check `sources`/`source_check`). */
export type ToolReport = { type: ApiToolType; status: "used" | "requested" | "unavailable" | "failed"; detail: string };
export type Modes = { web?: boolean; deepResearch?: boolean; reason?: boolean; debate?: boolean };
export type PreparedTools = { modes: Modes; docs: ChatDoc[]; report: ToolReport[] };

const bad = (m: string) => new ApiError(400, "invalid_request", m);

export function parseTools(raw: unknown): ApiTool[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > API_TOOL_LIMITS.tools) throw bad(`"tools" must be an array of at most ${API_TOOL_LIMITS.tools} tools.`);
  const seen = new Set<string>();
  const out: ApiTool[] = [];
  for (const t of raw) {
    const o = (typeof t === "string" ? { type: t } : t) as { type?: unknown; urls?: unknown; query?: unknown } | null;
    if (!o || typeof o !== "object" || typeof o.type !== "string" || !(API_TOOLS as readonly string[]).includes(o.type)) throw bad(`Each tool needs "type", one of: ${API_TOOLS.join(", ")}.`);
    if (seen.has(o.type)) throw bad(`"${o.type}" is listed twice.`);
    seen.add(o.type);
    const tool: ApiTool = { type: o.type as ApiToolType };
    if (o.type === "read_url") {
      if (!Array.isArray(o.urls) || !o.urls.length || o.urls.length > API_TOOL_LIMITS.urls) throw bad(`"read_url" needs "urls": 1 to ${API_TOOL_LIMITS.urls} links.`);
      tool.urls = o.urls.map((u) => {
        if (typeof u !== "string" || !u.trim() || u.length > API_TOOL_LIMITS.urlChars) throw bad(`Each link in "urls" must be a string up to ${API_TOOL_LIMITS.urlChars} characters.`);
        try {
          const p = new URL(u.trim());
          if (p.protocol !== "https:" && p.protocol !== "http:") throw new Error();
        } catch { throw bad(`"${u.slice(0, 80)}" is not an http(s) link.`); }
        return u.trim();
      });
    }
    if (o.type === "x_search" && o.query !== undefined) {
      const q = typeof o.query === "string" && o.query.length <= X_LIMITS.query ? cleanXQuery(o.query) : null;
      if (!q) throw bad(`"x_search.query" must be a short search (up to 256 characters).`);
      tool.query = q;
    }
    out.push(tool);
  }
  return out;
}

export function postsDoc(query: string, posts: XPost[]): ChatDoc {
  const lines = posts.map((p) => `- ${p.author ? `@${p.author.handle}` : "unknown"}${p.createdAt ? ` (${p.createdAt})` : ""}: ${p.text.replace(/\s+/g, " ")} <${p.url}>`);
  return { name: `Recent posts on X for "${query}"`.slice(0, 160), text: `Public posts returned by a search on X. They are claims by their authors, not verified facts.\n${lines.join("\n")}`, truncated: false, source: "file" };
}

type Deps = { env?: Record<string, string | undefined>; read?: typeof readLink; searchX?: typeof searchRecentPosts; family?: (id: string) => Promise<boolean>; daily?: typeof dailyLimit };

/** Runs the fetch-style tools and turns the rest into pipeline modes. Never throws for a tool that can't run; it reports it. */
export async function prepareTools(ws: Pick<Workspace, "id" | "plan">, tools: ApiTool[], question: string, deps: Deps = {}): Promise<PreparedTools> {
  const env = deps.env ?? process.env;
  const paid = ws.plan !== "free";
  const retrieval = paid && env.KEPLAR_RETRIEVAL_ENABLED === "true";
  const modes: Modes = {};
  const docs: ChatDoc[] = [];
  const report: ToolReport[] = [];
  const off = (type: ApiToolType, detail: string) => report.push({ type, status: "unavailable", detail });
  for (const t of tools) {
    switch (t.type) {
      case "web_search":
        if (!retrieval) { off(t.type, paid ? "Web search isn't switched on for this service yet." : "Web search is on paid plans."); break; }
        modes.web = true;
        report.push({ type: t.type, status: "requested", detail: "Web search was switched on. Retrieved pages appear in source_check when they were used." });
        break;
      case "deep_research":
        if (!retrieval) { off(t.type, paid ? OFF_NOT_ENABLED : "Deep research is on paid plans."); break; }
        modes.deepResearch = true;
        report.push({ type: t.type, status: "requested", detail: "Deep research was switched on for this question." });
        break;
      case "reason":
        modes.reason = true;
        report.push({ type: t.type, status: "requested", detail: "Asked the models to reason step by step before answering." });
        break;
      case "debate":
        modes.debate = true;
        report.push({ type: t.type, status: "requested", detail: "Asked the models to debate before the answer is written. Capacity limits can skip it." });
        break;
      case "read_url": {
        const read = deps.read ?? readLink;
        const L = limitsForPlan(ws.plan);
        const okUrls: string[] = [];
        const failed: string[] = [];
        for (const url of t.urls ?? []) {
          try {
            await (deps.daily ?? dailyLimit)(`link:${ws.id}`, L.linkReadsPerDay, "reading links");
            const r = await read(url, { ...L, linkChars: paid ? 32_000 : 14_000 });
            if (!r.text.trim()) { failed.push(`${r.host}: nothing readable`); continue; }
            docs.push({ name: (r.title || r.host).slice(0, 160), text: r.text, truncated: r.truncated, source: "link", url: r.finalUrl });
            okUrls.push(r.finalUrl);
          } catch (e) {
            if (e instanceof LinkError) failed.push(`${url.slice(0, 80)}: ${e.message}`);
            else if (e && typeof e === "object" && "status" in e && (e as { status: number }).status === 429) failed.push(`${url.slice(0, 80)}: daily link reads used up`);
            else failed.push(`${url.slice(0, 80)}: could not be read`);
          }
        }
        report.push(okUrls.length
          ? { type: t.type, status: "used", detail: `Read ${okUrls.length} of ${(t.urls ?? []).length} link${(t.urls ?? []).length === 1 ? "" : "s"}.${failed.length ? ` Skipped: ${failed.join("; ")}.` : ""}` }
          : { type: t.type, status: "failed", detail: failed.join("; ") || "No link could be read." });
        break;
      }
      case "x_search": {
        if (!paid) { off(t.type, "Posts on X are on paid plans."); break; }
        if (!xConfigured(env)) { off(t.type, "Search on X isn't set up for this service."); break; }
        if (await (deps.family ?? (async (id: string) => Boolean((await getFamily(id))?.enabled)))(ws.id)) { off(t.type, "Posts on X are off in Family mode."); break; }
        const query = t.query ?? xQueryFrom(question);
        const r = await (deps.searchX ?? searchRecentPosts)(query, { max: API_TOOL_LIMITS.xResults, env });
        if (!r.ok) { report.push({ type: t.type, status: "failed", detail: r.message }); break; }
        if (!r.posts.length) { report.push({ type: t.type, status: "used", detail: `No recent posts matched "${query}".` }); break; }
        docs.push(postsDoc(query, r.posts));
        report.push({ type: t.type, status: "used", detail: `Gave the models ${r.posts.length} recent post${r.posts.length === 1 ? "" : "s"} for "${query}".` });
        break;
      }
    }
  }
  return { modes, docs, report };
}
