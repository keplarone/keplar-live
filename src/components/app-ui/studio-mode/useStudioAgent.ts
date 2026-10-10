"use client";
/**
 * The Studio co-creator's run loop on the page (server turn: src/lib/studio/agent.ts, Studio access: the desktop bridge).
 *
 * One run = the person's request, then turns until the model is done, the person pauses or stops, the run's credit budget is
 * spent, or the step cap is reached. Each turn the server returns the model's reply and labelled actions. Reads run by
 * themselves; changes wait for Approve (or run when auto-approve is on); destructive actions always wait. Results go back into
 * the conversation: text capped, and Studio screenshots as images (only the newest kept in full, to keep turns cheap).
 */
import { useCallback, useRef, useState } from "react";
import type { StudioBridge, StudioContent } from "@/lib/desktop/studio-bridge";

export type Risk = "read" | "change" | "destructive";
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type Msg =
  | { role: "user"; content: string | Part[] }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ActionStatus = "waiting" | "running" | "done" | "failed" | "skipped";
export type Item =
  | { kind: "user"; key: string; text: string; images: string[] }
  | { kind: "keplar"; key: string; text: string }
  | { kind: "action"; key: string; name: string; args: Record<string, unknown>; risk: Risk; status: ActionStatus; summary?: string; image?: string }
  | { kind: "note"; key: string; text: string; tone?: "warn" };

type Turn = { message: Extract<Msg, { role: "assistant" }>; text: string; actions: { id: string; name: string; args: Record<string, unknown>; risk: Risk }[]; blocked: { id: string; name: string }[]; done: boolean; units: number };

export const RUN_STEP_CAP = 40;
export const DEFAULT_BUDGET = 1500;

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
    case "segment_mesh": return "Split a mesh into parts";
    case "start_stop_play": return args.is_start ? "Start a play test" : "Stop the play test";
    case "character_navigation": return "Move the test character";
    case "user_mouse_input": return "Click in the play test";
    case "user_keyboard_input": return "Type in the play test";
    default: return name;
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

export function useStudioAgent(bridge: StudioBridge | null) {
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [units, setUnits] = useState(0);
  const [budget, setBudget] = useState(DEFAULT_BUDGET);
  const [autoApprove, setAutoApprove] = useState(false);
  const history = useRef<Msg[]>([]);
  const decisions = useRef(new Map<string, (ok: boolean) => void>());
  const flags = useRef({ pause: false, stop: false, units: 0, steps: 0, budget: DEFAULT_BUDGET, auto: false });

  const add = useCallback((it: Item) => setItems((xs) => [...xs, it]), []);
  const patch = useCallback((k: string, p: Partial<Extract<Item, { kind: "action" }>>) => setItems((xs) => xs.map((x) => (x.key === k && x.kind === "action" ? { ...x, ...p } : x))), []);

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
        if (flags.current.units >= flags.current.budget) { add({ kind: "note", key: key(), text: `Paused at this run's budget (${flags.current.budget.toLocaleString()} credits). Raise it to continue.`, tone: "warn" }); flags.current.pause = true; break; }
        flags.current.steps++;
        const res = await fetch("/api/studio/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: compactScreenshots(history.current), tools }) });
        const data = (await res.json().catch(() => ({}))) as Turn & { error?: string };
        if (!res.ok) { add({ kind: "note", key: key(), text: data.error ?? "Keplar could not continue. Try again.", tone: "warn" }); flags.current.pause = true; break; }
        flags.current.units += data.units;
        setUnits(flags.current.units);
        history.current.push(data.message);
        if (data.text) add({ kind: "keplar", key: key(), text: data.text });
        for (const b of data.blocked) history.current.push({ role: "tool", tool_call_id: b.id, content: `The tool ${b.name} is not available in Keplar.` });
        const shots: string[] = [];
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
            history.current.push({ role: "tool", tool_call_id: a.id, content: `Error: ${msg}`.slice(0, 12_000) });
            continue;
          }
          const out = toolResult(r.result.content);
          patch(k, { status: "done", summary: out.text.slice(0, 300), ...(out.image ? { image: out.image } : {}) });
          history.current.push({ role: "tool", tool_call_id: a.id, content: out.text.slice(0, 12_000) });
          if (out.image) shots.push(out.image);
        }
        if (shots.length) history.current.push({ role: "user", content: [{ type: "text", text: "Studio screenshot after these steps:" }, { type: "image_url", image_url: { url: shots[shots.length - 1]! } }] });
        if (data.done) break;
      }
    } catch (e) {
      add({ kind: "note", key: key(), text: e instanceof Error ? e.message : "Something went wrong.", tone: "warn" });
    } finally {
      setRunning(false);
      setPaused(flags.current.pause && !flags.current.stop);
    }
  }, [bridge, add, patch]);

  /** Start a request (text plus reference images as data URLs). */
  const send = useCallback(async (text: string, images: string[]) => {
    if (!bridge || running || (!text.trim() && !images.length)) return;
    add({ kind: "user", key: key(), text, images });
    const parts: Part[] = [{ type: "text", text: text.trim() || "Use these references." }];
    if (images.length) parts.push({ type: "text", text: `Reference ${images.length === 1 ? "image" : "images"} for this request (match the style, layout, motion and feel):` }, ...images.map((url) => ({ type: "image_url" as const, image_url: { url } })));
    history.current.push({ role: "user", content: parts });
    flags.current = { ...flags.current, pause: false, stop: false, steps: 0, units: flags.current.units };
    setPaused(false);
    await loop();
  }, [bridge, running, add, loop]);

  const pause = useCallback(() => { flags.current.pause = true; setPaused(true); }, []);
  const resume = useCallback(async () => { flags.current.pause = false; flags.current.stop = false; flags.current.steps = 0; setPaused(false); await loop(); }, [loop]);
  const stop = useCallback(() => {
    flags.current.stop = true;
    for (const [k, r] of decisions.current) { r(false); decisions.current.delete(k); }
    setPaused(false);
  }, []);
  const reset = useCallback(() => { stop(); history.current = []; flags.current.units = 0; setUnits(0); setItems([]); }, [stop]);
  const setRunBudget = useCallback((n: number) => { flags.current.budget = n; setBudget(n); }, []);
  const setAuto = useCallback((v: boolean) => { flags.current.auto = v; setAutoApprove(v); }, []);

  return { items, running, paused, units, budget, autoApprove, send, decide, pause, resume, stop, reset, setRunBudget, setAuto };
}
