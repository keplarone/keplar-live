/** Shared bits of the /api/v1 handlers: CORS (bearer keys only, no cookies), error shape, request id. */
import { ApiError } from "./keys";
import { v1Error } from "./format";

export const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-expose-headers": "retry-after, x-request-id",
  "access-control-max-age": "600",
  vary: "origin",
};

export const preflight = () => new Response(null, { status: 204, headers: CORS });

export function v1Json(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, { ...init, headers: { "cache-control": "no-store", ...CORS, ...(init.headers ?? {}) } });
}

export function v1Failure(e: unknown): Response {
  if (e instanceof ApiError) return v1Json(v1Error(e.code, e.message, e.retryAfterSec), { status: e.status, headers: e.retryAfterSec ? { "retry-after": String(e.retryAfterSec) } : {} });
  return v1Json(v1Error("internal", "Something went wrong."), { status: 500 });
}
