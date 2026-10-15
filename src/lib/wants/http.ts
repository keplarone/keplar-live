/** Shared request parsing and session auth for Keplar Wants routes. */
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { HttpError, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { isSameOrigin } from "@/lib/security/origin";
import type { WantBody } from "./types";

export const MAX_BODY = 50 * 1024 * 1024;
export const MAX_PROMPT = 4000;

export function tooLarge() {
  return json({ status: "rejected", reason: "payload_too_large", limitBytes: MAX_BODY }, { status: 413 });
}

/** Rejects a declared or actual body over the cap. Does not parse JSON. */
export async function readCapped(req: Request): Promise<string | "too_large"> {
  const cl = req.headers.get("content-length");
  if (cl && /^\d+$/.test(cl) && Number(cl) > MAX_BODY) return "too_large";
  const reader = req.body?.getReader();
  if (!reader) {
    const text = await req.text();
    return text.length > MAX_BODY ? "too_large" : text;
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel().catch(() => undefined);
      return "too_large";
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function wantsSession(req: Request): Promise<{ id: string }> {
  if (!isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
  const ws = await currentWorkspace(req, { allowAnonymous: false, team: true });
  await limitRequest(req, "wants", { perIp: 120, perAccount: 120, accountId: ws.id, windowSec: 60 });
  return { id: ws.id };
}

export function parseWant(raw: unknown): WantBody {
  if (!raw || typeof raw !== "object") throw new HttpError(400, "Expected a JSON object.", "invalid");
  const o = raw as Record<string, unknown>;
  if (typeof o.prompt !== "string") throw new HttpError(400, "prompt must be a string.", "invalid");
  if (o.prompt.length > MAX_PROMPT) throw new HttpError(400, "prompt is too long.", "invalid");
  const answers: Record<string, string> = Object.create(null);
  if (o.answers !== undefined) {
    if (!o.answers || typeof o.answers !== "object" || Array.isArray(o.answers)) throw new HttpError(400, "answers must be an object.", "invalid");
    if (Object.keys(o.answers).length > 20) throw new HttpError(400, "Too many answers.", "invalid");
    for (const [k, v] of Object.entries(o.answers as Record<string, unknown>)) {
      if (["__proto__", "constructor", "prototype"].includes(k)) throw new HttpError(400, "Invalid answer key.", "invalid");
      if (typeof v !== "string" || k.length > 200 || v.length > 500) throw new HttpError(400, "answers must be short strings.", "invalid");
      answers[k] = v;
    }
  }
  const confirmationId = o.confirmationId === undefined || o.confirmationId === null ? null : typeof o.confirmationId === "string" ? o.confirmationId.slice(0, 80) : null;
  if (o.confirmationId !== undefined && o.confirmationId !== null && typeof o.confirmationId !== "string") throw new HttpError(400, "confirmationId must be a string.", "invalid");
  const pin = o.pin === undefined || o.pin === null ? null : typeof o.pin === "string" ? o.pin.slice(0, 12) : null;
  if (o.pin !== undefined && o.pin !== null && typeof o.pin !== "string") throw new HttpError(400, "pin must be a string.", "invalid");
  return { prompt: o.prompt, answers, confirmationId, pin };
}

