/**
 * Reference inputs (image / video) for generation. Rules, all enforced on the server:
 *  - Types: images JPEG, PNG, WebP; video MP4 (what Higgsfield's upload accepts). Bytes are uploaded unchanged (full quality).
 *  - Size: images up to 10 MB, video up to 100 MB (Keplar limits; Higgsfield publishes none). Anything over ~3 MB is uploaded
 *    browser -> storage with a presigned URL because a function request is capped at 4.5 MB on Vercel.
 *  - Video length: 4 s minimum (Genjutsu requirement), 30 s maximum (Genjutsu trims to 30 s); the plan's own max seconds applies
 *    on top for models whose output follows the source.
 *  - A reference is only accepted with a Keplar-signed token over its URL, type and size, so a client cannot point the provider
 *    at an arbitrary URL.
 *  - Rights and consent: every reference needs the user's confirmation that they have the rights and that anyone shown has agreed.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpError } from "@/lib/create/platform/http";
import { signingSecretFor } from "./client";

export const REF_LIMITS = {
  image: { types: ["image/jpeg", "image/png", "image/webp"], maxBytes: 10_000_000 },
  video: { types: ["video/mp4"], maxBytes: 100_000_000, minSec: 4, maxSec: 30 },
  /** Largest file sent through a Keplar function (base64 inflates by a third; the cap is 4.5 MB). */
  inlineMaxBytes: 3_000_000,
  maxImages: 4,
} as const;

export const RIGHTS_NOTE = "Only upload images and videos you own or have permission to use. If a real person appears, they must have agreed. Keplar blocks requests that impersonate real people.";

export type Reference = { kind: "image" | "video"; url: string; contentType: string; bytes: number; durationSec?: number; name: string; token: string };

const sign = (workspaceId: string, r: Omit<Reference, "token">) =>
  createHmac("sha256", `keplar-hf-ref:${signingSecretFor()}`).update([workspaceId, r.kind, r.url, r.contentType, r.bytes, r.durationSec ?? ""].join("\n")).digest("hex");

export function mintReference(workspaceId: string, r: Omit<Reference, "token">): Reference {
  return { ...r, token: sign(workspaceId, r) };
}

export function sniffRef(b: Buffer): "image/jpeg" | "image/png" | "image/webp" | "video/mp4" | null {
  if (b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (b.length > 8 && b[0] === 0x89 && b.subarray(1, 4).toString("latin1") === "PNG") return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 12 && b.subarray(4, 8).toString("latin1") === "ftyp") return "video/mp4";
  return null;
}

/** Validates what the client declares before any upload. Returns a clean spec or throws a 400/413 with a plain message. */
export function validateDeclared(d: { kind?: unknown; contentType?: unknown; bytes?: unknown; durationSec?: unknown; name?: unknown }) {
  const kind = d.kind === "video" ? "video" : d.kind === "image" ? "image" : null;
  if (!kind) throw new HttpError(400, "Choose an image or a video reference.", "bad_reference");
  const L = REF_LIMITS[kind];
  const contentType = String(d.contentType ?? "").toLowerCase();
  if (!(L.types as readonly string[]).includes(contentType)) {
    throw new HttpError(415, kind === "image" ? "Reference images must be JPEG, PNG or WebP." : "Reference videos must be MP4.", "bad_reference");
  }
  const bytes = Number(d.bytes);
  if (!Number.isFinite(bytes) || bytes <= 0) throw new HttpError(400, "That file looks empty.", "bad_reference");
  if (bytes > L.maxBytes) throw new HttpError(413, `That ${kind} is ${(bytes / 1e6).toFixed(1)} MB. The limit is ${L.maxBytes / 1e6} MB.`, "bad_reference");
  let durationSec: number | undefined;
  if (kind === "video") {
    durationSec = Number(d.durationSec);
    const v = REF_LIMITS.video;
    if (!Number.isFinite(durationSec) || durationSec < v.minSec) throw new HttpError(400, `Reference videos must be at least ${v.minSec} seconds.`, "bad_reference");
    if (durationSec > v.maxSec) throw new HttpError(400, `Reference videos can be up to ${v.maxSec} seconds.`, "bad_reference");
    durationSec = Math.round(durationSec * 10) / 10;
  }
  const name = String(d.name ?? "reference").replace(/[^\w.\- ]+/g, "").slice(0, 80) || "reference";
  return { kind, contentType, bytes, durationSec, name } as const;
}

/** Checks a reference object sent back by the client: shape, token, and that it points at an https URL. */
export function verifyReference(workspaceId: string, r: unknown): Reference {
  const o = r as Partial<Reference> | null;
  if (!o || typeof o !== "object" || typeof o.url !== "string" || typeof o.token !== "string") throw new HttpError(400, "That reference isn't valid. Remove it and add it again.", "bad_reference");
  const spec = validateDeclared(o);
  const clean = { ...spec, url: o.url };
  let u: URL;
  try { u = new URL(o.url); } catch { throw new HttpError(400, "That reference isn't valid.", "bad_reference"); }
  if (u.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && u.protocol === "http:")) throw new HttpError(400, "That reference isn't valid.", "bad_reference");
  const expected = Buffer.from(sign(workspaceId, clean));
  const got = Buffer.from(o.token);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) throw new HttpError(400, "That reference expired or isn't valid. Remove it and add it again.", "bad_reference");
  return { ...clean, token: o.token };
}

export type RefSet = { images: Reference[]; videos: Reference[] };

/** Splits and validates a list of references; enforces counts and the rights confirmation. */
export function parseReferences(workspaceId: string, raw: unknown, rightsConfirmed: unknown): RefSet {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length === 0) return { images: [], videos: [] };
  if (list.length > REF_LIMITS.maxImages + 1) throw new HttpError(400, "Too many references.", "bad_reference");
  if (rightsConfirmed !== true) throw new HttpError(400, "Confirm that you have the rights to use your reference and that anyone shown has agreed.", "rights_required");
  const refs = list.map((r) => verifyReference(workspaceId, r));
  const images = refs.filter((r) => r.kind === "image");
  const videos = refs.filter((r) => r.kind === "video");
  if (images.length > REF_LIMITS.maxImages) throw new HttpError(400, `Up to ${REF_LIMITS.maxImages} reference images.`, "bad_reference");
  if (videos.length > 1) throw new HttpError(400, "One reference video at a time.", "bad_reference");
  return { images, videos };
}
