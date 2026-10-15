/**
 * Legacy development/test fixture executor. Never used in production.
 * safety check → registry lookup (≤5) → question card → PIN card → execute only after
 * that account's PIN verifies. Track A when an official connection exists, otherwise
 * Track B on the local fixture (dry-run unless KEPLAR_BROWSER_DRY_RUN=0).
 */
import { checkWant } from "./safety";
import { activeRegistry, type AgentRow } from "./registry";
import { connected, executeGateway } from "./gateways";
import { dropPending, readPending, savePending } from "./confirmations";
import { verifyPin } from "./pin";
import { fallback, formFixtureUrl, runFormTask } from "./browser";
import type { WantBody, WantResult } from "./types";
import { timeoutResult } from "./orchestrate";

import { QUESTION, wantsTestHooks, wantsTimeoutMs, browserDryRun } from "./orchestrate";

const COMMERCE = new Set(["buy", "order", "shoes", "laptop", "gift", "pizza", "groceries", "delivery", "takeout", "coffee"]);
const LOGISTICS = new Set(["ship", "shipping", "package", "parcel", "courier", "return", "tracking"]);

function words(prompt: string): Set<string> {
  return new Set(prompt.toLowerCase().match(/[a-z]+/g) ?? []);
}

function providerOf(prompt: string): "logistics" | "commerce" | null {
  const w = words(prompt);
  for (const k of LOGISTICS) if (w.has(k)) return "logistics";
  for (const k of COMMERCE) if (w.has(k)) return "commerce";
  return null;
}

/**
 * Commerce and logistics words still start a plan on their own. Any other prompt
 * starts one only when the catalog actually returned a helper. An empty index
 * does not invent a match.
 */
function providerFor(prompt: string, agents: AgentRow[]): "logistics" | "commerce" | "general" | null {
  return providerOf(prompt) ?? (agents.length ? "general" : null);
}

export async function planWant(userId: string, body: WantBody, signal: AbortSignal = AbortSignal.timeout(wantsTimeoutMs())): Promise<WantResult> {
  if (body.confirmationId) return executeConfirmed(userId, body);
  const verdict = checkWant(body.prompt);
  if (verdict) return { ...verdict, message: verdict.reason, ui: { type: "notice" } };
  const agents = await activeRegistry().lookup(body.prompt);
  if (signal.aborted) return timeoutResult();
  const provider = providerFor(body.prompt, agents);
  if (!provider) {
    return { status: "answered", agents, message: "Noted. I found related helpers but nothing here needs an action yet." };
  }
  if (!(QUESTION in body.answers)) {
    return {
      status: "needs_input",
      agents,
      message: "A couple of details first.",
      ui: { type: "question", question: QUESTION, options: ["As soon as possible", "Later today", "Tomorrow"] },
    };
  }
  const track = (await connected(userId, provider)) ? "A" : "B";
  const pending = await savePending({ workspaceId: userId, prompt: body.prompt, answers: body.answers, provider, track, agents });
  const summary = `${body.prompt} — ${body.answers[QUESTION].toLowerCase()} via ${track === "A" ? `official ${provider} connection` : "sandboxed browser helper (dry run)"}`;
  return {
    status: "needs_confirmation",
    confirmationId: pending.id,
    track,
    agents,
    message: "Here's the plan. Confirm with your PIN to proceed.",
    ui: { type: "pin", summary },
  };
}

async function executeConfirmed(userId: string, body: WantBody): Promise<WantResult> {
  const pending = await readPending(userId, body.confirmationId ?? "");
  if (pending === "missing" || pending === "expired") {
    return { status: "error", reason: "unknown_or_expired_confirmation", message: "That confirmation expired." };
  }
  const pin = await verifyPin(userId, body.pin);
  if (pin === "unset") {
    return {
      status: "error",
      reason: "pin_not_set",
      message: "Set a PIN on your account before confirming. Nothing was done.",
      ui: { type: "pin", summary: "Choose a 4–6 digit PIN, then confirm." },
      confirmationId: body.confirmationId ?? undefined,
    };
  }
  if (pin !== "ok") {
    return {
      status: "error",
      reason: "bad_pin",
      message: "PIN didn't match. Nothing was done.",
      ui: { type: "pin", summary: "Try your PIN again" },
      confirmationId: body.confirmationId ?? undefined,
    };
  }
  await dropPending(userId, pending.id);
  try {
    if (pending.track === "A") {
      const res = await executeGateway(userId, pending.provider, `${pending.provider}.create`, { prompt: pending.prompt });
      return { ...res, message: "Simulated via the official-gateway placeholder; no real order placed." };
    }
    const item = pending.prompt.replace(/^I want\s+/i, "").trim().slice(0, 80);
    const res = await runFormTask({
      userId,
      url: formFixtureUrl(),
      fields: { "#item": item, "#qty": "1" },
      submitSelector: "#submit",
      dryRun: browserDryRun(),
      confirmed: true,
      open: wantsTestHooks.openPage ?? undefined,
    });
    const message =
      res.status === "dry_run"
        ? "Dry run complete: the form was filled on a local sandbox page, nothing submitted."
        : res.status === "submitted"
          ? "Submitted on the local sandbox page."
          : res.status === "fallback"
            ? res.ui.message
            : "reason" in res
              ? res.reason
              : "";
    return { ...res, message };
  } catch (e) {
    const card = fallback("executor_error", e instanceof Error ? e.message : String(e));
    return { ...card, message: card.ui.message };
  }
}

