/**
 * Browser side of Roblox Cloud (the Studio page): take a snapshot of the game's scripts through the desktop bridge, upload it,
 * start the job, and later apply the reviewed changes back in Studio. Kept free of React so it is tested against a fake bridge.
 * The Luau it runs is fixed and read-only, except applyLuau, which runs only for changes the person picked.
 */
import { resultText, type StudioBridge } from "@/lib/desktop/studio-bridge";
import { applyLuau, indexLuau, readLuau, sourcesLuau, type ApplyChange } from "./studio-luau";

export type IndexEntry = { i: number; path: string; className: string; runContext?: string | null; bytes: number };
export type Snapshot = { place: string; tree: string; scripts: { path: string; className: string; source: string; runContext?: string }[] };
export type Change = ApplyChange & { base: string; baseHash: string; applied: boolean };

const BATCH_BYTES = 1_500_000;
const UPLOAD_BYTES = 2_500_000;

async function luau(bridge: Pick<StudioBridge, "call">, studioId: string, code: string): Promise<string> {
  const r = await bridge.call("execute_luau", { studio_id: studioId, datamodel_type: "Edit", code });
  if (!r.ok) throw new Error(r.error || "Studio did not answer.");
  if (r.result.isError) throw new Error(resultText(r).slice(0, 300) || "Studio reported an error.");
  return resultText(r);
}

/** Studio's execute_luau answers with the returned value as text, sometimes wrapped; take the JSON part. */
export function parseJson<T>(text: string): T {
  const t = text.trim();
  const start = t.search(/[[{]/);
  if (start < 0) throw new Error("Studio returned no data.");
  return JSON.parse(t.slice(start)) as T;
}

/** Reads every script (read-only) in batches, so a big game never has to fit in one Studio call. */
export async function takeSnapshot(bridge: Pick<StudioBridge, "call">, studioId: string, onProgress?: (done: number, total: number) => void): Promise<Snapshot> {
  const index = parseJson<{ place: string; scripts?: IndexEntry[]; tree: string }>(await luau(bridge, studioId, indexLuau()));
  const list = index.scripts ?? [];
  const scripts: Snapshot["scripts"] = [];
  let from = 0;
  while (from < list.length) {
    let to = from, bytes = 0;
    while (to < list.length && (to === from || bytes + list[to]!.bytes <= BATCH_BYTES)) bytes += list[to++]!.bytes;
    const got = parseJson<{ i: number; path: string; source: string }[]>(await luau(bridge, studioId, sourcesLuau(list[from]!.i, list[to - 1]!.i)));
    const byIndex = new Map((Array.isArray(got) ? got : []).map((g) => [g.i, g]));
    for (const e of list.slice(from, to)) {
      const g = byIndex.get(e.i);
      if (!g || g.path !== e.path) throw new Error("The game changed while Keplar was reading it. Try again.");
      scripts.push({ path: e.path, className: e.className, source: g.source, ...(e.runContext ? { runContext: e.runContext } : {}) });
    }
    from = to;
    onProgress?.(scripts.length, list.length);
  }
  return { place: index.place, tree: index.tree, scripts };
}

type Api = (path: string, init?: RequestInit) => Promise<Response>;
const defaultApi: Api = (path, init) => fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });

async function ok<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `Keplar answered ${res.status}.`);
  return data;
}

/** Creates the job, uploads the snapshot in batches, and starts it. */
export async function startCloudJob(
  snap: Snapshot,
  o: { placeId: string; goal: string; mode: string; maxUnits: number; maxMinutes: number },
  onProgress?: (sent: number, total: number) => void,
  api: Api = defaultApi,
): Promise<{ id: string }> {
  const { job } = await ok<{ job: { id: string } }>(await api("/api/roblox-cloud/jobs", { method: "POST", body: JSON.stringify({ place: { id: o.placeId, name: snap.place }, goal: o.goal, mode: o.mode, maxUnits: o.maxUnits, maxMinutes: o.maxMinutes, tree: snap.tree }) }));
  let batch: Snapshot["scripts"] = [], bytes = 0, sent = 0;
  const flush = async () => {
    if (!batch.length) return;
    await ok(await api(`/api/roblox-cloud/jobs/${job.id}/scripts`, { method: "POST", body: JSON.stringify({ scripts: batch }) }));
    sent += batch.length;
    onProgress?.(sent, snap.scripts.length);
    batch = []; bytes = 0;
  };
  for (const s of snap.scripts) {
    const size = s.source.length * 1.2 + s.path.length + 64;
    if (batch.length && bytes + size > UPLOAD_BYTES) await flush();
    batch.push(s); bytes += size;
  }
  await flush();
  await ok(await api(`/api/roblox-cloud/jobs/${job.id}/start`, { method: "POST" }));
  return { id: job.id };
}

export type ApplyResult = { path: string; result: "applied" | "conflict" | "error"; detail?: string };

/**
 * Applies the picked changes in Studio, one undoable step each. Before writing, it re-reads the script: if it no longer matches
 * the snapshot (the person edited it since), that change is skipped as a conflict instead of overwriting their work.
 */
export async function applyChanges(bridge: Pick<StudioBridge, "call">, studioId: string, picked: Change[], onProgress?: (done: number, total: number) => void): Promise<ApplyResult[]> {
  const out: ApplyResult[] = [];
  for (const c of picked) {
    try {
      const now = parseJson<{ missing: boolean; source?: string }>(await luau(bridge, studioId, readLuau(c.path)));
      const missing = now.missing === true;
      if (c.status === "created" ? !missing : missing || now.source !== c.base) {
        out.push({ path: c.path, result: "conflict", detail: c.status === "created" ? "a script already exists there" : missing ? "the script is no longer there" : "it was edited in Studio after the snapshot" });
      } else {
        const r = (await luau(bridge, studioId, applyLuau(c))).trim();
        out.push(r === "ok" ? { path: c.path, result: "applied" } : { path: c.path, result: "error", detail: r.replace(/^error:\s*/, "").slice(0, 200) });
      }
    } catch (e) {
      out.push({ path: c.path, result: "error", detail: e instanceof Error ? e.message.slice(0, 200) : "failed" });
    }
    onProgress?.(out.length, picked.length);
  }
  return out;
}
