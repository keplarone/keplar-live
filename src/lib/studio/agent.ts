/**
 * Roblox Studio mode, server side: one turn of the Studio co-creator.
 *
 * The desktop app runs Roblox Studio's own MCP server on the person's computer (keplar-desktop, src/main/studio). The page sends
 * the conversation so far plus Studio's tool definitions here; this module asks Opus 5.5 for the next reply and the Studio
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
import { MODEL_LOCK_HEADER } from "@/lib/cost/meter";

export const STUDIO_MODEL = "claude-opus-5-5";

/**
 * Roblox Studio mode runs on Claude Opus 5.5 through OpenRouter and nothing else: no fallback to another model, no user model
 * switch, no cheaper model behind the scenes (deterministic tools are fine; they are not models). The OpenRouter id lives in
 * KEPLAR_ROBLOX_MODEL_ID (server only) so a rename can be followed without a deploy, but only an Opus 5.5 id is accepted: any
 * other value pauses Studio mode instead of running on it. Verified against OpenRouter's model list on 2026-10-11:
 * anthropic/claude-opus-5.5, $4 per million input tokens and $20 per million output tokens.
 */
export const ROBLOX_MODEL_DEFAULT = "anthropic/claude-opus-5.5";
const OPUS_55_ID = /^anthropic\/claude-opus-5\.5$/;
export function robloxModelId(env: Record<string, string | undefined> = process.env): string {
  const v = env.KEPLAR_ROBLOX_MODEL_ID?.trim();
  if (!v) return ROBLOX_MODEL_DEFAULT;
  if (!OPUS_55_ID.test(v)) throw new HttpError(503, "Studio mode is paused: its model setting is not Claude Opus 5.5, and it never runs on another model.", "model_config");
  return v;
}

/** OpenRouter's answer is from the locked model (it may add a dated suffix, never a different model). */
export const answeredByLockedModel = (requested: string, answered: unknown) => typeof answered === "string" && (answered === requested || answered.startsWith(`${requested}-`) || answered.startsWith(`${requested}:`));
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
  /** Thinking before each step (billed as output, the expensive side): enough to plan a step, not to re-plan the whole build each turn. */
  reasoningTokens: 3_000,
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
  // Play-testing is the person's job (the Play test button in Keplar calls Studio directly, at no model cost). Not offered to the
  // model: each play-test step was a paid turn, and their schemas were sent with every request.
  start_stop_play: "blocked",
  character_navigation: "blocked",
  user_mouse_input: "blocked",
  user_keyboard_input: "blocked",
  generate_texture: "destructive", // re-textures the source in place
  http_get: "blocked", // fetches any URL from the person's computer
  store_image: "blocked", // reads a local file path
  upload_image: "destructive", // publishes images to the person's Roblox account: always asks, public https images only
  subagent: "blocked", // hands the session to another AI outside Keplar's approvals
};

/** Luau that deletes, wipes, publishes, spends or reaches outside the place is always shown for approval. */
const DESTRUCTIVE_LUAU = /:\s*Destroy\s*\(|ClearAllChildren|:\s*Remove\s*\(|\.Parent\s*=\s*nil|Debris\s*:|DataStoreService|MessagingService|MarketplaceService|TeleportService|HttpService|SavePlace|PublishAsync|SetAsync|RemoveAsync|loadstring|require\s*\(\s*\d/i;
/**
 * Luau that hides what it calls, so the word list above can't see it, also always asks. The model reads scripts from Creator Store
 * assets it inserts; text in a malicious asset can try to get destructive code past "auto-approve safe changes" by spelling it
 * indirectly: obj["Des".."troy"](obj), obj["Destroy"](obj), game:GetService("Http".."Service"), game:GetService(name),
 * string.char(...), "\68\101..." escapes, getfenv / setfenv / rawget / debug, or ["Parent"] = nil. Ordinary procedural builds
 * ("Tree"..i names, tables, loops) don't match.
 */
const HIDDEN_LUAU = /\bDestroy\b|\[\s*["']Parent["']\s*\]\s*=\s*nil|\[[^\]\n]*\.\.[^\]\n]*\]|:\s*GetService\s*\(\s*(?!["'][A-Za-z]+["']\s*\))|\b(?:getfenv|setfenv|rawget|rawset|newproxy)\b|\bdebug\s*\.|\bstring\s*\.\s*char\b|\(\s*["'][^"']*["']\s*\)\s*:\s*char\b|\\(?:\d{1,3}|x[0-9a-fA-F]{2}|u\{)/;

/** An image the uploader may fetch: a public https URL, never a file, localhost or a private network address. */
export function isUploadableImageUrl(v: unknown): boolean {
  if (typeof v !== "string" || v.length > 2048) return false;
  let u: URL;
  try { u = new URL(v); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h.includes(".") && !h.includes(":")) return false;
  if (/(^|\.)(localhost|local|internal|lan|home|test)$/.test(h)) return false;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(h)) return false;
  if (h.includes(":") && (h === "::1" || /^(fc|fd|fe80|::ffff:)/.test(h))) return false;
  return true;
}

export function riskOf(name: string, args: Record<string, unknown>): Risk | "blocked" {
  const base = STUDIO_TOOL_POLICY[name] ?? "blocked";
  if (name === "upload_image") {
    const paths = args.imagePaths;
    return Array.isArray(paths) && paths.length > 0 && paths.length <= 10 && paths.every(isUploadableImageUrl) ? "destructive" : "blocked";
  }
  if (base !== "change") return base;
  if (name === "execute_luau" && typeof args.code === "string" && (DESTRUCTIVE_LUAU.test(args.code) || HIDDEN_LUAU.test(args.code))) return "destructive";
  if (name === "multi_edit" && Array.isArray(args.edits) && args.edits.some((e) => e && typeof e === "object" && (e as { new_string?: unknown }).new_string === "")) return "destructive";
  return "change";
}

export const STUDIO_SYSTEM = `You are Keplar, a senior Roblox developer, builder and technical artist working inside Roblox Studio with the person through Studio's own tools. The person approves changes; your job is to deliver work that looks and plays like it came from a top Roblox studio. Try hard. A thin, placeholder or half-finished result is a failure.

How you work:
1. Find the place: each request starts with the Workspace tree and the studio_id to use in every call (the first request of a session also has a screenshot). Read them closely before planning. Without them, call list_roblox_studios first; if several places are open, ask which one.
2. Understand before building: use get_studio_state, search_game_tree, inspect_instance, script_search and script_read to learn what is already there. They are text and cheap; a screenshot is not, so take one only when you truly cannot work something out from the tree and properties. Build on what exists; never assume.
3. Read the request generously. "A sci-fi city" means a dense skyline of varied buildings with real silhouettes, streets, props, signage, lighting, atmosphere and life (moving traffic, effects), not a few boxes. Fill in the details a great developer would add without being asked, while staying true to what was asked.
4. Plan: before the first change, write a numbered plan (4 to 10 steps, as "1. …" lines) covering structure, visuals and scripts. Then carry out every step, and start the message for each step with "Step N:" (for example "Step 3: Lighting the night scene."), so the person can follow your progress. Do not stop after the plan, and do not stop halfway to ask whether to continue; only ask when something is genuinely ambiguous or risky.
5. Build in big, well-made steps: one execute_luau call can create hundreds of instances procedurally (loops, random variation with a fixed seed, helper functions), so build whole districts, UIs or systems per call instead of a part at a time. Write scripts complete and working, not stubs or TODOs.
6. Check your own code, cheaply: after running a script, read get_console_output and fix any error it shows. Do not take screenshots to admire or re-check your work, and do not play-test: the person play-tests in Studio themselves and tells you what to change. Get it right the first time by building carefully from the tree, sizes and positions you already know.
7. When you are unsure how an API or Studio feature works, use the skill tool to look it up instead of guessing.
8. Finish when every plan step is done. End with a short summary of what you built and where it lives in the Explorer, then a "How to test it" list: 2 to 5 concrete things for the person to try in a play test (press Play, walk to the shop, press E on the door: it should open), so they can tell you exactly what to change. Keep follow-ups small: when they report a problem, fix that, not the whole build.

References: when the person attached reference images or video frames, study them closely and match them: layout, proportions, color palette, materials, lighting mood, typography, motion and timing. Say in one line what you took from them, and compare your screenshots against them before finishing.

Textures for VFX and UI (always for effects or interface work, and above all when matching reference images):
- First look through Zonito's particle pack, the free VFX texture pack by its creator Z0nito on the Creator Store (asset id 14605502518): insert it into ServerStorage as a library (a folder named TextureLibrary), inspect its ParticleEmitters, Beams, Trails and Decals, and reuse the texture ids and emitter settings that fit the request. Copy only what you use into the build; leave the library out of Workspace. Use search_asset (creator_store, free) for anything else you need, preferring free assets from the original creator, never reuploads.
- If nothing there fits, make your own textures in Studio instead of settling: for VFX, Roblox's built-in particle textures (rbxasset://textures/particles/...), layered Beams and Trails with tuned width, curve, light emission and Color/Transparency sequences, flipbook-style emitters and Neon or ForceField parts; for UI, UIGradient, UIStroke, UICorner, layered Frames, 9-slice images and built-in icons, so the look matches the reference without needing new uploads.
- When the reference needs custom artwork that neither the pack nor Studio-made textures can match (a logo, a hand-drawn icon set, a specific flipbook or decal), you may upload new images with upload_image: it publishes them to the person's Roblox account as new image assets, so each upload waits for their approval. Pass public https image URLs only (up to 10 per call; no local files or private addresses), say in one line what each image is for, upload only what the build uses, then apply the returned rbxassetid:// ids. Uploaded images go through Roblox moderation and can take a moment before they show.

Quality bar:
- Luau: clean, organized, typed where useful, no deprecated APIs (use task.wait/task.spawn, not wait/spawn). Server code in ServerScriptService, shared ModuleScripts in ReplicatedStorage with clear APIs, client code in StarterPlayerScripts or StarterGui. Every new script starts with a short comment header: what it does and how it connects. Handle edge cases (players leaving, respawns, nil checks).
- Structure: everything you build goes in clearly named Folders and Models (PascalCase), never loose in Workspace. Anchor static parts, set CanCollide/CanQuery deliberately, and group repeated pieces so they are easy to edit.
- Building: varied heights, widths and details; use Materials, color palettes and trim to avoid flat blocks; use MeshParts or Creator Store assets (search_asset, insert_asset) when they would look clearly better than parts; generate_procedural_model or generate_mesh for bespoke props.
- Lighting: choose the technology that fits (Future for showcase, ShadowMap for balance), set Atmosphere, Sky, Bloom, ColorCorrection and SunRays deliberately to create a mood, and add local lights (PointLight, SurfaceLight, neon) where they sell the scene.
- UI: ScreenGui with ResetOnSpawn off, scale-based sizing that works on phones and desktop, UICorner, UIStroke, UIPadding and layout objects, a consistent palette and type scale, TweenService for motion, hover and press feedback.
- Effects: ParticleEmitter, Beam, Trail and Attachments with tuned Rate, Lifetime, Speed, Size, Transparency and Color sequences; layered (core, glow, sparks, smoke) and performant. Follow the VFX craft rules below.

VFX craft (flipbooks, emission and light):
- Flipbooks animate a sprite sheet on each particle. The texture must be exactly 1024x1024: FlipbookLayout Grid2x2 (4 frames of 512px), Grid4x4 (16 of 256px), Grid8x8 (64 of 128px), or Custom with FlipbookSizeX/FlipbookSizeY frames across and down. Use the layout the texture's creator states; never guess a grid.
- FlipbookMode: OneShot plays every frame once across the particle's Lifetime (impacts, explosions, slashes, puffs: set Lifetime to how long the animation should last, about 0.25 to 0.8 s); Loop and PingPong run at FlipbookFramerate (a NumberRange, usually 20 to 30 fps) for fire, smoke, energy and auras, with FlipbookStartRandom on so neighboring particles don't move in sync; Random picks a frame per particle (sparkles, debris variants).
- Creator Store "decal" ids are not image ids. Before using one as a Texture, resolve it in memory: InsertService:LoadAsset(decalId), read the Decal's Texture (an rbxassetid:// image id), then destroy the loaded model; never parent it.
- After parenting a flipbook emitter, read its FlipbookIncompatible property. Empty means the sheet is valid. Any message means the image is not 1024x1024: switch to another sheet or turn the layout off; never ship a broken flipbook.
- Light: self-lit effects (fire, magic, energy, sparks, lasers, glows) get LightEmission 1 (additive), LightInfluence 0 and Brightness 2 to 6 on the bright core so it blooms; their soft outer glow stays at Brightness 1 to 2 with high transparency. Smoke, dust, water and debris get LightEmission 0 and LightInfluence 1 so the scene lights them and they look solid; keep them darker than the glow and give them a lower ZOffset so they sit behind it. Beams and Trails used as energy follow the same rule (LightEmission 1, LightInfluence 0, FaceCamera on, TextureMode Wrap with TextureSpeed for flow).
- Color and fade: ColorSequence from near-white at the hottest point to the hue to a darker hue (pure saturated color at full emission clips to white); Transparency fades in fast (first 5 to 10 percent) and eases out; Size grows or shrinks over life instead of popping; Rotation and RotSpeed ranges plus Squash or VelocityParallel orientation for sparks and slashes, Drag to make bursts settle.
- Layer each effect: a bright core, a soft glow, the flipbook body, sparks, lit smoke behind, and a PointLight (Shadows off) tweened up and down with the burst. Bursts use Rate 0 and :Emit(count) from a script; store the count in an EmitCount attribute on each emitter and the delay in EmitDelay, and play effects through one ModuleScript in ReplicatedStorage (for example VFX.play(name, cframe)) that clones a template from ReplicatedStorage.VFX, emits, and cleans up after the longest Lifetime.
- Bloom makes emission read as light: Lighting.Bloom Intensity about 0.5 to 1, Size 24 to 40, Threshold about 0.9 to 1.2, so only cores with Brightness above 1 glow and the rest of the scene stays clean. Tune it once per place, not per effect.
- Performance: keep each effect to a few hundred live particles at most, prefer fewer larger flipbook particles over many small ones (additive overdraw is the main cost), disable looping emitters the player can't see, and never leave a high Rate running for a burst.

High-quality textures, in this order: Zonito's particle pack (above); then the flipbook sheets below, whose creators state the layout and mode (each already resolved to its image id; still check FlipbookIncompatible after parenting); then search_asset (creator_store, free, assetType Image or Decal, query such as "flipbook smoke"). Choose originals whose description states the grid and mode, from creators with a consistent set; skip reuploads ("not mine"), memes, watermarked or blurry sheets and anything that looks like a screenshot.
Flipbook sheets by kirbyzaz (Creator Store): transparent smoke 1, 8x8 loop, rbxassetid://13026594575; transparent smoke 2, 4x4 loop, rbxassetid://13346862770; cartoony smoke, 8x8 OneShot, rbxassetid://11632052078; flame burst, 4x4 OneShot, rbxassetid://12360899465; flash, 4x4 OneShot, rbxassetid://12156297119; impact ring, 2x2 OneShot, rbxassetid://18350947061; solid shockwave, 4x4 OneShot, rbxassetid://9872919636; rays, 4x4 loop, rbxassetid://11817596219; star, 8x8 OneShot, rbxassetid://11676151428. Pixel-art style (only for pixel or retro looks): pixel smoke 4x4 rbxassetid://8733226116, pixel spark 4x4 rbxassetid://8733414465, pixel sparkle 4x4 OneShot rbxassetid://13448020277, pixel shockwave 8x8 OneShot rbxassetid://11817698226, pixel explosion 8x8 rbxassetid://8734114950.
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
export function buildTools(defs: unknown, policyOf: (name: string) => Risk | "blocked" | undefined = (n) => STUDIO_TOOL_POLICY[n]): { type: "function"; function: { name: string; description: string; parameters: unknown } }[] {
  if (!Array.isArray(defs)) throw bad("tools must be a list.");
  const out: { type: "function"; function: { name: string; description: string; parameters: unknown } }[] = [];
  for (const d of defs.slice(0, 80) as StudioToolDef[]) {
    if (!d || typeof d.name !== "string") continue;
    const policy = policyOf(d.name);
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
  /** What this turn really used, from OpenRouter's response (nothing estimated except usd when OpenRouter sends no cost). */
  usage: StudioUsage;
};
export type StudioUsage = { provider: string | null; model: string; promptTokens: number; cachedTokens: number; completionTokens: number; reasoningTokens: number; usd: number; latencyMs: number };

type ChatCompletion = {
  choices?: { message?: { content?: string | null; tool_calls?: ToolCall[]; reasoning_details?: unknown[] }; finish_reason?: string }[];
  model?: string;
  provider?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number; prompt_tokens_details?: { cached_tokens?: number }; completion_tokens_details?: { reasoning_tokens?: number } };
  error?: { message?: string };
};

/**
 * The conversation with a prompt-cache breakpoint on its newest message, so the whole history up to here is read from the cache on
 * the next turn (a cached read costs a tenth of a fresh one). Without it, every turn re-sent every earlier build script, tool
 * result and screenshot at full price. The system prompt and tools carry their own breakpoint.
 */
export function withCacheBreakpoint(messages: StudioMessage[]): unknown[] {
  const out: unknown[] = messages.slice();
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    const parts: Record<string, unknown>[] | null = typeof m.content === "string" ? (m.content ? [{ type: "text", text: m.content }] : null) : Array.isArray(m.content) ? m.content.map((p) => ({ ...p })) : null;
    if (!parts) continue; // an assistant turn with only tool calls: mark the message before it
    const at = parts.map((p) => p.type).lastIndexOf("text");
    if (at < 0) continue;
    parts[at] = { ...parts[at], cache_control: { type: "ephemeral" } };
    out[i] = { ...m, content: parts };
    return out;
  }
  return out;
}

/** What differs between the desktop co-builders (Roblox Studio, Blender): prompt, tool policy, budgets and the meter label. */
export type TurnProfile = {
  system: string;
  riskOf: (name: string, args: Record<string, unknown>) => Risk | "blocked";
  meter: string;
  title: string;
  maxOutputTokens: number;
  reasoningTokens: number;
  /** Roblox Studio: always Claude Opus 5.5 (robloxModelId), never substituted, even by the cost meter's guardrails. */
  lockedModel?: boolean;
  /** Share of the metered cost charged as credits (default 1). The ledger still records the full provider cost. */
  creditRate?: number;
};
/**
 * Roblox building (Studio mode and Roblox Cloud) is charged 30% fewer credits than the usual rate: Opus 5.5 turns are long and a
 * build takes many of them. At 0.7 a credit stands for $0.0026 of provider cost, so credits sold at $0.0073-0.0083 (Lite, Plus,
 * Pro, Studio top-ups) still keep a ~64-69% gross margin when every credit is used.
 */
export const ROBLOX_CREDIT_RATE = 0.7;
export const STUDIO_PROFILE: TurnProfile = { system: STUDIO_SYSTEM, riskOf, meter: "studio.agent", title: "Keplar Studio mode", maxOutputTokens: STUDIO_LIMITS.maxOutputTokens, reasoningTokens: STUDIO_LIMITS.reasoningTokens, lockedModel: true, creditRate: ROBLOX_CREDIT_RATE };

/** One model turn: check credits, ask Opus 5.5 (thinking first), charge the real cost, return the reply and the labelled actions. */
export async function runStudioTurn(
  ws: Workspace,
  input: { messages: StudioMessage[]; tools: ReturnType<typeof buildTools> },
  deps: { fetch?: typeof fetch; now?: () => string } = {},
  profile: TurnProfile = STUDIO_PROFILE,
): Promise<StudioTurn> {
  const spec = catalogById.get(STUDIO_MODEL);
  const slug = profile.lockedModel ? robloxModelId() : spec ? openRouterSlug(spec) : null;
  const key = liveEnv().openRouterKey;
  if (!spec || !slug || !key) throw new HttpError(503, "Studio mode is not available right now.", "unavailable");
  await assertCanSpend(ws, STUDIO_LIMITS.reserveUnits, { kind: "agent", dailySafetyCap: false });

  const doFetch = deps.fetch ?? fetch;
  const ask = (messages: unknown[]) => doFetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": profile.title, "http-referer": "https://keplar.one", ...(profile.lockedModel ? { [MODEL_LOCK_HEADER]: "1" } : {}) },
    body: JSON.stringify({
      model: slug,
      messages: [{ role: "system", content: [{ type: "text", text: profile.system, cache_control: { type: "ephemeral" } }] }, ...messages],
      tools: input.tools,
      tool_choice: "auto",
      parallel_tool_calls: false,
      max_tokens: profile.maxOutputTokens,
      reasoning: { max_tokens: profile.reasoningTokens },
      usage: { include: true },
    }),
    signal: AbortSignal.timeout(STUDIO_LIMITS.timeoutMs),
  });
  // Cache the conversation too. If the provider ever rejects the marker's shape (a 400, which is not billed), ask again exactly as
  // before, with only the system prompt cached, so caching can only lower the cost and never break a turn.
  const t0 = Date.now();
  let res = await ask(withCacheBreakpoint(input.messages));
  if (res.status === 400) res = await ask(input.messages);
  const data = (await res.json().catch(() => ({}))) as ChatCompletion;
  const latencyMs = Date.now() - t0;
  if (profile.lockedModel && !res.ok) {
    // Never substitute: say why Opus 5.5 could not answer and stop the turn safely (the page pauses the build).
    console.error(`[studio] ${slug} failed: status ${res.status}${data.error?.message ? ` (${data.error.message.slice(0, 120)})` : ""} after ${latencyMs} ms`);
    if (res.status === 402 || res.headers.get("x-keplar-guard") === "model_locked") throw new HttpError(503, "Studio mode is paused: Claude Opus 5.5 can't be used right now, and Studio never switches to another model. Try again later.", "model_unavailable");
    if (res.status === 429 || res.status >= 500) throw new HttpError(503, "Claude Opus 5.5 is busy right now. Your build is paused; try again in a moment.", "model_busy");
  }
  if (!res.ok || !data.choices?.length) throw new HttpError(502, "The model did not answer. Try again in a moment.", "upstream");
  if (profile.lockedModel && !answeredByLockedModel(slug, data.model)) {
    // Not charged and not used: an answer from any other model is discarded.
    console.error(`[studio] discarded an answer from ${String(data.model).slice(0, 80)}; requested ${slug}`);
    throw new HttpError(503, "Studio mode is paused: the answer did not come from Claude Opus 5.5, so it was not used and not charged.", "model_mismatch");
  }

  const prompt = data.usage?.prompt_tokens ?? 0;
  const completion = data.usage?.completion_tokens ?? 0;
  const usd = typeof data.usage?.cost === "number" && data.usage.cost > 0 ? data.usage.cost : callCostUsd(spec, prompt, completion, (deps.now ?? (() => new Date().toISOString()))()) ?? 0;
  const metered = usd * METER_MARGIN;
  const units = usd > 0 ? await chargeUnits(ws, profile.meter, toUnits(metered * (profile.creditRate ?? 1)), metered, undefined, { dailySafetyCap: false }) : 0;
  const usage: StudioUsage = {
    provider: typeof data.provider === "string" ? data.provider.slice(0, 40) : null,
    model: typeof data.model === "string" ? data.model.slice(0, 80) : slug,
    promptTokens: prompt,
    cachedTokens: data.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    completionTokens: completion,
    reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
    usd: Math.round(usd * 1e6) / 1e6,
    latencyMs,
  };
  const cachedIn = usage.cachedTokens;
  console.info(`[${profile.meter}] ${usage.model} via ${usage.provider ?? "?"}: ${prompt} in (${cachedIn} cached), ${completion} out, $${usage.usd} in ${latencyMs} ms`);

  const choice = data.choices[0]!;
  const actions: StudioTurn["actions"] = [];
  const blocked: StudioTurn["blocked"] = [];
  for (const c of choice.message?.tool_calls ?? []) {
    let args: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(c.function.arguments || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed;
    } catch { /* malformed arguments: the call is returned with none and Studio will say so */ }
    const risk = profile.riskOf(c.function.name, args);
    if (risk === "blocked") blocked.push({ id: c.id, name: c.function.name });
    else actions.push({ id: c.id, name: c.function.name, args, risk });
  }
  const calls = choice.message?.tool_calls ?? [];
  const reasoning = choice.message?.reasoning_details;
  const keepReasoning = Array.isArray(reasoning) && reasoning.length > 0 && JSON.stringify(reasoning).length <= STUDIO_LIMITS.maxReasoningChars;
  const message: StudioTurn["message"] = { role: "assistant", content: choice.message?.content ?? null, ...(calls.length ? { tool_calls: calls } : {}), ...(keepReasoning ? { reasoning_details: reasoning } : {}) };
  return { message, text: (choice.message?.content ?? "").trim(), actions, blocked, done: calls.length === 0, units, usage };
}
