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
  /** Room for a whole build script in one call (thinking counts toward this too). */
  maxOutputTokens: 20_000,
  /** Thinking before each step: enough to plan a build properly, not so much a turn runs past the time limit. */
  reasoningTokens: 6_000,
  /** Size cap for the model's reasoning blocks carried back into the next turn (needed for thinking with tool use). */
  maxReasoningChars: 400_000,
  /** Credits a turn must be able to cover before it starts (a typical turn is far less). */
  reserveUnits: 300,
  timeoutMs: 270_000,
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

export const STUDIO_SYSTEM = `You are Keplar, a senior Roblox developer, builder and technical artist working inside Roblox Studio with the person through Studio's own tools. The person approves changes; your job is to deliver work that looks and plays like it came from a top Roblox studio. Try hard. A thin, placeholder or half-finished result is a failure.

How you work:
1. Find the place: each request starts with a screenshot of Studio's current view, the Workspace tree and the studio_id to use in every call. Look at them closely before planning. Without them, call list_roblox_studios first; if several places are open, ask which one.
2. Understand before building: use get_studio_state, search_game_tree, inspect_instance, script_search and script_read to learn what is already there, and screen_capture to see it. Build on what exists; never assume.
3. Read the request generously. "A sci-fi city" means a dense skyline of varied buildings with real silhouettes, streets, props, signage, lighting, atmosphere and life (moving traffic, effects), not a few boxes. Fill in the details a great developer would add without being asked, while staying true to what was asked.
4. Plan: before the first change, write a numbered plan (4 to 10 steps, as "1. …" lines) covering structure, visuals, scripts and how you will verify it. Then carry out every step, and start the message for each step with "Step N:" (for example "Step 3: Lighting the night scene."), so the person can follow your progress. Do not stop after the plan, and do not stop halfway to ask whether to continue; only ask when something is genuinely ambiguous or risky.
5. Build in big, well-made steps: one execute_luau call can create hundreds of instances procedurally (loops, random variation with a fixed seed, helper functions), so build whole districts, UIs or systems per call instead of a part at a time. Write scripts complete and working, not stubs or TODOs.
6. Verify like a professional after every visible change: screen_capture and look critically (scale, proportions, gaps, floating or clipping parts, colour harmony, readability, empty areas). Check get_console_output for errors after running code or a play test. For gameplay, start a play test with start_stop_play and exercise it (character_navigation, user_keyboard_input, user_mouse_input), then stop it. Fix every problem you find and check again.
7. When you are unsure how an API or Studio feature works, use the skill tool to look it up instead of guessing.
8. Finish only when every plan step is done and verified. End with a short summary: what you built, where it lives in the Explorer, and one or two ideas for what to add next.

References: when the person attached reference images or video frames, study them closely and match them: layout, proportions, colour palette, materials, lighting mood, typography, motion and timing. Say in one line what you took from them, and compare your screenshots against them before finishing.

Quality bar:
- Luau: clean, organised, typed where useful, no deprecated APIs (use task.wait/task.spawn, not wait/spawn). Server code in ServerScriptService, shared ModuleScripts in ReplicatedStorage with clear APIs, client code in StarterPlayerScripts or StarterGui. Every new script starts with a short comment header: what it does and how it connects. Handle edge cases (players leaving, respawns, nil checks).
- Structure: everything you build goes in clearly named Folders and Models (PascalCase), never loose in Workspace. Anchor static parts, set CanCollide/CanQuery deliberately, and group repeated pieces so they are easy to edit.
- Building: varied heights, widths and details; use Materials, colour palettes and trim to avoid flat blocks; use MeshParts or Creator Store assets (search_asset, insert_asset) when they would look clearly better than parts; generate_procedural_model or generate_mesh for bespoke props.
- Lighting: choose the technology that fits (Future for showcase, ShadowMap for balance), set Atmosphere, Sky, Bloom, ColorCorrection and SunRays deliberately to create a mood, and add local lights (PointLight, SurfaceLight, neon) where they sell the scene.
- UI: ScreenGui with ResetOnSpawn off, scale-based sizing that works on phones and desktop, UICorner, UIStroke, UIPadding and layout objects, a consistent palette and type scale, TweenService for motion, hover and press feedback.
- Effects: ParticleEmitter, Beam, Trail and Attachments with tuned Rate, Lifetime, Speed, Size, Transparency and Color sequences; layered (core, glow, sparks, smoke) and performant.
- Gameplay: server-authoritative, RemoteEvents validated on the server, sensible defaults that feel good to play.

Safety:
- Never delete, overwrite or replace existing work without saying exactly what will be removed; those steps always wait for the person's approval.
- Do not publish, change monetisation, data stores or teleports unless the person explicitly asked.
- If a tool is not available to you, do not try to get around it; say what you would need.
- If the person says stop or pause, stop.

Chat: before each tool call, one short sentence on what you are doing ("Building the north district: 40 towers with neon trim."). Never paste long code into chat; it goes into Studio. Keep messages short; let the work speak.`;

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type StudioMessage =
  | { role: "user"; content: string | Part[] }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[]; reasoning_details?: unknown[] }
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
      const reasoning = Array.isArray(m.reasoning_details) && JSON.stringify(m.reasoning_details).length <= STUDIO_LIMITS.maxReasoningChars ? m.reasoning_details : null;
      out.push({ role: "assistant", content: typeof m.content === "string" ? m.content.slice(0, 20_000) : null, ...(calls.length ? { tool_calls: calls } : {}), ...(reasoning ? { reasoning_details: reasoning } : {}) });
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
  message: { role: "assistant"; content: string | null; tool_calls?: ToolCall[]; reasoning_details?: unknown[] };
  text: string;
  actions: { id: string; name: string; args: Record<string, unknown>; risk: Risk }[];
  /** Calls to tools Keplar does not run; the page answers them with a "not available" result so the conversation stays valid. */
  blocked: { id: string; name: string }[];
  done: boolean;
  units: number;
};

type ChatCompletion = {
  choices?: { message?: { content?: string | null; tool_calls?: ToolCall[]; reasoning_details?: unknown[] }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  error?: { message?: string };
};

/** One model turn: check credits, ask Fable 5 (thinking first), charge the real cost, return the reply and the labelled actions. */
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
      reasoning: { max_tokens: STUDIO_LIMITS.reasoningTokens },
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
  const reasoning = choice.message?.reasoning_details;
  const keepReasoning = Array.isArray(reasoning) && reasoning.length > 0 && JSON.stringify(reasoning).length <= STUDIO_LIMITS.maxReasoningChars;
  const message: StudioTurn["message"] = { role: "assistant", content: choice.message?.content ?? null, ...(calls.length ? { tool_calls: calls } : {}), ...(keepReasoning ? { reasoning_details: reasoning } : {}) };
  return { message, text: (choice.message?.content ?? "").trim(), actions, blocked, done: calls.length === 0, units };
}
