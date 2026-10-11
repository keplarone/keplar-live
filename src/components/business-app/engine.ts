"use client";
/**
 * Runs one request through Keplar's engine (/api/keplar, the same multi-model research and reasoning Keplar One uses) and
 * reports its streamed events (one JSON object per line). Business screens decide the modes and the report structure.
 */
import type { KeplarAnswer, KeplarEvent } from "@/lib/orchestration/types";

export type EngineDoc = { name: string; text: string; truncated?: boolean };
export type EngineRequest = { prompt: string; mode: "ask" | "research" | "reason"; projectId?: string | null; docs?: EngineDoc[]; history?: { role: "user" | "keplar"; text: string }[] };

export async function runEngine(req: EngineRequest, onEvent: (e: KeplarEvent) => void, signal: AbortSignal): Promise<KeplarAnswer | null> {
  const res = await fetch("/api/keplar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify({
      prompt: req.prompt,
      history: (req.history ?? []).slice(-12),
      modes: { web: false, deepResearch: req.mode === "research", create: false, agent: false, ...(req.mode === "reason" ? { reason: true } : {}) },
      routing: { strategy: "auto", depth: req.mode === "ask" ? "auto" : "thorough" },
      ...(req.projectId ? { projectId: req.projectId } : {}),
      ...(req.docs?.length ? { docs: req.docs } : {}),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });
  if (!res.ok || !res.body) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d as { error?: string }).error ?? "Keplar couldn't start. Try again in a moment.");
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let answer: KeplarAnswer | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const e = JSON.parse(line) as KeplarEvent;
        if (e.type === "answer") answer = e.answer;
        onEvent(e);
      } catch { /* a partial or malformed line is skipped */ }
    }
  }
  return answer;
}

/** Text files a person picks, read in the browser for the engine (documents for Reason, up to 12, ~80k characters each). */
export async function readDocs(files: FileList | File[], max = 12): Promise<{ docs: EngineDoc[]; skipped: string[] }> {
  const docs: EngineDoc[] = [];
  const skipped: string[] = [];
  for (const f of [...files].slice(0, max)) {
    if (f.size > 4 * 1024 * 1024) { skipped.push(`${f.name} (over 4 MB)`); continue; }
    try {
      const raw = await f.text();
      if (!raw.trim()) { skipped.push(`${f.name} (empty)`); continue; }
      docs.push({ name: f.name, text: raw.slice(0, 80_000), ...(raw.length > 80_000 ? { truncated: true } : {}) });
    } catch {
      skipped.push(`${f.name} (couldn't be read)`);
    }
  }
  return { docs, skipped };
}
