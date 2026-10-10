/**
 * Product images kept on Keplar's storage (never hotlinked). An image is first *staged* (private, owned by the workspace,
 * not yet on a site), then *attached* when a site is built from the brief (made public by its unguessable id, like any
 * image used in a site), and deleted if it was never used. Staged images expire after 24 h.
 */
import { EntitlementError, type PlanId } from "@/lib/create/platform/plans";
import { HttpError } from "@/lib/create/platform/http";
import { now } from "@/lib/create/platform/ids";
import { RateLimitError, rateLimit } from "@/lib/create/platform/ratelimit";
import { collection } from "@/lib/create/platform/store";
import type { Workspace } from "@/lib/create/platform/workspace";
import { BLOB_ID, deleteImage, getImage, newBlobId, putImage, setPublic } from "@/lib/images/blob";
import { ImageRejected, prepareImage } from "./image";
import { PRODUCT_LIMITS, STAGED_TTL_MS } from "./limits";

export type AssetRow = {
  id: string; // = blob id
  workspaceId: string;
  siteId: string | null;
  kind: "upload" | "link";
  name: string;
  contentType: string;
  bytes: number;
  width: number;
  height: number;
  alt: string;
  sourceUrl?: string;
  original: boolean;
  notes: string[];
  createdAt: string;
};

const assets = () => collection<AssetRow>("sb_assets");
const UPGRADE: Record<PlanId, PlanId | undefined> = { free: "plus", lite: "plus", plus: "pro", pro: "business", business: undefined };

/** Daily counters (fixed 24 h window). Throws a 402 with an upgrade hint when the plan's allowance is used. */
export async function dailyAllowance(ws: Workspace, bucket: "link" | "vision" | "image", cost = 1): Promise<void> {
  const L = PRODUCT_LIMITS[ws.plan];
  const max = bucket === "link" ? L.linkPerDay : bucket === "vision" ? L.visionPerDay : L.imagesPerDay;
  const label = bucket === "link" ? "product page imports" : bucket === "vision" ? "photo readings" : "product images";
  for (let i = 0; i < cost; i++) {
    try {
      await rateLimit(`sb:product:${bucket}:${ws.id}`, max, 86_400, { shared: true });
    } catch (e) {
      if (e instanceof RateLimitError) throw new EntitlementError(`You've used today's ${max} ${label} on the ${ws.plan[0].toUpperCase()}${ws.plan.slice(1)} plan. It resets within 24 hours.${UPGRADE[ws.plan] ? " Upgrade for more." : ""}`, UPGRADE[ws.plan]);
      throw e;
    }
  }
}

/** A staged image already copied from this exact address (so importing the same page again doesn't spend quota twice). */
export async function findStagedBySource(ws: Workspace, sourceUrl: string): Promise<AssetRow | null> {
  return (await assets().list(ws.id, (a) => a.siteId === null && a.sourceUrl === sourceUrl))[0] ?? null;
}

export async function listAssets(ws: Workspace): Promise<AssetRow[]> {
  return assets().list(ws.id);
}

/** Deletes this workspace's staged images older than the TTL. Cheap and idempotent; called before each import. */
export async function sweepStaged(ws: Workspace): Promise<number> {
  const cutoff = Date.now() - STAGED_TTL_MS;
  const stale = await assets().list(ws.id, (a) => a.siteId === null && Date.parse(a.createdAt) < cutoff);
  for (const a of stale) {
    await deleteImage(ws.id, a.id).catch(() => undefined);
    await assets().remove(ws.id, a.id);
  }
  return stale.length;
}

export type StageInput = { bytes: Buffer; kind: "upload" | "link"; name: string; sourceUrl?: string; alt?: string };

/** Validates and stores one image privately. `extra` counts images staged in the same request (for the byte quota). */
export async function stageAsset(ws: Workspace, input: StageInput): Promise<AssetRow> {
  const L = PRODUCT_LIMITS[ws.plan];
  const mine = await assets().list(ws.id);
  if (mine.length >= L.storedImages) throw new EntitlementError(`Your ${ws.plan} plan keeps up to ${L.storedImages} product images. Remove some, or upgrade for more room.`, UPGRADE[ws.plan]);
  let prepared;
  try {
    prepared = await prepareImage(input.bytes, { minEdge: input.kind === "link" ? 120 : 32 });
  } catch (e) {
    if (e instanceof ImageRejected) throw new HttpError(422, e.message, "bad_image");
    throw e;
  }
  const used = mine.reduce((n, a) => n + a.bytes, 0);
  if (used + prepared.bytes.length > L.storedBytes) throw new EntitlementError(`That would go over your ${Math.round(L.storedBytes / 1_000_000)} MB of product image storage on the ${ws.plan} plan. Remove some images, or upgrade.`, UPGRADE[ws.plan]);
  const id = newBlobId();
  await putImage(id, ws.id, prepared.bytes, prepared.contentType);
  const row: AssetRow = {
    id,
    workspaceId: ws.id,
    siteId: null,
    kind: input.kind,
    name: input.name.replace(/[^\w .()-]/g, "").slice(0, 80) || "product",
    contentType: prepared.contentType,
    bytes: prepared.bytes.length,
    width: prepared.width,
    height: prepared.height,
    alt: (input.alt ?? "").slice(0, 160),
    sourceUrl: input.sourceUrl,
    original: prepared.original,
    notes: prepared.notes,
    createdAt: now(),
  };
  await assets().insert(row);
  return row;
}

export async function getAsset(ws: Workspace, id: string): Promise<AssetRow | null> {
  if (!BLOB_ID.test(id)) return null;
  return assets().get(ws.id, id);
}

export async function readAsset(ws: Workspace, id: string) {
  const row = await getAsset(ws, id);
  if (!row) return null;
  const img = await getImage(ws.id, id);
  return img ? { row, ...img } : null;
}

export async function updateAlt(ws: Workspace, id: string, alt: string) {
  return assets().update(ws.id, id, { alt: alt.slice(0, 160) });
}

/** Removes an image the user discarded. An image already on a site is only deleted if `force` is set (the site keeps working otherwise). */
export async function removeAsset(ws: Workspace, id: string): Promise<boolean> {
  const row = await getAsset(ws, id);
  if (!row) return false;
  if (row.siteId) return false; // published/built sites keep their media
  await deleteImage(ws.id, id).catch(() => undefined);
  return assets().remove(ws.id, id);
}

/**
 * Called when a site is built. Keeps only images this workspace owns, at most the plan's per-site cap, and makes them public
 * (that is what lets the generated site show them from /i/<id>). Returns the ids that were accepted.
 */
export async function attachToSite(ws: Workspace, siteId: string, ids: string[]): Promise<string[]> {
  const cap = PRODUCT_LIMITS[ws.plan].imagesPerSite;
  const ok: string[] = [];
  for (const id of ids) {
    if (ok.length >= cap) break;
    const row = await getAsset(ws, id);
    if (!row) continue;
    if (row.siteId && row.siteId !== siteId) continue; // belongs to another site
    if (!(await setPublic(ws.id, id, true))) continue;
    if (row.siteId !== siteId) await assets().update(ws.id, id, { siteId });
    ok.push(id);
  }
  return ok;
}

/** Called when a site is deleted: its product images go with it. */
export async function deleteSiteAssets(ws: Workspace, siteId: string, keep: Set<string> = new Set(), alsoIds: string[] = []): Promise<number> {
  const mine = new Set(alsoIds);
  const rows = await assets().list(ws.id, (a) => (a.siteId === siteId || mine.has(a.id)) && !keep.has(a.id));
  for (const a of rows) {
    await deleteImage(ws.id, a.id).catch(() => undefined);
    await assets().remove(ws.id, a.id);
  }
  return rows.length;
}
