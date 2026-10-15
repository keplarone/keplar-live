import { keepAlive } from "./after";
import { EntitlementError } from "./plans";
import { RateLimitError } from "./ratelimit";
import { CooldownError } from "./cooldown";
import { logEvent } from "@/lib/ops/log";
import { recordError, routeFromStack } from "@/lib/ops/errors";

export function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, { ...init, headers: { "cache-control": "no-store", ...(init.headers ?? {}) } });
}

export function errorResponse(err: unknown) {
  if (err instanceof CooldownError) return json({ error: err.message, code: "cooldown", until: err.info.until, startedAt: err.info.startedAt, strikes: err.info.strikes }, { status: 429, headers: { "retry-after": String(Math.ceil(err.info.remainingMs / 1000)) } });
  if (err instanceof EntitlementError) return json({ error: err.message, code: "entitlement", upgradeTo: err.upgradeTo }, { status: 402 });
  if (err instanceof RateLimitError) return json({ error: err.message, code: "rate_limited" }, { status: 429 });
  if (err instanceof HttpError) return json({ error: err.message, code: err.code, ...(err.extra ?? {}) }, { status: err.status });
  logEvent("error", "unhandled_route_error", { name: err instanceof Error ? err.name : "unknown" });
  keepAlive(recordError({ source: "server", name: err instanceof Error ? err.name : "unknown", message: err instanceof Error ? err.message : String(err), route: err instanceof Error ? routeFromStack(err.stack) : undefined }), "error record");
  return json({ error: "Something went wrong.", code: "internal" }, { status: 500 });
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = "bad_request", public extra?: Record<string, unknown>) {
    super(message);
  }
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Expected a JSON body.");
  }
}
