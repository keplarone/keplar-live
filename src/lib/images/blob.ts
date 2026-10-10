/**
 * Image bytes. Neon (table `keplar_images`, bytea, one row per image) whenever DATABASE_URL is set, so no extra key or
 * object store is needed; otherwise files under the data dir (local development and tests).
 * Ids are 128-bit random hex: an image can only be read by its owner (authenticated route) unless the owner used it
 * in a site, which makes that one image public by its unguessable id (`/i/<id>`).
 */
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureSchema, neonConfigured, neonQuery } from "@/lib/create/platform/neon";
import { DATA_DIR } from "@/lib/create/platform/store";
import { MAX_IMAGE_BYTES } from "./config";

export const BLOB_ID = /^[a-f0-9]{32}$/;
export const newBlobId = () => randomBytes(16).toString("hex");

export type StoredImage = { bytes: Buffer; contentType: string };

let ready: Promise<void> | null = null;
function ensureImageTable(): Promise<void> {
  ready ??= (async () => {
    await ensureSchema();
    await neonQuery("CREATE TABLE IF NOT EXISTS keplar_images (id text PRIMARY KEY, workspace_id text NOT NULL, content_type text NOT NULL, bytes integer NOT NULL, is_public boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), data bytea NOT NULL)");
    await neonQuery("CREATE INDEX IF NOT EXISTS keplar_images_ws ON keplar_images (workspace_id)");
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

const dir = () => path.join(DATA_DIR, "keplar-images");
const filePath = (id: string) => path.join(dir(), `${id}.bin`);
const metaPath = (id: string) => path.join(dir(), `${id}.json`);

export async function putImage(id: string, workspaceId: string, bytes: Buffer, contentType: string): Promise<void> {
  if (!BLOB_ID.test(id)) throw new Error("Invalid image id.");
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw new Error("Image size out of range.");
  if (neonConfigured()) {
    await ensureImageTable();
    await neonQuery("INSERT INTO keplar_images (id, workspace_id, content_type, bytes, data) VALUES ($1, $2, $3, $4::int, decode($5, 'base64')) ON CONFLICT (id) DO NOTHING", [id, workspaceId, contentType, bytes.length, bytes.toString("base64")]);
    return;
  }
  await fs.mkdir(dir(), { recursive: true });
  await fs.writeFile(filePath(id), bytes);
  await fs.writeFile(metaPath(id), JSON.stringify({ workspaceId, contentType, public: false }));
}

type Meta = { workspaceId: string; contentType: string; public: boolean };
async function readMeta(id: string): Promise<Meta | null> {
  try {
    return JSON.parse(await fs.readFile(metaPath(id), "utf8")) as Meta;
  } catch {
    return null;
  }
}

/** Owner read. */
export async function getImage(workspaceId: string, id: string): Promise<StoredImage | null> {
  if (!BLOB_ID.test(id)) return null;
  if (neonConfigured()) {
    await ensureImageTable();
    const r = await neonQuery("SELECT content_type, encode(data, 'base64') AS b64 FROM keplar_images WHERE id = $1 AND workspace_id = $2", [id, workspaceId]);
    return r[0] ? { bytes: Buffer.from(String(r[0].b64), "base64"), contentType: String(r[0].content_type) } : null;
  }
  const meta = await readMeta(id);
  if (!meta || meta.workspaceId !== workspaceId) return null;
  return { bytes: await fs.readFile(filePath(id)), contentType: meta.contentType };
}

/** Public read: only images the owner put in a site. */
export async function getPublicImage(id: string): Promise<StoredImage | null> {
  if (!BLOB_ID.test(id)) return null;
  if (neonConfigured()) {
    await ensureImageTable();
    const r = await neonQuery("SELECT content_type, encode(data, 'base64') AS b64 FROM keplar_images WHERE id = $1 AND is_public = true", [id]);
    return r[0] ? { bytes: Buffer.from(String(r[0].b64), "base64"), contentType: String(r[0].content_type) } : null;
  }
  const meta = await readMeta(id);
  if (!meta?.public) return null;
  return { bytes: await fs.readFile(filePath(id)), contentType: meta.contentType };
}

export async function setPublic(workspaceId: string, id: string, isPublic: boolean): Promise<boolean> {
  if (!BLOB_ID.test(id)) return false;
  if (neonConfigured()) {
    await ensureImageTable();
    const r = await neonQuery("UPDATE keplar_images SET is_public = $3 WHERE id = $1 AND workspace_id = $2 RETURNING id", [id, workspaceId, isPublic]);
    return r.length > 0;
  }
  const meta = await readMeta(id);
  if (!meta || meta.workspaceId !== workspaceId) return false;
  await fs.writeFile(metaPath(id), JSON.stringify({ ...meta, public: isPublic }));
  return true;
}

export async function deleteImage(workspaceId: string, id: string): Promise<void> {
  if (!BLOB_ID.test(id)) return;
  if (neonConfigured()) {
    await ensureImageTable();
    await neonQuery("DELETE FROM keplar_images WHERE id = $1 AND workspace_id = $2", [id, workspaceId]);
    return;
  }
  const meta = await readMeta(id);
  if (!meta || meta.workspaceId !== workspaceId) return;
  await fs.rm(filePath(id), { force: true });
  await fs.rm(metaPath(id), { force: true });
}
