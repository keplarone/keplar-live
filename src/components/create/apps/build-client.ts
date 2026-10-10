"use client";
/**
 * The browser side of an app build, shared by the Create studio (AppBuilder) and the chat card (Create chip): start or continue
 * POST /api/apps/:id/build, read its NDJSON events, fold them into a Live view, and follow {type:"continue"} checkpoints.
 */
import { emptyLive, type Live } from "./BuildTimeline";

export type BuildError = Error & { status?: number; code?: string; estimate?: { units: number; max: number } };
export type BuildEvent = Record<string, unknown> & { type: string };

/** No NDJSON event for this long → the plan/LLM call hung or the stream died silently; fail with Retry instead of spinning forever. */
export const STREAM_IDLE_MS = 210_000;

/** Folds one build event into the live view. */
export function applyEvent(l: Live, ev: BuildEvent): Live {
  const t = ev.type;
  const n = { ...l };
  if (t === "stage") Object.assign(n, { stage: ev.stage, stageText: ev.text });
  else if (t === "plan") n.spec = ev.spec as Live["spec"];
  else if (t === "file") {
    n.files = [...l.files.filter((f) => f.path !== ev.path), { path: ev.path as string, bytes: Number(ev.bytes) || 0 }];
    const w = { ...l.writing };
    for (const k of Object.keys(w)) if (String(ev.path).includes(k)) delete w[k];
    n.writing = w;
  } else if (t === "progress") n.writing = { ...l.writing, [ev.group as string]: Number(ev.chars) || 0 };
  else if (t === "image") n.images = [...l.images, { slot: ev.slot as string, ok: Boolean(ev.ok) }];
  else if (t === "check") n.checks = [...(l.stage === "verify" && l.checks.length && (ev.check as { id?: string })?.id === "static" ? [] : l.checks), ev.check as Live["checks"][number]];
  else if (t === "verdicts") n.verdicts = ev.verdicts as Live["verdicts"];
  else if (t === "visual") n.visual = ev.visual as Live["visual"];
  else if (t === "problems") n.problems = { count: Number(ev.count), sample: ev.sample as string[] };
  else if (t === "log") n.log = [...l.log, String(ev.text)];
  return n;
}

async function* stream(path: string, body: unknown, signal?: AbortSignal, idleMs = STREAM_IDLE_MS): AsyncGenerator<BuildEvent> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal, cache: "no-store" });
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string; estimate?: { units: number; max: number } };
    throw Object.assign(new Error(data.error ?? `Request failed (${res.status})`), { status: res.status, code: data.code, estimate: data.estimate }) as BuildError;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const idle = new Promise<"idle">((resolve) => { timer = setTimeout(() => resolve("idle"), idleMs); });
    const next = await Promise.race([reader.read().then((r) => ({ kind: "chunk" as const, r })), idle.then((k) => ({ kind: k }))]).finally(() => clearTimeout(timer));
    if (next.kind === "idle") {
      try { await reader.cancel(); } catch { /* ignore */ }
      throw Object.assign(new Error("The build stopped responding (no progress for a few minutes). Nothing was published — try again."), { code: "stalled" }) as BuildError;
    }
    const { value, done } = next.r;
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) yield JSON.parse(line) as BuildEvent;
    }
  }
}

/**
 * Runs a build to the end (or to an error), following continue checkpoints. `body` starts a new build ({prompt, design, confirm,
 * edit}) or resumes one ({buildId}). Every event goes to onEvent; the returned promise resolves with the done event's fields.
 */
export async function runAppBuild(appId: string, body: Record<string, unknown>, onEvent: (ev: BuildEvent) => void, signal?: AbortSignal): Promise<{ version: number; previewUrl: string; buildId: string | null }> {
  let req = body;
  let buildId: string | null = typeof body.buildId === "string" ? body.buildId : null;
  for (let round = 0; round < 12; round++) {
    let next: string | null = null;
    for await (const ev of stream(`/api/apps/${appId}/build`, req, signal)) {
      onEvent(ev);
      if (ev.type === "build") buildId = String(ev.id);
      if (ev.type === "continue") next = String(ev.id);
      if (ev.type === "error") throw Object.assign(new Error(String(ev.error)), { code: String(ev.code ?? "error") }) as BuildError;
      if (ev.type === "done") return { version: Number(ev.version), previewUrl: String(ev.previewUrl ?? ""), buildId };
    }
    if (!next) break;
    req = { buildId: next };
  }
  throw Object.assign(new Error("The build stopped before it finished. Open it in Create to continue."), { code: "stopped" }) as BuildError;
}

export { emptyLive };
export type { Live };
