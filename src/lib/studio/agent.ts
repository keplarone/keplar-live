/**
 * Roblox Studio mode, server side: one turn of the Studio co-creator.
 *
 * The desktop app runs Roblox Studio's own MCP server on the person's computer (keplar-desktop, src/main/studio). The page sends
 * the conversation so far plus Studio's tool definitions here; this module asks Fable 5 for the next reply and the Studio
 * actions it wants, and returns them labelled by risk. Nothing here touches Studio: the page runs the actions through the
 * desktop bridge, read-only ones by themselves and changes only after the person approves (or has turned on auto-approve for
 * safe changes). Destructive actions always wait for approval.
 *
 * Every turn is checked (signed in, Lite and up, credits) before the model is called and charged at its real cost with the
 * normal margin. Tools that would read local files, fetch arbitrary URLs, publish to the person's Roblox account or hand the
 * session to another AI are not offered to the model at all.
 */
import { assertCanSpend, chargeUnits, toUnits } from "@/lib/create/platform/compute";
import { HttpError } from "@/lib/create/platform/http";
import type { Workspace } from "@/lib/create/platform/workspace";
import { catalogById } from "@/lib/orchestration/catalog";
import { liveEnv, openRouterSlug } from "@/lib/orchestration/config";
import { METER_MARGIN } from "@/lib/orchestration/limits";
import { callCostUsd } from "@/lib/orchestration/pricing";

export const STUDIO_MODEL = "claude-fable-5-1";
export const STUDIO_LIMITS = {
  maxMessages: 240,
  maxBodyBytes: 12 * 1024 * 1024,
  maxImageBytes: 4 * 1024 * 1024,
  maxImages: 12,
  maxTools: 40,
  maxSchemaBytes: 24_000,
  maxToolResultChars: 12_000,
  maxOutputTokens: 4096,
  /** Credits a turn must be able to cover before it starts (a typical turn is far less). */
  reserveUnits: 300,
  timeoutMs: 120_000,
};

export type Risk = "read" | "change" | "destructive";

/** How each of Studio's tools is treated. Anything not listed (a new or unknown tool) is not offered to the model. */
export const STUDIO_TOOL_POLICY: Record<string, Risk | "blocked"> = {
  list_roblox_studios: "read",
  get_studio_state: "read",
  search_game_tree: "read",
  inspect_instance: "read",
  script_search: "read",
  script_grep: "read",
  script_read: "read",
  get_console_output: "read",
  screen_capture: "read",
  search_asset: "read",
  skill: "read",
  wait_job_finished: "read",
  multi_edit: "change",
  execute_luau: "change",
  insert_asset: "change",
  generate_procedural_model: "change",
  generate_mesh: "change",
  generate_material: "change",
  segment_mesh: "change",
  start_stop_play: "change",
  character_navigation: "change",
  user_mouse_input: "change",
  user_keyboard_input: "change",
  generate_texture: "destructive", // re-textures the source in place
  http_get: "blocked", // fetches any URL from the person's computer
  store_image: "blocked", // reads a local file path
  upload_image: "blocked", // publishes images to the person's Roblox account
  subagent: "blocked", // hands the session to another AI outside Keplar's approvals
};

/** Luau that deletes, wipes, publishes, spends or reaches outside the place is always shown for approval. */
const DESTRUCTIVE_LUAU = /:\s*Destroy\s*\(|ClearAllChildren|:\s*Remove\s*\(|\.Parent\s*=\s*nil|Debris\s*:|DataStoreService|MessagingService|MarketplaceService|TeleportService|HttpService|SavePlace|PublishAsync|SetAsync|RemoveAsync|loadstring|require\s*\(\s*\d/i;

export function riskOf(name: string, args: Record<string, unknown>): Risk | "blocked" {
  const base = STUDIO_TOOL_POLICY[name] ?? "blocked";
  if (base !== "change") return base;
  if (name === "execute_luau" && typeof args.code === "string" && DESTRUCTIVE_LUAU.test(args.code)) return "destructive";
  if (name === "multi_edit" && Array.isArray(args.edits) && args.edits.some((e) => e && typeof e === "object" && (e as { new_string?: unknown }).new_string === "")) return "destructive";
  return "change";
}

export const STUDIO_SYSTEM = `You are Keplar, building inside Roblox Studio with the person through Studio's own tools. You plan, then act, step by step, and the person approves every change.

How you work:
- Start every new request by calling list_roblox_studios and use that studio_id in every later call. If several are open, ask which one.
- Look before you build: use search_game_tree, inspect_instance, script_search and script_read to learn what is already there. Never assume.
- Before the first change, write a short numbered plan (3 to 8 steps) in plain sentences. Then do one step at a time.
- Before each tool call, say in one short sentence what you are about to do ("Adding the vehicle spawn script."). After it, say what happened. Never paste long code into chat; it goes into Studio.
- Use screen_capture after visible changes (models, lighting, UI, effects) to check your work, and fix what looks wrong.
- When the person attached reference images or video frames, match them closely: layout, colours, proportions, motion and feel. Say what you took from them.

Quality bar:
- Luau: clean, typed where useful, organised. Server code in ServerScriptService, shared modules in ReplicatedStorage (ModuleScripts with clear APIs), client code in StarterPlayerScripts or StarterGui. Every new script starts with a short comment header: what it does and how it connects.
- Structure: put what you build in clearly named Folders and Models (PascalCase), never loose in Workspace. Anchor static parts. Name every instance meaningfully.
- Lighting: pick the technology that fits (Future for showcase quality, ShadowMap for balance, Voxel for performance) and set Atmosphere, Sky and post effects deliberately.
- UI: ScreenGui with ResetOnSpawn off, UICorner, UIStroke, UIPadding and layout objects, scale-based sizing that works on phones, TweenService for motion.
- Effects: ParticleEmitter, Beam and Trail with tuned Rate, Lifetime, Speed, Size and Transparency sequences; keep them performant.
- Make the result feel professional and finished, not a placeholder.

Safety:
- Never delete, overwrite or replace existing work without saying exactly what will be removed; those steps always wait for the person's approval.
- Do not publish, change monetisation, data stores or teleports unless the person explicitly asked.
- If a tool is not available to you, do not try to get around it; say what you would need.
- If the person says stop or pause, stop.

Keep chat messages short. The person sees each step and can approve, skip, refine or pause.`;

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type StudioMessage =
  | { role: "user"; content: string | Part[] }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export type StudioToolDef = { name: string; description?: string; inputSchema?: unknown };

const bad = (msg: string) => new HttpError(400, msg, "bad_request");

/** Tools offered to the model: only allowed Studio tools, with capped descriptions and schemas. */
export function buildTools(defs: unknown): { type: "function"; function: { name: string; description: string; parameters: unknown } }[] {
  if (!Array.isArray(defs)) throw bad("tools must be a list.");
  const out: { type: "function"; function: { name: string; description: string; parameters: unknown } }[] = [];
  for (const d of defs.slice(0, 80) as StudioToolDef[]) {
    if (!d || typeof d.name !== "string") continue;
    const policy = STUDIO_TOOL_POLICY[d.name];
    if (!policy || policy === "blocked") continue;
    const schema = d.inputSchema && typeof d.inputSchema === "object" ? d.inputSchema : { type: "object", properties: {} };
    if (JSON.stringify(schema).length > STUDIO_LIMITS.maxSchemaBytes) continue;
    out.push({ type: "function", function: { name: d.name, description: String(d.description ?? "").slice(0, 2400), parameters: schema } });
  }
  return out.slice(0, STUDIO_LIMITS.maxTools);
}

const DATA_IMAGE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

/** The conversation, checked: known roles and shapes only, images as small data URLs, tool results capped. */
export function validateMessages(raw: unknown): StudioMessage[] {
  if (!Array.isArray(raw) || raw.length === 0) throw bad("messages must be a non-empty list.");
  if (raw.length > STUDIO_LIMITS.maxMessages) throw bad("This conversation is too long. Start a new Studio session.");
  let images = 0;
  const out: StudioMessage[] = [];
  for (const m of raw as Record<string, unknown>[]) {
    if (!m || typeof m !== "object") throw bad("Bad message.");
    if (m.role === "user") {
      if (typeof m.content === "string") { out.push({ role: "user", content: m.content.slice(0, 20_000) }); continue; }
      if (!Array.isArray(m.content)) throw bad("Bad message.");
      const parts: Part[] = [];
      for (const p of m.content as Record<string, unknown>[]) {
        if (p?.type === "text" && typeof p.text === "string") parts.push({ type: "text", text: p.text.slice(0, 20_000) });
        else if (p?.type === "image_url") {
          const url = (p.image_url as { url?: unknown } | undefined)?.url;
          if (typeof url !== "string" || !DATA_IMAGE.test(url) || url.length > STUDIO_LIMITS.maxImageBytes * 1.4) throw bad("Images must be PNG, JPEG, WebP or GIF under 4 MB.");
          if (++images > STUDIO_LIMITS.maxImages) throw bad(`At most ${STUDIO_LIMITS.maxImages} images per session.`);
          parts.push({ type: "image_url", image_url: { url } });
        }
      }
      out.push({ role: "user", content: parts });
    } else if (m.role === "assistant") {
      const calls = Array.isArray(m.tool_calls) ? (m.tool_calls as ToolCall[]).filter((c) => c && typeof c.id === "string" && typeof c.function?.name === "string").map((c) => ({ id: c.id, type: "function" as const, function: { name: c.function.name, arguments: String(c.function.arguments ?? "{}").slice(0, 200_000) } })) : [];
      out.push({ role: "assistant", content: typeof m.content === "string" ? m.content.slice(0, 20_000) : null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else if (m.role === "tool") {
      if (typeof m.tool_call_id !== "string") throw bad("Bad tool result.");
      out.push({ role: "tool", tool_call_id: m.tool_call_id, content: String(m.content ?? "").slice(0, STUDIO_LIMITS.maxToolResultChars) });
    } else {
      throw bad("Unknown message role.");
    }
  }
  return out;
}

export type StudioTurn = {
  /** The model's reply exactly as it goes back into the conversation (with its tool calls). */
  message: { role: "assistant"; content: string | null; tool_calls?: ToolCall[] };
  text: string;
  actions: { id: string; name: string; args: Record<string, unknown>; risk: Risk }[];
  /** Calls to tools Keplar does not run; the page answers them with a "not available" result so the conversation stays valid. */
  blocked: { id: string; name: string }[];
  done: boolean;
  units: number;
};

type ChatCompletion = {
  choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  error?: { message?: string };
};

/** One model turn: check credits, ask Fable 5, charge the real cost, return the reply and the labelled actions. */
export async function runStudioTurn(
  ws: Workspace,
  input: { messages: StudioMessage[]; tools: ReturnType<typeof buildTools> },
  deps: { fetch?: typeof fetch; now?: () => string } = {},
): Promise<StudioTurn> {
  const spec = catalogById.get(STUDIO_MODEL);
  const slug = spec ? openRouterSlug(spec) : null;
  const key = liveEnv().openRouterKey;
  if (!spec || !slug || !key) throw new HttpError(503, "Studio mode is not available right now.", "unavailable");
  await assertCanSpend(ws, STUDIO_LIMITS.reserveUnits, { kind: "agent" });

  const doFetch = deps.fetch ?? fetch;
  const res = await doFetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": "Keplar Studio mode", "http-referer": "https://keplar.one" },
    body: JSON.stringify({
      model: slug,
      messages: [{ role: "system", content: [{ type: "text", text: STUDIO_SYSTEM, cache_control: { type: "ephemeral" } }] }, ...input.messages],
      tools: input.tools,
      tool_choice: "auto",
      parallel_tool_calls: false,
      max_tokens: STUDIO_LIMITS.maxOutputTokens,
      usage: { include: true },
    }),
    signal: AbortSignal.timeout(STUDIO_LIMITS.timeoutMs),
  });
  const data = (await res.json().catch(() => ({}))) as ChatCompletion;
  if (!res.ok || !data.choices?.length) throw new HttpError(502, "The model did not answer. Try again in a moment.", "upstream");

  const prompt = data.usage?.prompt_tokens ?? 0;
  const completion = data.usage?.completion_tokens ?? 0;
  const usd = typeof data.usage?.cost === "number" && data.usage.cost > 0 ? data.usage.cost : callCostUsd(spec, prompt, completion, (deps.now ?? (() => new Date().toISOString()))()) ?? 0;
  const metered = usd * METER_MARGIN;
  const units = usd > 0 ? await chargeUnits(ws, "studio.agent", toUnits(metered), metered) : 0;

  const choice = data.choices[0]!;
  const actions: StudioTurn["actions"] = [];
  const blocked: StudioTurn["blocked"] = [];
  for (const c of choice.message?.tool_calls ?? []) {
    let args: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(c.function.arguments || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed;
    } catch { /* malformed arguments: the call is returned with none and Studio will say so */ }
    const risk = riskOf(c.function.name, args);
    if (risk === "blocked") blocked.push({ id: c.id, name: c.function.name });
    else actions.push({ id: c.id, name: c.function.name, args, risk });
  }
  const calls = choice.message?.tool_calls ?? [];
  const message: StudioTurn["message"] = { role: "assistant", content: choice.message?.content ?? null, ...(calls.length ? { tool_calls: calls } : {}) };
  return { message, text: (choice.message?.content ?? "").trim(), actions, blocked, done: calls.length === 0, units };
}
