/** Screen Library storage: the screenshots from the latest test runs of a site (JPEG, small). Owner-only, deleted with the site. */
import { collection } from "@/lib/create/platform/store";
import { id as newId, now } from "@/lib/create/platform/ids";
import type { Workspace } from "@/lib/create/platform/workspace";

export type ShotRow = { id: string; workspaceId: string; siteId: string; version: number; page: string; viewport: string; width: number; height: number; label: string; b64: string; createdAt: string };
export type ShotMeta = Omit<ShotRow, "b64" | "workspaceId">;
const shots = () => collection<ShotRow>("sb_shots");
const meta = ({ b64: _b, workspaceId: _w, ...m }: ShotRow): ShotMeta => m;

export async function saveShot(ws: Workspace, s: Omit<ShotRow, "id" | "workspaceId" | "createdAt" | "b64"> & { jpeg: Buffer }): Promise<ShotMeta> {
  const { jpeg, ...rest } = s;
  const row: ShotRow = { ...rest, id: newId("shot"), workspaceId: ws.id, createdAt: now(), b64: jpeg.toString("base64") };
  await shots().insert(row);
  return meta(row);
}

export async function listShots(ws: Workspace, siteId: string): Promise<ShotMeta[]> {
  const rows = await shots().list(ws.id, (r) => r.siteId === siteId);
  const latest = Math.max(0, ...rows.map((r) => r.version));
  return rows.filter((r) => r.version === latest).sort((a, b) => a.page.localeCompare(b.page) || a.width - b.width).map(meta);
}

export async function readShot(ws: Workspace, id: string): Promise<{ bytes: Buffer; row: ShotMeta } | null> {
  const r = await shots().get(ws.id, id);
  return r ? { bytes: Buffer.from(r.b64, "base64"), row: meta(r) } : null;
}

/** Keep only the newest version's shots (and the one before it) so storage stays small. */
export async function pruneShots(ws: Workspace, siteId: string, keepVersions = 2): Promise<void> {
  const rows = await shots().list(ws.id, (r) => r.siteId === siteId);
  const versions = [...new Set(rows.map((r) => r.version))].sort((a, b) => b - a).slice(keepVersions);
  await Promise.all(rows.filter((r) => versions.includes(r.version)).map((r) => shots().remove(ws.id, r.id)));
}

export async function deleteSiteShots(ws: Workspace, siteId: string): Promise<void> {
  const rows = await shots().list(ws.id, (r) => r.siteId === siteId);
  await Promise.all(rows.map((r) => shots().remove(ws.id, r.id)));
}
