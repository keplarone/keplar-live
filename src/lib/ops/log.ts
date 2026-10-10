/**
 * Structured logs: one JSON line per event with a correlation id, so a user-reported request id (response header
 * `x-request-id`) finds every line for that request in the Vercel logs. Never pass prompts, emails, tokens or request
 * bodies as fields; pass ids and codes only.
 */
export type LogLevel = "info" | "warn" | "error";

const SAFE_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** The id the edge proxy assigned (or a valid caller-supplied one); `unknown` outside a request. */
export const requestIdOf = (req?: Request | null): string => {
  const v = req?.headers.get("x-request-id") ?? "";
  return SAFE_ID.test(v) ? v : "unknown";
};

export const newRequestId = (): string => `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

export function logEvent(level: LogLevel, event: string, fields: Record<string, string | number | boolean | null | undefined> = {}, req?: Request | null): void {
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, reqId: req ? requestIdOf(req) : undefined, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
