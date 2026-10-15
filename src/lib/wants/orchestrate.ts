/** Request preparation is real; the legacy fixture executor is dev/test opt-in only. */
import { prepareEverydayWant } from "./everyday";
import { checkWant } from "./safety";
import type { OpenPage } from "./browser";
import type { WantBody, WantResult } from "./types";

// Kept for the explicitly opted-in legacy fixture tests.
export const QUESTION = "When do you need it?";
export const wantsTestHooks: {
  timeoutMs: number | null;
  plan: ((userId: string, body: WantBody, signal: AbortSignal) => Promise<WantResult>) | null;
  openPage: OpenPage | null;
} = { timeoutMs: null, plan: null, openPage: null };

export function wantsTimeoutMs(): number {
  if (wantsTestHooks.timeoutMs !== null) return wantsTestHooks.timeoutMs;
  const raw = Number(process.env.KEPLAR_WANTS_TIMEOUT_S ?? process.env.KEPLAR_TIMEOUT_S ?? 15);
  return Number.isFinite(raw) && raw > 0 ? raw * 1000 : 15_000;
}

export function browserDryRun(): boolean { return process.env.KEPLAR_BROWSER_DRY_RUN !== "0"; }

export function sandboxEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.KEPLAR_WANTS_SANDBOX === "1";
}

export async function planWant(userId: string, body: WantBody, signal: AbortSignal = AbortSignal.timeout(wantsTimeoutMs())): Promise<WantResult> {
  const verdict = checkWant(body.prompt);
  if (verdict) return { ...verdict, message: verdict.reason, ui: { type: "notice" } };
  if (sandboxEnabled()) return (await import("./sandbox")).planWant(userId, body, signal);
  return prepareEverydayWant(body);
}

export function timeoutResult(): WantResult {
  return { status: "timeout", reason: `exceeded ${wantsTimeoutMs() / 1000}s`, ui: { type: "fallback_modal", title: "That took too long", message: "Request preparation timed out. No provider action was started by this step." } };
}

export async function orchestrateWant(userId: string, body: WantBody): Promise<WantResult | "timeout"> {
  const ms = wantsTimeoutMs();
  const signal = AbortSignal.timeout(ms);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = (wantsTestHooks.plan ?? planWant)(userId, body, signal);
  const timeout = new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), ms); });
  try { return await Promise.race([work, timeout]); }
  finally { if (timer) clearTimeout(timer); }
}
