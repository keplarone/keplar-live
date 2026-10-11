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
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { resultText, type StudioBridge, type StudioContent } from "@/lib/desktop/studio-bridge";
import { clearSaved, placeKey, readSaved, toSaved, writeSaved } from "./saved-session";
import { scaleDataUrl } from "./references";

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
  | { kind: "action"; key: string; name: string; args: Record<string, unknown>; risk: Risk; status: ActionStatus; summary?: string; image?: string }
  | { kind: "look"; key: string; image?: string; text: string }
  | { kind: "note"; key: string; text: string; tone?: "warn" };

/** An open Studio: id is this Studio session's (it changes every launch); placeId is the game's own, when Studio says it. */
export type Place = { id: string; name: string; placeId?: string };
export type PlanStep = { text: string; state: "done" | "doing" | "next" };
export type Viewport = { image: string; at: number };

type Turn = { message: Extract<Msg, { role: "assistant" }>; text: string; actions: { id: string; name: string; args: Record<string, unknown>; risk: Risk }[]; blocked: { id: string; name: string }[]; done: boolean; units: number };

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

export function useStudioAgent(bridge: StudioBridge | null) {
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

  const add = useCallback((it: Item) => setItems((xs) => [...xs, it]), []);
  const patch = useCallback((k: string, p: Partial<Extract<Item, { kind: "action" }>>) => setItems((xs) => xs.map((x) => (x.key === k && x.kind === "action" ? { ...x, ...p } : x))), []);

  const showShot = useCallback((image: string) => {
    setViewport({ image, at: Date.now() });
    setShots((xs) => [image, ...xs.filter((x) => x !== image)].slice(0, 4));
  }, []);

  /** Opening a game brings back its saved chat (this device), so work continues where it stopped. */
  const restore = useCallback((p: Place | null) => {
    const saved = readSaved(placeKey(p));
    history.current = saved?.history ?? [];
    flags.current.units = saved?.units ?? 0;
    setUnits(saved?.units ?? 0);
    setPlan(saved?.plan ?? []);
    setCurrent(saved?.current ?? 0);
    setFinished(saved?.finished ?? false);
    setBuilt(saved?.built ?? []);
    setStats(saved?.stats ?? { steps: 0, changes: 0, errors: 0 });
    setItems(saved ? [...saved.items, { kind: "note", key: key(), text: `Picked up where you left off in ${p?.name ?? "this game"} (saved ${new Date(saved.savedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}). Keplar will take a fresh look before your next request.` }] : []);
  }, []);

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
    const r = await bridge.call("list_roblox_studios", {});
    const first = r.ok ? parsePlaces(resultText(r))[0] ?? null : null;
    setPlace(first);
    return first;
  }, [bridge, setPlace]);

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
    } finally {
      setLooking(false);
    }
  }, [ensurePlace, capture, showShot]);

  /** Keplar looks at the place before a request: screenshot plus the Workspace tree, added to the conversation. */
  const look = useCallback(async () => {
    if (!bridge) return;
    const p = await ensurePlace();
    if (!p) return;
    setLooking(true);
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
    } finally {
      setLooking(false);
    }
  }, [bridge, ensurePlace, capture, showShot, add]);

  const decide = useCallback((k: string, ok: boolean) => {
    decisions.current.get(k)?.(ok);
    decisions.current.delete(k);
  }, []);

  const loop = useCallback(async () => {
    if (!bridge) return;
    setRunning(true);
    try {
      const tools = await bridge.tools();
      while (!flags.current.stop && !flags.current.pause) {
        if (flags.current.steps >= RUN_STEP_CAP) { add({ kind: "note", key: key(), text: `Paused after ${RUN_STEP_CAP} steps. Continue when you are ready.`, tone: "warn" }); flags.current.pause = true; break; }
        const res = await fetch("/api/studio/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: compactScreenshots(history.current), tools }) });
        const data = (await res.json().catch(() => ({}))) as Turn & { error?: string; code?: string };
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
          flags.current.pause = true; break;
        }
        if (!res.ok) { add({ kind: "note", key: key(), text: data.error ?? "Keplar could not continue. Try again.", tone: "warn" }); flags.current.pause = true; break; }
        flags.current.steps++;
        setStats((st) => ({ ...st, steps: st.steps + 1 }));
        flags.current.units += data.units;
        setUnits(flags.current.units);
        history.current.push(data.message);
        if (data.text) {
          add({ kind: "keplar", key: key(), text: data.text });
          const steps = parsePlan(data.text);
          if (steps) { setPlan(steps); setCurrent(0); setFinished(false); }
          const n = stepMarker(data.text);
          if (n) setCurrent(n);
        }
        for (const b of data.blocked) history.current.push({ role: "tool", tool_call_id: b.id, content: `The tool ${b.name} is not available in Keplar.` });
        const shotsThisTurn: string[] = [];
        for (const a of data.actions) {
          const k = key();
          const needsYes = a.risk === "destructive" || (a.risk === "change" && !flags.current.auto);
          add({ kind: "action", key: k, name: a.name, args: a.args, risk: a.risk, status: needsYes ? "waiting" : "running" });
          let ok = true;
          if (needsYes) {
            ok = flags.current.stop ? false : await new Promise<boolean>((resolve) => decisions.current.set(k, resolve));
            if (ok) patch(k, { status: "running" });
          }
          if (!ok) {
            patch(k, { status: "skipped" });
            history.current.push({ role: "tool", tool_call_id: a.id, content: "The person skipped this step. Do not retry it unchanged; ask or try another approach." });
            continue;
          }
          const r = await bridge.call(a.name, a.args);
          if (!r.ok || r.result.isError) {
            const msg = r.ok ? toolResult(r.result.content).text : r.error;
            patch(k, { status: "failed", summary: msg.slice(0, 300) });
            setStats((st) => ({ ...st, errors: st.errors + 1 }));
            history.current.push({ role: "tool", tool_call_id: a.id, content: `Error: ${msg}`.slice(0, 12_000) });
            continue;
          }
          const out = toolResult(r.result.content);
          const image = out.image ? await scaleDataUrl(out.image) : undefined;
          patch(k, { status: "done", summary: out.text.slice(0, 300), ...(image ? { image } : {}) });
          if (a.risk !== "read") {
            flags.current.changed = true;
            setBuilt((xs) => [...xs, { key: k, title: describeAction(a.name, a.args) }]);
            setStats((st) => ({ ...st, changes: st.changes + 1 }));
          }
          history.current.push({ role: "tool", tool_call_id: a.id, content: out.text.slice(0, 12_000) });
          if (image) { shotsThisTurn.push(image); showShot(image); }
        }
        if (shotsThisTurn.length) history.current.push({ role: "user", content: [{ type: "text", text: "Studio screenshot after these steps:" }, { type: "image_url", image_url: { url: shotsThisTurn[shotsThisTurn.length - 1]! } }] });
        if (data.done) {
          if (flags.current.changed) add({ kind: "note", key: key(), text: YOUR_TURN });
          setFinished(true);
          break;
        }
      }
    } catch (e) {
      add({ kind: "note", key: key(), text: e instanceof Error ? e.message : "Something went wrong.", tone: "warn" });
    } finally {
      setRunning(false);
      setPaused(flags.current.pause && !flags.current.stop);
      // A fresh look at the result for the viewport panel (no model call).
      if (flags.current.changed) void refreshViewport();
    }
  }, [bridge, add, patch, showShot, refreshViewport]);

  /** Start a request (text plus reference images as data URLs). Keplar looks at the place first. */
  const send = useCallback(async (text: string, images: string[]) => {
    if (!bridge || running || (!text.trim() && !images.length)) return;
    // Resolve the game first: opening it restores its saved chat, which must happen before this message joins it.
    await ensurePlace();
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

  const pause = useCallback(() => { flags.current.pause = true; setPaused(true); }, []);
  const resume = useCallback(async () => { flags.current.pause = false; flags.current.stop = false; flags.current.steps = 0; setPaused(false); await loop(); }, [loop]);
  const stop = useCallback(() => {
    flags.current.stop = true;
    for (const [k, r] of decisions.current) { r(false); decisions.current.delete(k); }
    setPaused(false);
  }, []);
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
    clearSaved(placeKey(placeRef.current));
  }, [stop]);

  /* Save this game's chat as it changes (debounced; the run loop's history is read at save time). */
  useEffect(() => {
    const k = placeKey(place);
    if (!k || !items.length) return;
    const t = setTimeout(() => {
      writeSaved(k, toSaved({ name: place?.name ?? "", items, history: history.current, plan, current, finished, built, stats, units }));
    }, running ? 3000 : 400);
    return () => clearTimeout(t);
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

  const planSteps: PlanStep[] = plan.map((t, i) => ({ text: t, state: finished || i + 1 < current ? "done" : i + 1 === current ? "doing" : "next" }));
  const pending = items.filter((x) => x.kind === "action" && x.status === "waiting").length;

  return {
    items, running, paused, looking, units, autoApprove, place, viewport, shots, plan: planSteps, current, finished, built, stats, pending,
    send, decide, pause, resume, stop, reset, setAuto, setPlace, refreshViewport, playing, playTest,
  };
}

export type StudioAgent = ReturnType<typeof useStudioAgent>;
