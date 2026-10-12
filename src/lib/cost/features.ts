/**
 * Cost-meter feature taxonomy. Every provider call is tagged with exactly one of these (src/lib/cost/meter.ts).
 * Attribution order: an explicit tag (withCostTag / tagCostFeature) > the /api/keplar request scope (modes) > the
 * route the request came in on (ROUTE_FEATURES) > "untagged". Pure module (no I/O), safe to import anywhere.
 */
export const FEATURES = [
  "ask", "debate", "deep-research", "core-reasoning", "multimodal", "study", "slides", "create", "critic", "voice-create",
  "images", "video", "transcribe", "collab", "deploy", "agents", "api", "embed", "mcp", "memory", "title", "support", "system", "untagged",
] as const;
export type FeatureId = (typeof FEATURES)[number];

export const isFeature = (v: unknown): v is FeatureId => typeof v === "string" && (FEATURES as readonly string[]).includes(v);

export const FEATURE_LABELS: Record<FeatureId, string> = {
  ask: "Ask (multi-model answer)", debate: "Debate", "deep-research": "Deep Research", "core-reasoning": "Core reasoning", multimodal: "Multimodal (files, images, links)",
  study: "Study", slides: "Slides", create: "Create (sites, apps)", critic: "Create critic / QA", "voice-create": "Voice Create", images: "Image generation", video: "Video generation",
  transcribe: "Voice / transcription", collab: "Collaboration", deploy: "Deploy / publish", agents: "Agents", api: "Public API", embed: "Embed widget", mcp: "MCP tools",
  memory: "Memory", title: "Chat titles", support: "Support", system: "System jobs", untagged: "Untagged",
};

/** Longest-prefix route map (pathname → feature). Order does not matter; the longest matching prefix wins. */
export const ROUTE_FEATURES: Record<string, FeatureId> = {
  "/api/keplar": "ask",
  "/api/keplar/extract": "multimodal",
  "/api/keplar/reference": "multimodal",
  "/api/keplar/link": "multimodal",
  "/api/keplar/transcribe": "transcribe",
  "/api/chat-title": "title",
  "/api/specialists": "ask",
  "/api/projects": "ask",
  "/api/chats": "ask",
  "/api/slides": "slides",
  "/api/study": "study",
  "/api/sites": "create",
  "/api/sites/enhance": "create",
  "/api/sites/import": "multimodal",
  "/api/create/projects": "create",
  "/api/apps": "create",
  "/api/templates": "create",
  "/api/mobile": "create",
  "/api/sites/[id]/qa": "critic",
  "/api/sites/[id]/publish": "deploy",
  "/api/create/projects/[id]/deploy": "deploy",
  "/api/create/media/video": "video",
  "/api/create/media": "images",
  "/api/images": "images",
  "/api/collab": "collab",
  "/api/business/agents": "agents",
  "/api/roblox-cloud": "agents",
  "/api/blender-cloud": "agents",
  "/api/cron/agents": "agents",
  "/api/inngest": "agents",
  "/api/business": "agents",
  "/api/v1": "api",
  "/api/embed": "embed",
  "/api/mcp": "mcp",
  "/api/memory": "memory",
  "/api/support": "support",
  "/api/feedback": "support",
  "/api/cron": "system",
  "/api/learning": "system",
  "/api/faq": "system",
};

const SEG = /^\/api\/(sites|create\/projects|apps|images|slides\/decks|study\/sets|mcp\/servers|projects|chats|team|collab|business\/agents|create\/media|embed|domains)\/[^/]+/;

/** Feature for an incoming request path ("/api/sites/abc/qa" → "critic"). Unknown API paths → null. */
export function featureForPath(pathname: string | null | undefined): FeatureId | null {
  if (!pathname) return null;
  const p = pathname.replace(/\/+$/, "") || "/";
  const generic = p.replace(SEG, (m, base: string) => `/api/${base}/[id]`);
  let best: FeatureId | null = null;
  let len = -1;
  for (const cand of [generic, p]) {
    for (const [prefix, f] of Object.entries(ROUTE_FEATURES)) {
      if ((cand === prefix || cand.startsWith(`${prefix}/`)) && prefix.length > len) {
        best = f;
        len = prefix.length;
      }
    }
  }
  return best;
}

/** /api/keplar: the composer modes decide which feature a question belongs to. */
export function featureForAsk(req: { modes?: Partial<Record<string, unknown>> | null; media?: unknown; attachments?: readonly unknown[] | null } | null | undefined): FeatureId {
  const m = req?.modes ?? {};
  if (m.deepResearch === true) return "deep-research";
  if (m.debate === true) return "debate";
  if (m.reason === true) return "core-reasoning";
  if (m.create === true) return "create";
  if (m.agent === true) return "agents";
  if (req?.media || (req?.attachments?.length ?? 0) > 0) return "multimodal";
  return "ask";
}

/** compute_ledger `action` → feature, so credits charged can be compared with metered cost per feature. */
export function featureForLedgerAction(action: string | null | undefined): FeatureId {
  const a = (action ?? "").toLowerCase();
  if (!a) return "untagged";
  if (a === "answer" || a === "instant") return "ask";
  if (a.startsWith("deep") || a.includes("research")) return "deep-research";
  if (a.startsWith("debate")) return "debate";
  if (a.startsWith("core") || a.includes("reason")) return "core-reasoning";
  if (a.startsWith("image")) return "images";
  if (a.startsWith("video") || a === "video") return "video";
  if (a === "photo.read") return "multimodal";
  if (a.startsWith("slides") || a.startsWith("slide")) return "slides";
  if (a.startsWith("study")) return "study";
  if (a === "site.deploy" || a.startsWith("deploy")) return "deploy";
  if (a === "scan.site" || a.startsWith("qa") || a.startsWith("critic")) return "critic";
  if (a.startsWith("site") || a.startsWith("app") || a === "enhance" || a === "sandbox.preview" || a === "tool.plan") return "create";
  if (a.startsWith("agent")) return "agents";
  if (a.startsWith("mcp")) return "mcp";
  if (a.startsWith("voice") || a.startsWith("transcri")) return "transcribe";
  if (a.startsWith("api")) return "api";
  if (a.startsWith("embed")) return "embed";
  return "untagged";
}
