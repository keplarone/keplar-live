/**
 * Object storage for site assets and generated media.
 * Local: .data/blobs. Production: Cloudflare R2 (S3-compatible, zero egress),
 * PLACEHOLDER until R2_* env vars are set and the S3 client is wired.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./store";
import { isLive } from "./config";

export interface BlobStore {
  put(key: string, body: Buffer | string, contentType: string): Promise<{ key: string; size: number }>;
  get(key: string): Promise<{ body: Buffer; contentType: string } | null>;
  list(prefix: string): Promise<string[]>;
  removePrefix(prefix: string): Promise<void>;
}

const ROOT = path.join(DATA_DIR, "blobs");

function safeKey(key: string): string {
  const norm = path.posix.normalize(key).replace(/^\/+/, "");
  if (norm.startsWith("..") || norm.includes("\0")) throw new Error("Invalid blob key");
  return norm;
}

class LocalBlobStore implements BlobStore {
  async put(key: string, body: Buffer | string, contentType: string) {
    const k = safeKey(key);
    const file = path.join(ROOT, k);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const buf = typeof body === "string" ? Buffer.from(body) : body;
    await fs.writeFile(file, buf);
    await fs.writeFile(`${file}.meta`, JSON.stringify({ contentType }));
    return { key: k, size: buf.length };
  }
  async get(key: string) {
    const file = path.join(ROOT, safeKey(key));
    try {
      const [body, meta] = await Promise.all([fs.readFile(file), fs.readFile(`${file}.meta`, "utf8").catch(() => "{}")]);
      return { body, contentType: (JSON.parse(meta).contentType as string) || "application/octet-stream" };
    } catch {
      return null;
    }
  }
  async list(prefix: string) {
    const base = path.join(ROOT, safeKey(prefix));
    const out: string[] = [];
    async function walk(dir: string) {
      let entries: import("node:fs").Dirent[] = [];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) await walk(p);
        else if (!e.name.endsWith(".meta")) out.push(path.relative(ROOT, p).split(path.sep).join("/"));
      }
    }
    await walk(base);
    return out;
  }
  async removePrefix(prefix: string) {
    await fs.rm(path.join(ROOT, safeKey(prefix)), { recursive: true, force: true });
  }
}

class R2Placeholder implements BlobStore {
  private fail(): never {
    throw new Error("PLACEHOLDER: R2 blob store not wired. Install @aws-sdk/client-s3 and implement R2BlobStore (endpoint https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com).");
  }
  put(): Promise<{ key: string; size: number }> { return this.fail(); }
  get(): Promise<{ body: Buffer; contentType: string } | null> { return this.fail(); }
  list(): Promise<string[]> { return this.fail(); }
  removePrefix(): Promise<void> { return this.fail(); }
}

let store: BlobStore | null = null;
export function blobs(): BlobStore {
  if (!store) store = isLive("blob") && process.env.KEPLAR_BLOB === "r2" ? new R2Placeholder() : new LocalBlobStore();
  return store;
}

export function contentTypeFor(file: string): string {
  const ext = path.extname(file).toLowerCase();
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".mp4": "video/mp4",
      ".txt": "text/plain; charset=utf-8",
      ".ico": "image/x-icon",
    } as Record<string, string>
  )[ext] ?? "application/octet-stream";
}
