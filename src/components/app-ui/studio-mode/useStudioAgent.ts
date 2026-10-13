"use client";
/**
 * The Studio co-creator's run loop on the page (server turn: src/lib/studio/agent.ts, Studio access: the desktop bridge).
 *
 * One run = the person's request, then turns until the model is done, the person pauses or stops, account credits run out,
 * or the step cap is reached. Before each request Keplar looks at the place (look): the Workspace tree goes into the conversation
 * with the studio_id to use, so it builds on what is really there; only the first request of a session adds a screenshot.
 * Each turn the server returns the model's reply and labelled actions. Reads run by themselves; changes wait for Approve (or
 * run when auto-approve is on); destructive actions always wait. Results go back into the conversation: text capped, and
 * Studio screenshots as images (only the newest kept in full, to keep turns cheap).
 * Cost: the model does not screenshot or play-test its own work (each was a paid turn). When it finishes, the person play-tests
 * with the Play test button (Studio directly, no model call) and says what to change.
 * Each game's chat is saved on this device (saved-session.ts) and comes back when that game is opened again.
 * Alongside the feed it keeps what the side panel shows: the latest viewport, the plan and the current step ("Step N:"), the
 * changes made, and the run's numbers.
 *
 * Live code engine (code/): every real moment of a run is also appended to an event log (`events`, code/events.ts), and the code
 * Keplar reads, proposes and changes is derived from it as per-file documents (`code`, code/documents.ts). Script edits
 * (multi_edit) are bracketed by the page's own script_read calls (read-only, no model cost): before the edit runs for the true
 * before-content, and after it ran to confirm what was applied. A confirmed edit can be reverted (`revert`), and a failed action
 * re-run unchanged (`retry`); both go through the same approval flow as the model's own actions.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resultText, type BlenderBridge, type StudioBridge, type StudioContent } from "@/lib/desktop/studio-bridge";
import { clearSaved, deleteRemote, fetchRemote, placeKey, pushRemote, readSaved, toSaved, writeSaved, type SavedSession } from "./saved-session";
import { scaleDataUrl } from "./references";
import { appendEvent, clip, eventStamper, MAX_EVENT_TEXT, type ActionOrigin, type ReadPurpose, type StudioEvent, type StudioEventBody, type TurnUsage } from "./code/events";
import { applyEdits, buildRevert, deriveDocuments, editOutcome, isRevertLineage, multiEditSchema, parseMultiEdit, parseScriptRead, retryAvailabilityFor, type ScriptSource } from "./code/documents";
import { ROBLOX_DOCS_TOOL_NAME } from "@/lib/studio/roblox-docs-tool";

/** Keplar's roblox_docs tool, answered by Keplar (/api/studio/docs) in the same shape as a Studio tool call through the bridge. */
async function lookUpRobloxDocs(args: Record<string, unknown>): Promise<{ ok: true; result: { content: StudioContent[]; isError?: boolean } } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/studio/docs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: args.query, limit: args.limit }) });
    const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
    if (!res.ok || typeof data.text !== "string") return { ok: false, error: data.error ?? "The Roblox docs lookup failed." };
    return { ok: true, result: { content: [{ type: "text", text: data.text } as StudioContent] } };
  } catch {
    return { ok: false, error: "The Roblox docs lookup failed." };
  }
}

export type Risk = "read" | "change" | "destructive";
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export type Msg =
  | { role: "user"; content: string | Part[] }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[]; reasoning_details?: unknown[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ActionStatus = "waiting" | "running" | "done" | "failed" | "skipped";
export type Item =
  | { kind: "user"; key: string; text: string; images: string[] }
  | { kind: "keplar"; key: string; text: string }
  | { kind: "action"; key: string; name: string; args: Record<string, unknown>; risk: Risk; status: ActionStatus; summary?: string; image?: string; /** Set on actions the person started from the page (revert, retry); absent on the model's. */ origin?: Exclude<ActionOrigin, "model">; /** The action a revert or retry refers to. */ of?: string }
  | { kind: "look"; key: string; image?: string; text: string }
  | { kind: "note"; key: string; text: string; tone?: "warn" };

/** An open Studio: id is this Studio session's (it changes every launch); placeId is the game's own, when Studio says it. */
export type Place = { id: string; name: string; placeId?: string; /** The saved-chat key when it is not a Roblox place (Blender: the .blend file). */ saveKey?: string };
export type PlanStep = { text: string; state: "done" | "doing" | "next" };
export type Viewport = { image: string; at: number };

type Turn = { message: Extract<Msg, { role: "assistant" }>; text: string; actions: { id: string; name: string; args: Record<string, unknown>; risk: Risk }[]; blocked: { id: string; name: string }[]; done: boolean; units: number; /** Real usage (servers that send it). */ usage?: TurnUsage & { usd?: number }; /** The Solar mode the server ran (servers that send it). */ mode?: string | null };

/** One action to run: the model's tool call (id = its call id), or a page action (revert, retry: id null). */
type RunnableAction = { id: string | null; name: string; args: Record<string, unknown>; risk: Risk; /** Always wait for the person (a revert, or a retry of one), whatever auto-approve says. */ ask?: boolean };
type ActionResult = { outcome: "skipped" } | { outcome: "failed"; text: string } | { outcome: "done"; text: string; image?: string };

export type StudioAgentOptions = {
  /** The Solar mode to send with each request (src/lib/studio/solar-modes.ts). Omitted: the server's default (Medium). */
  solarMode?: string | null;
};

export const RUN_STEP_CAP = 80;

/** Shown when a run that changed the place finishes: the person tests it (no model turns spent on self-review or play tests). */
export const YOUR_TURN = "Your turn: press Play test, try what Keplar built (it lists what to check), then stop the test and tell Keplar what to change.";

/** A short human line for an action card ("Run Luau", "Read script ServerScriptService.Spawn"). */
export function describeAction(name: string, args: Record<string, unknown>): string {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  switch (name) {
    case "list_roblox_studios": return "Find the open Studio";
    case "get_studio_state": return "Check Studio's state";
    case "search_game_tree": return `Look through the game tree${s(args.path) ? ` at ${s(args.path)}` : ""}`;
    case "inspect_instance": return `Inspect ${s(args.path) || "an instance"}`;
    case "script_search": return `Find scripts named “${s(args.keywords)}”`;
    case "script_grep": return `Search scripts for “${s(args.query)}”`;
    case "script_read": return `Read ${s(args.target_file) || "a script"}`;
    case "get_console_output": return "Read the output log";
    case "screen_capture": return "Take a screenshot";
    case "search_asset": return `Search the Creator Store for “${s(args.query)}”`;
    case "skill": return `Look up ${s(args.skill_name) || "a reference"}`;
    case ROBLOX_DOCS_TOOL_NAME: return `Check the Roblox docs for “${s(args.query).slice(0, 60)}”`;
    case "wait_job_finished": return "Wait for a generation to finish";
    case "multi_edit": return `Edit ${s(args.file_path) || "a script"}`;
    case "execute_luau": return "Run Luau in Studio";
    case "insert_asset": return `Insert ${s(args.assetName) || "an asset"}`;
    case "generate_procedural_model": return `Build a model: ${s(args.prompt).slice(0, 60)}`;
    case "generate_mesh": return `Generate a mesh: ${s(args.textPrompt).slice(0, 60)}`;
    case "generate_material": return `Create a material: ${s(args.materialDescription).slice(0, 60)}`;
    case "generate_texture": return `Re-texture: ${s(args.textPrompt).slice(0, 60)}`;
    case "upload_image": {
      const n = Array.isArray(args.imagePaths) ? args.imagePaths.length : 0;
      return `Upload ${n === 1 ? "an image" : `${n} images`} to your Roblox account`;
    }
    case "segment_mesh": return "Split a mesh into parts";
    case "start_stop_play": return args.is_start ? "Start a play test" : "Stop the play test";
    case "character_navigation": return "Move the test character";
    case "user_mouse_input": return "Click in the play test";
    case "user_keyboard_input": return "Type in the play test";
    // Blender (keplar-desktop build/blender/keplar_blender.py)
    case "scene": return "Read the scene";
    case "object": return `Inspect ${s(args.name) || "an object"}`;
    case "python": return "Run Python in Blender";
    case "view": return "Look at the viewport";
    case "ph_search": return `Search Poly Haven for “${s(args.query)}”`;
    case "ph_texture": return `Texture with ${s(args.id) || "a Poly Haven set"}`;
    case "ph_hdri": return `Light with ${s(args.id) || "an HDRI"}`;
    case "ph_model": return `Import ${s(args.id) || "a model"}`;
    case "export": return `Export ${(s(args.format) || "fbx").toUpperCase()}`;
    default: return name;
  }
}

/** The numbered plan in a Keplar message ("1. …" lines), when it has at least three steps. */
export function parsePlan(text: string): string[] | null {
  const steps = text.split("\n").map((l) => /^\s*(\d{1,2})[.)]\s+(.+?)\s*$/.exec(l)).filter((m): m is RegExpExecArray => Boolean(m)).map((m) => m[2]!.replace(/\*\*/g, ""));
  return steps.length >= 3 ? steps.slice(0, 12) : null;
}

/** The plan step a Keplar message says it is starting ("Step 3: …"), or null. */
export function stepMarker(text: string): number | null {
  const m = /^\s*\**step\s+(\d{1,2})\b/i.exec(text);
  return m ? Number(m[1]) : null;
}

/** Parses list_roblox_studios ({"studios":[{id,name}]}). */
export function parsePlaces(text: string): Place[] {
  try {
    const j = JSON.parse(text) as { studios?: unknown[] };
    return (j.studios ?? []).flatMap((x, i) => {
      const o = (x ?? {}) as Record<string, unknown>;
      const id = o.id ?? o.studioId;
      if (id === undefined) return [];
      const raw = String(o.name ?? o.placeName ?? `Studio ${i + 1}`);
      const name = raw.replace(/\s*\(placeId:\s*\d+\)\s*$/, "");
      // The game's own id (stable across launches): "Name (placeId: 123)", or a placeId field. 0 means an unpublished place.
      const placeId = /\(placeId:\s*(\d+)\)\s*$/.exec(raw)?.[1] ?? (o.placeId != null ? String(o.placeId) : "");
      return [{ id: String(id), name, ...(/^[1-9]\d*$/.test(placeId) ? { placeId } : {}) }];
    });
  } catch {
    return [];
  }
}

const key = () => Math.random().toString(36).slice(2, 10);

/** Blender's "place": the open .blend file, whose chat is saved under its name. */
export const blenderPlace = (file?: string | null): Place => {
  const name = file || "untitled.blend";
  return { id: "blender", name, saveKey: `name:blender/${name.toLowerCase()}` };
};

/** Which app the floating overlay works in; the page that opens the overlay sets it (same origin, so the overlay reads it). */
export const OVERLAY_TARGET_KEY = "keplar-overlay-target";
export function overlayTarget(): "studio" | "blender" {
  try { return localStorage.getItem(OVERLAY_TARGET_KEY) === "blender" ? "blender" : "studio"; } catch { return "studio"; }
}
export function setOverlayTarget(target: "studio" | "blender"): void {
  try { localStorage.setItem(OVERLAY_TARGET_KEY, target); } catch { /* storage blocked: the overlay opens on Studio */ }
}

function toolResult(content: StudioContent[]): { text: string; image?: string } {
  const text = content.filter((c) => c.type === "text" && c.text).map((c) => c.text).join("\n");
  const img = content.find((c) => c.type === "image" && c.data);
  return { text: text || (img ? "Screenshot captured." : "Done."), ...(img ? { image: `data:${img.mimeType ?? "image/png"};base64,${img.data}` } : {}) };
}

/** Older screenshots become a short note in history so every turn does not resend them. */
function compactScreenshots(history: Msg[]): Msg[] {
  let seen = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]!;
    if (m.role === "user" && Array.isArray(m.content) && m.content.some((p) => p.type === "text" && p.text.startsWith("Studio screenshot"))) {
      if (++seen > 1) history[i] = { role: "user", content: "(An earlier Studio screenshot was here.)" };
    }
  }
  return history;
}

/** The Workspace tree as short lines ("Workspace.NeonCity (Model) · 4 children (…)"), capped for the prompt. */
function treeLines(text: string): string {
  try {
    const nodes = JSON.parse(text) as { fullPath?: string; className?: string; childSummary?: string }[];
    return nodes.map((n) => `${n.fullPath ?? "?"} (${n.className ?? "?"})${n.childSummary ? ` · ${n.childSummary}` : ""}`).join("\n").slice(0, 6000);
  } catch {
    return text.slice(0, 6000);
  }
}

/**
 * mode "studio" works in Roblox Studio; mode "blender" works in Blender through the Keplar add-on (same loop, approvals, saving).
 * Blender looks with the text scene summary only (no screenshot) and has no play test.
 */
export function useStudioAgent(bridge: StudioBridge | BlenderBridge | null, mode: "studio" | "blender" = "studio", options: StudioAgentOptions = {}) {
  const blender = mode === "blender";
  const solarMode = useRef<string | null>(options.solarMode ?? null);
  useEffect(() => { solarMode.current = options.solarMode ?? null; }, [options.solarMode]);
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [looking, setLooking] = useState(false);
  const [units, setUnits] = useState(0);
  const [autoApprove, setAutoApprove] = useState(false);
  const [place, setPlaceState] = useState<Place | null>(null);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [shots, setShots] = useState<string[]>([]);
  const [plan, setPlan] = useState<string[]>([]);
  const [current, setCurrent] = useState(0);
  const [finished, setFinished] = useState(false);
  const [built, setBuilt] = useState<{ key: string; title: string }[]>([]);
  const [stats, setStats] = useState({ steps: 0, changes: 0, errors: 0 });
  const history = useRef<Msg[]>([]);
  const decisions = useRef(new Map<string, (ok: boolean) => void>());
  const placeRef = useRef<Place | null>(null);
  const flags = useRef({ pause: false, stop: false, units: 0, steps: 0, auto: false, changed: false, reviewed: false });

  /* The execution event log (code/events.ts): append-only, timestamped; `turn` is the model request it belongs to. */
  const [events, setEvents] = useState<StudioEvent[]>([]);
  const eventsRef = useRef<StudioEvent[]>([]);
  const stamper = useRef(eventStamper());
  const turnNo = useRef(0);
  const toolDefs = useRef<{ name: string; description?: string; inputSchema?: unknown }[]>([]);
  const emit = useCallback((body: StudioEventBody) => {
    eventsRef.current = appendEvent(eventsRef.current, stamper.current.stamp(body, turnNo.current));
    setEvents(eventsRef.current);
  }, []);
  const clearEvents = useCallback(() => {
    eventsRef.current = [];
    stamper.current.reset();
    turnNo.current = 0;
    setEvents([]);
  }, []);

  const add = useCallback((it: Item) => setItems((xs) => [...xs, it]), []);
  const patch = useCallback((k: string, p: Partial<Extract<Item, { kind: "action" }>>) => setItems((xs) => xs.map((x) => (x.key === k && x.kind === "action" ? { ...x, ...p } : x))), []);

  const showShot = useCallback((image: string) => {
    setViewport({ image, at: Date.now() });
    setShots((xs) => [image, ...xs.filter((x) => x !== image)].slice(0, 4));
  }, []);

  /** Opening a game brings back its saved chat (this device), so work continues where it stopped. */
  /** A restore is not a change: it must not be saved back (stamped "now") before the account's copy has been compared. */
  const skipSave = useRef(false);
  /** Set by the person's own activity after a restore; a slower account copy then no longer replaces what is on screen. */
  const touched = useRef(false);
  const lastPush = useRef(0);

  const apply = useCallback((saved: SavedSession | null, p: Place | null) => {
    skipSave.current = true;
    clearEvents();
    history.current = saved?.history ?? [];
    flags.current.units = saved?.units ?? 0;
    setUnits(saved?.units ?? 0);
    setPlan(saved?.plan ?? []);
    setCurrent(saved?.current ?? 0);
    setFinished(saved?.finished ?? false);
    setBuilt(saved?.built ?? []);
    setStats(saved?.stats ?? { steps: 0, changes: 0, errors: 0 });
    setItems(saved ? [...saved.items, { kind: "note", key: key(), text: `Picked up where you left off in ${p?.name ?? "this game"} (saved ${new Date(saved.savedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}). Keplar will take a fresh look before your next request.` }] : []);
  }, [clearEvents]);

  /** Opening a game brings back its saved chat: this device's copy at once, then the account's if it is newer (another computer). */
  const restore = useCallback((p: Place | null) => {
    const k = placeKey(p);
    const local = readSaved(k);
    touched.current = false;
    apply(local, p);
    void fetchRemote(k).then((remote) => {
      if (!remote || touched.current || placeKey(placeRef.current) !== k) return;
      if (remote.savedAt <= (local?.savedAt ?? 0)) return;
      writeSaved(k, remote);
      apply(remote, p);
    });
  }, [apply]);

  const setPlace = useCallback((p: Place | null) => {
    const changed = placeKey(p) !== placeKey(placeRef.current);
    placeRef.current = p;
    setPlaceState(p);
    if (changed) restore(p);
  }, [restore]);

  /** The open place to work in: the chosen one, else the first Studio lists. */
  const ensurePlace = useCallback(async (): Promise<Place | null> => {
    if (!bridge) return null;
    if (placeRef.current) return placeRef.current;
    if (blender) {
      // Blender's "place" is the open file: its chat is saved per .blend file.
      const st = await (bridge as BlenderBridge).status().catch(() => null);
      const p = blenderPlace(st?.file);
      setPlace(p);
      return p;
    }
    const r = await bridge.call("list_roblox_studios", {});
    const first = r.ok ? parsePlaces(resultText(r))[0] ?? null : null;
    setPlace(first);
    return first;
  }, [bridge, blender, setPlace]);

  /** A screenshot of Studio's current view (scaled down), or null when Studio could not take one. */
  const capture = useCallback(async (p: Place): Promise<string | null> => {
    if (!bridge) return null;
    const r = await bridge.call("screen_capture", { studio_id: p.id, capture_id: `Keplar_${Date.now()}` });
    if (!r.ok || r.result.isError) return null;
    const img = toolResult(r.result.content).image;
    return img ? scaleDataUrl(img) : null;
  }, [bridge]);

  /** Refreshes the viewport panel (no model call, no credits). */
  const refreshViewport = useCallback(async () => {
    const p = await ensurePlace();
    if (!p) return;
    setLooking(true);
    try {
      const img = await capture(p);
      if (img) showShot(img);
      emit({ kind: "studio.looked", via: "refresh", screenshot: Boolean(img), items: null, action: null });
    } finally {
      setLooking(false);
    }
  }, [ensurePlace, capture, showShot, emit]);

  /** Keplar looks at the place before a request: screenshot plus the Workspace tree, added to the conversation. */
  const look = useCallback(async () => {
    if (!bridge) return;
    const p = await ensurePlace();
    if (!p) return;
    setLooking(true);
    if (blender) {
      // Blender: the compact text summary only. A viewport image is a tool the model asks for when it truly needs one.
      try {
        const r = await bridge.call("scene", {});
        const text = r.ok && !r.result.isError ? resultText(r) : "";
        history.current.push({ role: "user", content: `The Blender scene before this request (${p.name}):
${text || "(could not read the scene)"}` });
        const count = /(\d+) objects:/.exec(text)?.[1];
        add({ kind: "look", key: key(), text: count ? `Looked at ${p.name}: ${count} object${count === "1" ? "" : "s"}.` : `Looked at ${p.name}.` });
        emit({ kind: "studio.looked", via: "scene", screenshot: false, items: count ? Number(count) : null, action: null });
      } finally {
        setLooking(false);
      }
      return;
    }
    try {
      // A screenshot is the costly part of a look (image tokens on every later turn): one per session, on its first request
      // (a resumed session counts as new, since saved chats keep no images). Follow-ups send the Workspace tree only.
      const firstLook = !history.current.some((m) => m.role === "user" && Array.isArray(m.content) && m.content.some((c) => c.type === "image_url"));
      const [img, tree] = await Promise.all([
        firstLook ? capture(p) : Promise.resolve(null),
        bridge.call("search_game_tree", { studio_id: p.id, datamodel_type: "Edit", path: "Workspace", max_depth: 2, head_limit: 80 }),
      ]);
      const treeText = tree.ok && !tree.result.isError ? treeLines(resultText(tree)) : "";
      const intro = `${img ? "Studio screenshot before this request" : "The place before this request"}: what "${p.name}" looks like right now. Use studio_id "${p.id}" in every call.${treeText ? `\nWorkspace contents:\n${treeText}` : ""}`;
      history.current.push({ role: "user", content: [{ type: "text", text: intro }, ...(img ? [{ type: "image_url" as const, image_url: { url: img } }] : [])] });
      if (img) showShot(img);
      const count = treeText ? treeText.split("\n").length : 0;
      add({ kind: "look", key: key(), ...(img ? { image: img } : {}), text: count ? `Looked at ${p.name}: ${count} item${count === 1 ? "" : "s"} in the Workspace.` : `Looked at ${p.name}.` });
      emit({ kind: "studio.looked", via: "look", screenshot: Boolean(img), items: count || null, action: null });
    } finally {
      setLooking(false);
    }
  }, [bridge, blender, ensurePlace, capture, showShot, add, emit]);

  const decide = useCallback((k: string, ok: boolean) => {
    decisions.current.get(k)?.(ok);
    decisions.current.delete(k);
  }, []);

  /** Studio's tool definitions, fetched once per run (the loop) or on demand (page actions). */
  const toolList = useCallback(async () => {
    if (!bridge) return [];
    if (!toolDefs.current.length) toolDefs.current = await bridge.tools().catch(() => []);
    return toolDefs.current;
  }, [bridge]);

  /**
   * The page's own read of a script (read-only, no model call), recorded as a script.read event. Uses the arguments the page
   * already relies on for script_read (studio_id, target_file); when Studio's own definition of script_read does not take
   * target_file, nothing is called and the read is recorded as unavailable.
   */
  const readScript = useCallback(async (path: string, purpose: ReadPurpose, action: string, studioId: string | null): Promise<ScriptSource | null> => {
    if (!bridge) return null;
    const def = toolDefs.current.find((d) => d.name === "script_read");
    const props = (def?.inputSchema as { properties?: Record<string, unknown> } | undefined)?.properties;
    if (props && !("target_file" in props)) {
      emit({ kind: "script.read", path, purpose, action, ok: false, error: "Studio's script_read does not take target_file, so Keplar cannot read the script around this edit." });
      return null;
    }
    const r = await bridge.call("script_read", { ...(studioId ? { studio_id: studioId } : {}), target_file: path }).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "The read failed." }));
    if (!r.ok || r.result.isError) {
      emit({ kind: "script.read", path, purpose, action, ok: false, error: clip(r.ok ? toolResult(r.result.content).text : r.error, 600) });
      return null;
    }
    const src = parseScriptRead(resultText(r));
    emit({ kind: "script.read", path, purpose, action, ok: true, ...src });
    return src;
  }, [bridge, emit]);

  /**
   * Runs one action: shows it, waits for approval when it needs one, calls the bridge, records the result. Reads run by
   * themselves; changes wait for Approve unless auto-approve is on; destructive actions and reverts always wait. A script edit
   * (multi_edit in the known shape) is read before (preview while waiting, then the true before-content right before it runs)
   * and re-read after, to confirm what was applied.
   */
  const execute = useCallback(async (a: RunnableAction, origin: ActionOrigin = "model", of: string | null = null): Promise<ActionResult> => {
    if (!bridge) return { outcome: "skipped" };
    const k = key();
    const needsYes = origin === "revert" || a.ask === true || a.risk === "destructive" || (a.risk === "change" && !flags.current.auto);
    add({ kind: "action", key: k, name: a.name, args: a.args, risk: a.risk, status: needsYes ? "waiting" : "running", ...(origin !== "model" ? { origin, ...(of ? { of } : {}) } : {}) });
    emit({ kind: "action.proposed", action: k, callId: a.id, name: a.name, args: a.args, risk: a.risk, title: describeAction(a.name, a.args), origin, of });
    const edit = !blender && a.name === "multi_edit" && multiEditSchema(toolDefs.current) !== "differs" ? parseMultiEdit(a.args) : null;
    const studioId = edit ? edit.studioId ?? placeRef.current?.id ?? null : null;
    let ok = true;
    if (needsYes) {
      // Registered before the preview read, so an Approve pressed meanwhile is not lost.
      const decision = flags.current.stop ? Promise.resolve(false) : new Promise<boolean>((resolve) => decisions.current.set(k, resolve));
      emit({ kind: "approval.requested", action: k });
      if (edit) await readScript(edit.path, "preview", k, studioId);
      ok = await decision;
      if (ok) { patch(k, { status: "running" }); emit({ kind: "approval.granted", action: k, by: "person" }); }
      else emit({ kind: "approval.declined", action: k, by: flags.current.stop ? "stop" : "person" });
    } else if (a.risk !== "read") {
      emit({ kind: "approval.granted", action: k, by: "auto-approve" });
    }
    if (!ok) {
      patch(k, { status: "skipped" });
      return { outcome: "skipped" };
    }
    const before = edit ? await readScript(edit.path, "before", k, studioId) : null;
    emit({ kind: "action.running", action: k, name: a.name });
    const t0 = Date.now();
    const r = !blender && a.name === ROBLOX_DOCS_TOOL_NAME ? await lookUpRobloxDocs(a.args) : await bridge.call(a.name, a.args);
    if (!r.ok || r.result.isError) {
      const msg = r.ok ? toolResult(r.result.content).text : r.error;
      patch(k, { status: "failed", summary: msg.slice(0, 300) });
      setStats((st) => ({ ...st, errors: st.errors + 1 }));
      emit({ kind: "action.failed", action: k, name: a.name, ms: Date.now() - t0, error: clip(msg) });
      return { outcome: "failed", text: msg };
    }
    const out = toolResult(r.result.content);
    const image = out.image ? await scaleDataUrl(out.image) : undefined;
    patch(k, { status: "done", summary: out.text.slice(0, 300), ...(image ? { image } : {}) });
    emit({ kind: "action.done", action: k, name: a.name, ms: Date.now() - t0, result: clip(out.text, MAX_EVENT_TEXT), image: Boolean(image) });
    if (a.risk !== "read") {
      flags.current.changed = true;
      setBuilt((xs) => [...xs, { key: k, title: describeAction(a.name, a.args) }]);
      setStats((st) => ({ ...st, changes: st.changes + 1 }));
    }
    if (a.name === "script_read" && typeof a.args.target_file === "string") {
      // A read of a line range is a part of the script, whatever its numbering says: shown, never trusted as the whole source.
      const src = parseScriptRead(out.text);
      const ranged = Object.keys(a.args).some((x) => /^(start|end)_?line|^line_?(start|end|range)|^offset$|^limit$|^lines?$/i.test(x));
      emit({ kind: "script.read", path: a.args.target_file, purpose: "model", action: k, ok: true, ...src, complete: src.complete && !ranged });
    }
    if (a.name === "screen_capture" && image) emit({ kind: "studio.looked", via: "screen_capture", screenshot: true, items: null, action: k });
    if (edit) {
      const proposed = before ? applyEdits(before.source, edit.edits) : null;
      const after = await readScript(edit.path, "after", k, studioId);
      emit({ kind: "edit.applied", action: k, path: edit.path, outcome: editOutcome(proposed?.ok ? proposed.content : null, after) });
    } else if (a.name === "multi_edit" && !blender) {
      // Not bracketed by reads (Studio's multi_edit takes other arguments): it ran, but what it applied was not checked.
      const p = parseMultiEdit(a.args);
      if (p) emit({ kind: "edit.applied", action: k, path: p.path, outcome: "unconfirmed" });
    }
    return { outcome: "done", text: out.text, ...(image ? { image } : {}) };
  }, [bridge, blender, add, patch, emit, readScript]);

  const loop = useCallback(async () => {
    if (!bridge) return;
    setRunning(true);
    try {
      const tools = await bridge.tools();
      toolDefs.current = tools;
      while (!flags.current.stop && !flags.current.pause) {
        if (flags.current.steps >= RUN_STEP_CAP) { add({ kind: "note", key: key(), text: `Paused after ${RUN_STEP_CAP} steps. Continue when you are ready.`, tone: "warn" }); flags.current.pause = true; emit({ kind: "run.paused", reason: "step-cap" }); break; }
        const sentMode = solarMode.current;
        turnNo.current++;
        emit({ kind: "request.sent", surface: mode, mode: sentMode, messages: history.current.length });
        const t0 = Date.now();
        const res = await fetch(blender ? "/api/blender/agent" : "/api/studio/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: compactScreenshots(history.current), tools, ...(sentMode ? { mode: sentMode } : {}) }) });
        const data = (await res.json().catch(() => ({}))) as Turn & { error?: string; code?: string };
        const latencyMs = Date.now() - t0;
        if (!res.ok) emit({ kind: "reply.failed", latencyMs, status: res.status, code: data.code ?? null, error: clip(data.error ?? "Keplar could not continue.", 600) });
        if (res.status === 402 && data.code === "studio_credits") {
          let ready = false;
          const noteKey = key();
          add({ kind: "note", key: noteKey, text: "Checking auto top-up…" });
          for (let poll = 0; poll < 12 && !flags.current.stop && !flags.current.pause; poll++) {
            const r = await fetch("/api/billing/studio-topup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "recharge" }) });
            const topup = await r.json() as { status?: string; message?: string; error?: string };
            setItems((xs) => xs.map((x) => x.key === noteKey && x.kind === "note" ? { ...x, text: topup.error ?? topup.message ?? "Confirming your top-up…" } : x));
            if (!r.ok) break;
            if (topup.status === "ready") { ready = true; break; }
            if (topup.status !== "pending") break;
            await new Promise((resolve) => setTimeout(resolve, 2500));
          }
          if (flags.current.stop || flags.current.pause) break;
          if (ready) continue;
          add({ kind: "note", key: key(), text: "Studio is paused. Review auto top-up, then choose Continue. Any pending payment will be checked before another charge.", tone: "warn" });
          flags.current.pause = true; emit({ kind: "run.paused", reason: "credits" }); break;
        }
        if (!res.ok) { add({ kind: "note", key: key(), text: data.error ?? "Keplar could not continue. Try again.", tone: "warn" }); flags.current.pause = true; emit({ kind: "run.paused", reason: "error" }); break; }
        const u = data.usage;
        emit({ kind: "reply.received", latencyMs, units: data.units, usage: u ? { model: u.model, provider: u.provider, promptTokens: u.promptTokens, cachedTokens: u.cachedTokens, completionTokens: u.completionTokens, reasoningTokens: u.reasoningTokens, latencyMs: u.latencyMs } : null, mode: data.mode ?? null, actions: data.actions.length, blocked: data.blocked.length, done: data.done, text: clip(data.text ?? "", 600) });
        flags.current.steps++;
        setStats((st) => ({ ...st, steps: st.steps + 1 }));
        flags.current.units += data.units;
        setUnits(flags.current.units);
        history.current.push(data.message);
        if (data.text) {
          add({ kind: "keplar", key: key(), text: data.text });
          const steps = parsePlan(data.text);
          if (steps) { setPlan(steps); setCurrent(0); setFinished(false); emit({ kind: "plan.parsed", steps }); }
          const n = stepMarker(data.text);
          if (n) { setCurrent(n); emit({ kind: "plan.step", step: n }); }
        }
        for (const b of data.blocked) { history.current.push({ role: "tool", tool_call_id: b.id, content: `The tool ${b.name} is not available in Keplar.` }); emit({ kind: "action.blocked", callId: b.id, name: b.name }); }
        const shotsThisTurn: string[] = [];
        for (const a of data.actions) {
          const r = await execute(a);
          if (r.outcome === "skipped") {
            history.current.push({ role: "tool", tool_call_id: a.id, content: "The person skipped this step. Do not retry it unchanged; ask or try another approach." });
            continue;
          }
          if (r.outcome === "failed") {
            history.current.push({ role: "tool", tool_call_id: a.id, content: `Error: ${r.text}`.slice(0, 12_000) });
            continue;
          }
          history.current.push({ role: "tool", tool_call_id: a.id, content: r.text.slice(0, 12_000) });
          if (r.image) { shotsThisTurn.push(r.image); showShot(r.image); }
        }
        if (shotsThisTurn.length) history.current.push({ role: "user", content: [{ type: "text", text: "Studio screenshot after these steps:" }, { type: "image_url", image_url: { url: shotsThisTurn[shotsThisTurn.length - 1]! } }] });
        if (data.done) {
          if (flags.current.changed) add({ kind: "note", key: key(), text: blender ? "Your turn: look it over in Blender, then tell Keplar what to change (or ask it to export)." : YOUR_TURN });
          setFinished(true);
          emit({ kind: "run.finished", changed: flags.current.changed });
          break;
        }
      }
    } catch (e) {
      add({ kind: "note", key: key(), text: e instanceof Error ? e.message : "Something went wrong.", tone: "warn" });
      emit({ kind: "error", message: clip(e instanceof Error ? e.message : "Something went wrong.", 600) });
    } finally {
      setRunning(false);
      setPaused(flags.current.pause && !flags.current.stop);
      // A fresh look at the result for the viewport panel (no model call).
      if (flags.current.changed && !blender) void refreshViewport();
    }
  }, [bridge, blender, mode, add, showShot, refreshViewport, emit, execute]);

  /** Start a request (text plus reference images as data URLs). Keplar looks at the place first. */
  const send = useCallback(async (text: string, images: string[]) => {
    if (!bridge || running || (!text.trim() && !images.length)) return;
    // Resolve the game first: opening it restores its saved chat, which must happen before this message joins it.
    await ensurePlace();
    touched.current = true;
    add({ kind: "user", key: key(), text, images });
    flags.current = { ...flags.current, pause: false, stop: false, steps: 0, units: flags.current.units, changed: false, reviewed: false };
    setPaused(false);
    setRunning(true);
    try { await look(); } catch { /* Keplar builds without the screenshot if Studio could not take one */ }
    const parts: Part[] = [{ type: "text", text: text.trim() || "Use these references." }];
    if (images.length) parts.push({ type: "text", text: `Reference ${images.length === 1 ? "image" : "images"} for this request (match the style, layout, motion and feel):` }, ...images.map((url) => ({ type: "image_url" as const, image_url: { url } })));
    history.current.push({ role: "user", content: parts });
    await loop();
  }, [bridge, running, add, look, loop, ensurePlace]);

  const pause = useCallback(() => {
    if (!flags.current.pause) emit({ kind: "run.paused", reason: "person" });
    flags.current.pause = true; setPaused(true);
  }, [emit]);
  const resume = useCallback(async () => { flags.current.pause = false; flags.current.stop = false; flags.current.steps = 0; setPaused(false); emit({ kind: "run.resumed" }); await loop(); }, [loop, emit]);
  const stop = useCallback(() => {
    if (!flags.current.stop) emit({ kind: "run.stopped" });
    flags.current.stop = true;
    for (const [k, r] of decisions.current) { r(false); decisions.current.delete(k); }
    setPaused(false);
  }, [emit]);
  const reset = useCallback(() => {
    stop();
    history.current = [];
    flags.current.units = 0;
    setUnits(0);
    setItems([]);
    setPlan([]);
    setCurrent(0);
    setFinished(false);
    setBuilt([]);
    setStats({ steps: 0, changes: 0, errors: 0 });
    clearEvents();
    clearSaved(placeKey(placeRef.current));
    void deleteRemote(placeKey(placeRef.current));
  }, [stop, clearEvents]);

  /* Save this game's chat as it changes: on this device soon, on the account a little later (debounced; history is read at save time). */
  useEffect(() => {
    const k = placeKey(place);
    if (skipSave.current) { skipSave.current = false; return; }
    if (!k || !items.length) return;
    const snapshot = () => toSaved({ name: place?.name ?? "", items, history: history.current, plan, current, finished, built, stats, units });
    const local = setTimeout(() => writeSaved(k, snapshot()), running ? 3000 : 400);
    const push = () => { lastPush.current = Date.now(); void pushRemote(k, snapshot()); };
    // Debounced, but a long build (a change every few seconds) still reaches the account at least every 30 seconds.
    if (running && Date.now() - lastPush.current > 30_000) push();
    const remote = setTimeout(push, running ? 15_000 : 4000);
    return () => { clearTimeout(local); clearTimeout(remote); };
  }, [place, items, plan, current, finished, built, stats, units, running]);

  /* Play-testing is the person's: start and stop a play test in Studio directly (no model call, no credits). */
  const [playing, setPlaying] = useState(false);
  const playTest = useCallback(async (start: boolean) => {
    const p = placeRef.current;
    if (!bridge || !p) return;
    const r = await bridge.call("start_stop_play", { studio_id: p.id, is_start: start });
    if (r.ok && !r.result.isError) setPlaying(start);
    else add({ kind: "note", key: key(), text: start ? "Studio could not start a play test. Press Play in Studio instead." : "Studio could not stop the play test. Press Stop in Studio instead.", tone: "warn" });
  }, [bridge, add]);
  const setAuto = useCallback((v: boolean) => { flags.current.auto = v; setAutoApprove(v); }, []);

  /* Live code engine: documents, changes and the active document, derived from the event log (code/documents.ts). */
  const code = useMemo(() => deriveDocuments(events, { surface: mode, busy: running }), [events, mode, running]);
  const codeRef = useRef(code);
  useEffect(() => { codeRef.current = code; }, [code]);

  /**
   * A page action (revert, retry) through the same flow as the model's: shown in the feed, approval when it needs one, the
   * bridge call, and a note in the conversation so the model knows on its next turn. Only between runs.
   */
  /** Set synchronously, so a second click before the re-render cannot start a second page action. */
  const pageBusy = useRef(false);
  const pageAction = useCallback(async (a: RunnableAction, origin: Exclude<ActionOrigin, "model">, of: string, note: (r: ActionResult) => string | null): Promise<ActionResult> => {
    if (!bridge || running || pageBusy.current) return { outcome: "skipped" };
    pageBusy.current = true;
    touched.current = true;
    flags.current.stop = false;
    setRunning(true);
    try {
      await toolList();
      const r = await execute(a, origin, of);
      const text = note(r);
      if (text) history.current.push({ role: "user", content: text });
      return r;
    } catch (e) {
      emit({ kind: "error", message: clip(e instanceof Error ? e.message : "Something went wrong.", 600) });
      return { outcome: "failed", text: e instanceof Error ? e.message : "Something went wrong." };
    } finally {
      pageBusy.current = false;
      setRunning(false);
    }
  }, [bridge, running, toolList, execute, emit]);

  /** Restores a script to its exact content before one of Keplar's edits (a new multi_edit, always asks first). */
  const revert = useCallback(async (changeId: string): Promise<ActionResult> => {
    const c = codeRef.current.documents.flatMap((d) => d.changes).find((x) => x.id === changeId);
    const r = c && c.revert.ok ? buildRevert(c) : null;
    if (!c || !r) return { outcome: "skipped" };
    return pageAction({ id: null, ...r }, "revert", c.id, (res) =>
      res.outcome === "done" ? `(The person reverted ${c.path} through Keplar's Revert: it is back to its exact content from before your edit "${describeAction(c.name, { file_path: c.path })}". Read it again before editing it.)`
      : res.outcome === "failed" ? `(The person tried to revert ${c.path} to its content before your edit; Studio answered: ${res.text.slice(0, 2000)})`
      : null);
  }, [pageAction]);

  /** Re-runs a failed action exactly as it was, through the same approval flow. */
  const retry = useCallback(async (actionKey: string): Promise<ActionResult> => {
    const p = eventsRef.current.find((e): e is Extract<StudioEvent, { kind: "action.proposed" }> => e.kind === "action.proposed" && e.action === actionKey);
    if (!p || !retryAvailabilityFor(eventsRef.current, actionKey, false).ok) return { outcome: "skipped" };
    // A failed revert (or a retry of one) is retried under the same rule as a revert: it always waits for the person.
    const ask = isRevertLineage(eventsRef.current, actionKey);
    return pageAction({ id: null, name: p.name, args: p.args, risk: p.risk, ask }, "retry", actionKey, (res) =>
      res.outcome === "done" ? `(The person re-ran your earlier ${p.name} call unchanged, and it worked this time. Result: ${res.text.slice(0, 4000)})`
      : res.outcome === "failed" ? `(The person re-ran your earlier ${p.name} call unchanged; it failed again: ${res.text.slice(0, 2000)})`
      : null);
  }, [pageAction]);

  const planSteps: PlanStep[] = plan.map((t, i) => ({ text: t, state: finished || i + 1 < current ? "done" : i + 1 === current ? "doing" : "next" }));
  const pending = items.filter((x) => x.kind === "action" && x.status === "waiting").length;

  return {
    items, running, paused, looking, units, autoApprove, place, viewport, shots, plan: planSteps, current, finished, built, stats, pending,
    send, decide, pause, resume, stop, reset, setAuto, setPlace, refreshViewport, playing, playTest,
    /** The run's execution events, oldest first (code/events.ts). */
    events,
    /** Code documents, the changes list and the document to show now (code/documents.ts). */
    code,
    /** Reverts a confirmed script change (see ScriptChange.revert for availability). Asks for approval like any change. */
    revert,
    /** Re-runs a failed action unchanged (see ScriptChange.retry / ChangeEntry.retry). */
    retry,
  };
}

export type StudioAgent = ReturnType<typeof useStudioAgent>;
