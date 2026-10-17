/**
 * Uploads for generated apps (avatars, photos, notes). Bytes live in Postgres (bytea), keyed by (app_id, env, id), served
 * publicly by an unguessable id with a sandbox CSP and nosniff. Types are sniffed from the bytes (never trusted from the
 * client): PNG, JPEG, WebP, GIF, PDF, and UTF-8 text (txt, md, csv). Uploading needs a signed-in end user.
 */
import { randomBytes } from "node:crypto";
import { scanUpload } from "@/lib/security/upload-scan";
import { securityEvent } from "@/lib/security/events";
import { appSql, ensureAppSchema } from "./db";
import type { AppCtx } from "./context";
import type { AppUser } from "./auth";
import { DataError } from "./data";

export const FILE_ID = /^f_[A-Za-z0-9_-]{16,24}$/;

export function sniff(b: Buffer, nameHint = ""): string | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.subarray(0, 6).toString("latin1"))) return "image/gif";
  if (b.length >= 5 && b.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  // Text: valid UTF-8 without NUL bytes. Refuse HTML/SVG/XML that would execute if ever mis-served as a document.
  if (!b.includes(0)) {
    const s = b.toString("utf8");
    if (s.includes("\uFFFD")) return null;
    const head = s.trimStart().slice(0, 256).toLowerCase();
    if (head.startsWith("<!doctype html") || head.startsWith("<html") || head.startsWith("<svg") || head.startsWith("<?xml")) return null;
    return /\.csv$/i.test(nameHint) ? "text/csv" : /\.md$/i.test(nameHint) ? "text/markdown" : "text/plain";
  }
  return null;
}

export async function storedBytes(ctx: AppCtx) {
  const r = await appSql("SELECT coalesce(sum(size), 0)::bigint AS b FROM app_files WHERE app_id = $1 AND env = $2", [ctx.appId, ctx.env]);
  return Number(r[0]?.b ?? 0);
}

export async function putFile(ctx: AppCtx, user: AppUser | null, bytes: Buffer, nameRaw: string) {
  if (!ctx.meta.settings.uploads) throw new DataError("Uploads are turned off for this app.", 403, "uploads_off");
  if (!user) throw new DataError("Sign in to upload files.", 401, "sign_in");
  if (!bytes.length) throw new DataError("The file is empty.");
  if (bytes.length > ctx.limits.maxFile) throw new DataError(`Files can be up to ${Math.round(ctx.limits.maxFile / 1_000_000)} MB.`, 413, "too_large");
  const name = nameRaw.replace(/[^\w .()-]/g, "_").slice(0, 120) || "file";
  const mime = sniff(bytes, name);
  if (!mime) throw new DataError("That file type isn't supported. Use an image (PNG, JPEG, WebP, GIF), a PDF or a text file.", 415, "type");
  // Active PDFs, polyglots, executables behind an image type, decompression bombs, and the external scanner when one is configured.
  const scan = await scanUpload(bytes, mime);
  if (!scan.ok) {
    securityEvent({ kind: "upload.rejected", code: scan.code, where: "apps/_api/files", accountId: user.id });
    throw new DataError(scan.reason, scan.code === "scanner_unavailable" ? 503 : 415, scan.code);
  }
  await ensureAppSchema();
  if ((await storedBytes(ctx)) + bytes.length > ctx.limits.fileBytes) throw new DataError("This app has used all its file storage.", 403, "limit");
  const id = `f_${randomBytes(15).toString("base64url")}`;
  await appSql("INSERT INTO app_files (app_id, env, id, owner_id, name, mime, size, data) VALUES ($1, $2, $3, $4, $5, $6, $7::int, decode($8, 'base64'))", [ctx.appId, ctx.env, id, user.id, name, mime, bytes.length, bytes.toString("base64")]);
  return { id, name, size: bytes.length, type: mime };
}

export async function getFile(ctx: AppCtx, id: string): Promise<{ bytes: Buffer; mime: string; name: string } | null> {
  if (!FILE_ID.test(id)) return null;
  await ensureAppSchema();
  const r = (await appSql("SELECT name, mime, encode(data, 'base64') AS b64 FROM app_files WHERE app_id = $1 AND env = $2 AND id = $3", [ctx.appId, ctx.env, id]))[0];
  return r ? { bytes: Buffer.from(r.b64 ?? "", "base64"), mime: r.mime ?? "application/octet-stream", name: r.name ?? "file" } : null;
}

/** Text content of an uploaded text file (for AI actions that read the user's notes). PDFs are not parsed here. */
export async function fileText(ctx: AppCtx, id: string, max: number): Promise<string | null> {
  const f = await getFile(ctx, id);
  if (!f || !f.mime.startsWith("text/")) return null;
  return f.bytes.toString("utf8").slice(0, max);
}
