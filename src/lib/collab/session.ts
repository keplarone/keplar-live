/**
 * Live session lifecycle on the server: open (seed / re-base onto a newer version), read the live files, save the session as
 * a new version, split off into a separate creation (a branch with its own history), and the branch records.
 */
import * as Y from "yjs";
import { HttpError } from "@/lib/create/platform/http";
import { id as newId, now } from "@/lib/create/platform/ids";
import { collection } from "@/lib/create/platform/store";
import type { PlanId } from "@/lib/create/platform/plans";
import type { Workspace } from "@/lib/create/platform/workspace";
import { normalizeAppFiles } from "@/lib/app-builder/files";
import { APP_BUILD_LIMITS } from "@/lib/app-builder/models";
import { addVersion, createSite, getVersion, normalizeFiles, sites } from "@/lib/site-builder/store";
import type { Site } from "@/lib/site-builder/types";
import { applyFiles, changeStats, docFiles, docFromUpdates, metaOf, seedUpdate } from "./doc";
import { maybeCompact, relay, roomState, type RelayStore } from "./relay";

export const roomFor = (siteId: string) => `site:${siteId}`;

export type BranchRecord = { id: string; workspaceId: string; parentId: string; parentName: string; childId: string; childWorkspaceId: string; baseVersion: number; by: string; byName: string; at: string; live: boolean };
export const branches = () => collection<BranchRecord>("collab_branches");

async function filesAt(site: Pick<Site, "id" | "workspaceId">, n: number) {
  if (!n) return {};
  return (await getVersion(site, n))?.files ?? {};
}

export type OpenResult = { room: string; base: number; head: number; behind: boolean; dirty: boolean; seq: number; changed: { path: string; added: number; removed: number; status: string }[] };

/**
 * Makes sure the room exists and holds the creation. A brand-new room is seeded from the head version. If a newer version
 * was saved outside the session (AI refine, critic fix, restore) and nobody has unsaved live edits, the session moves onto it
 * automatically (smallest edits, so open cursors stay put); with unsaved edits it reports `behind` and lets people choose.
 */
export async function openRoom(site: Site, opts: { pull?: boolean } = {}, store: RelayStore = relay()): Promise<OpenResult> {
  const room = roomFor(site.id);
  const head = site.headVersion;
  await store.claimRoom(room, head);
  // Seeding is deterministic, so a retry after a crash (or two servers at once) can only re-apply identical bytes.
  if ((await store.count(room)) === 0) await store.append(room, "seed", seedUpdate(await filesAt(site, head), head));
  let info = (await store.getRoom(room)) ?? { base: head };
  const state = await roomState(room, store);
  const doc = docFromUpdates([state.update]);
  try {
    const live = docFiles(doc);
    const baseFiles = await filesAt(site, info.base);
    const dirty = changeStats(baseFiles, live).length > 0;
    if (head > info.base && (!dirty || opts.pull)) {
      if (await store.casBase(room, info.base, head)) {
        const sv = Y.encodeStateVector(doc);
        applyFiles(doc, await filesAt(site, head), "rebase");
        metaOf(doc).set("base", head);
        await store.append(room, "rebase", Y.encodeStateAsUpdate(doc, sv));
      }
      info = (await store.getRoom(room)) ?? { base: head };
      const after = docFiles(doc);
      return { room, base: info.base, head, behind: false, dirty: changeStats(await filesAt(site, info.base), after).length > 0, seq: state.seq, changed: changeStats(live, after) };
    }
    await maybeCompact(room, store).catch(() => false);
    return { room, base: info.base, head, behind: head > info.base, dirty, seq: state.seq, changed: dirty ? changeStats(baseFiles, live) : [] };
  } finally {
    doc.destroy();
  }
}

/** The files as they are in the live session right now (null when no session was ever opened). Cached ~1 s per instance. */
const liveCache = new Map<string, { at: number; files: Record<string, string> }>();
export async function liveFiles(siteId: string, store: RelayStore = relay()): Promise<Record<string, string> | null> {
  const room = roomFor(siteId);
  const hit = liveCache.get(room);
  if (hit && Date.now() - hit.at < 1000) return hit.files;
  const state = await roomState(room, store);
  if (!state.rows) return null;
  const doc = docFromUpdates([state.update]);
  const files = docFiles(doc);
  doc.destroy();
  liveCache.set(room, { at: Date.now(), files });
  if (liveCache.size > 200) liveCache.delete(liveCache.keys().next().value!);
  return files;
}

export function normalizeFor(site: Pick<Site, "kind">, plan: PlanId, files: Record<string, string>) {
  if (site.kind === "app") {
    const L = APP_BUILD_LIMITS[plan];
    return normalizeAppFiles(files, { maxFiles: L.maxFiles + 14, maxBytes: L.maxBytes }).files;
  }
  return normalizeFiles(files, plan).files;
}

/** Saves the live session as a new version (attributed to everyone who edited), and moves the room's base onto it. */
export async function saveSession(site: Site, plan: PlanId, input: { files?: Record<string, string>; message?: string; by: string; contributors?: string[] }, store: RelayStore = relay()) {
  const room = roomFor(site.id);
  const live = input.files ?? (await liveFiles(site.id, store));
  if (!live) throw new HttpError(409, "There is no live session to save yet.", "conflict");
  const base = (await store.getRoom(room))?.base ?? site.headVersion;
  const changed = changeStats(await filesAt(site, site.headVersion), live);
  if (!changed.length) throw new HttpError(409, "Nothing changed since the last version.", "no_changes");
  let files: Record<string, string>;
  try {
    files = normalizeFor(site, plan, live);
  } catch (e) {
    throw new HttpError(400, (e as Error).message || "Those files can't be saved.");
  }
  const who = [...new Set([input.by, ...(input.contributors ?? [])])].filter(Boolean).slice(0, 6);
  const msg = (input.message ?? "").trim().replace(/\s+/g, " ").slice(0, 140);
  const summary = `${msg || `Live session: ${changed.length} file${changed.length === 1 ? "" : "s"} edited`} — ${who.join(", ")}`;
  const { site: saved, version } = await addVersion({ plan }, site, files, { kind: "edit", summary, prompt: "", model: null, units: 0 }, [{ id: newId("msg"), role: "system", text: `Saved from the live session (${changed.map((c) => c.path).slice(0, 5).join(", ")}).`, at: now() }]);
  await store.casBase(room, base, version.n);
  // Saving normalizes (doctype, meta, sanitizing). Write that back into the room so the session equals the saved version
  // and nobody is shown phantom "unsaved" changes. Only when nobody typed in between, so no keystroke is ever reverted.
  if (!input.files && changeStats(live, files).length) {
    const state = await roomState(room, store);
    const doc = docFromUpdates([state.update]);
    try {
      if (!changeStats(live, docFiles(doc)).length) {
        const sv = Y.encodeStateVector(doc);
        applyFiles(doc, files, "save");
        metaOf(doc).set("base", version.n);
        await store.append(room, "save", Y.encodeStateAsUpdate(doc, sv));
        liveCache.delete(room);
      }
    } finally {
      doc.destroy();
    }
  }
  return { site: saved, version: version.n, changed };
}

/**
 * Split off: your own branch of the creation, as it is in the session right now (including unsaved live edits). It is a new
 * creation in YOUR workspace with its own history and its own room; the source is untouched. A branch record links the two.
 */
export async function splitOff(source: Site, target: Workspace, input: { by: string; byName: string; files?: Record<string, string> }, store: RelayStore = relay()) {
  const live = input.files ?? (await liveFiles(source.id, store)) ?? (await filesAt(source, source.headVersion));
  const base = (await store.getRoom(roomFor(source.id)))?.base ?? source.headVersion;
  const copy = await createSite(target, { name: `${source.name} · ${input.byName.split(/[\s@]/)[0] || "branch"}`.slice(0, 60) });
  const patch: Partial<Site> = { brief: source.brief, design: source.design, fx: source.fx, seo: { ...source.seo, title: copy.name }, duplicatedFrom: source.id, ...(source.kind === "app" && source.app ? { kind: "app" as const, app: { ...source.app, live: null, seededVersion: undefined } } : {}) };
  const baseSite = (await sites().update(target.id, copy.id, patch)) ?? copy;
  const files = normalizeFor(source, target.plan, live);
  const { site } = await addVersion(target, baseSite, files, { kind: "edit", summary: `Split off from the live session of “${source.name}” (v${base} + live edits) by ${input.byName}.`, prompt: "", model: null, units: 0 }, [{ id: newId("msg"), role: "system", text: `Split off from “${source.name}” v${base}.`, at: now() }]);
  const rec: BranchRecord = { id: newId("brn"), workspaceId: source.workspaceId, parentId: source.id, parentName: source.name, childId: site.id, childWorkspaceId: target.id, baseVersion: base, by: input.by, byName: input.byName, at: now(), live: true };
  await branches().insert(rec);
  if (target.id !== source.workspaceId) await branches().insert({ ...rec, id: newId("brn"), workspaceId: target.id });
  return { site, branch: rec };
}

export async function branchesOf(site: Pick<Site, "id" | "workspaceId">) {
  return (await branches().list(site.workspaceId, (b) => b.parentId === site.id || b.childId === site.id)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);
}
