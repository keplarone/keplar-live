/**
 * One metered model call for Keplar Business features (executive summaries now; Reason and research later).
 * Checks the account can spend before the call, charges real provider cost x METER_MARGIN after, like Studio mode.
 */
import { assertCanSpend, chargeUnits, toUnits } from "@/lib/create/platform/compute";
import { HttpError } from "@/lib/create/platform/http";
import type { Workspace } from "@/lib/create/platform/workspace";
import { catalogById } from "@/lib/orchestration/catalog";
import { liveEnv, openRouterSlug } from "@/lib/orchestration/config";
import { METER_MARGIN } from "@/lib/orchestration/limits";
import { callCostUsd } from "@/lib/orchestration/pricing";

export const BUSINESS_MODELS = { fast: "claude-sonnet-5", deep: "claude-opus-5-5" } as const;

type Completion = { choices?: { message?: { content?: string | null } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number } };

export async function businessCompletion(
  ws: Workspace,
  input: { model: string; system: string; user: string; maxTokens: number; action: string; reserveUnits?: number },
  deps: { fetch?: typeof fetch } = {},
): Promise<{ text: string; units: number }> {
  const spec = catalogById.get(input.model);
  const slug = spec ? openRouterSlug(spec) : null;
  const key = liveEnv().openRouterKey;
  if (!spec || !slug || !key) throw new HttpError(503, "This is not available right now.", "unavailable");
  await assertCanSpend(ws, input.reserveUnits ?? 50, { kind: "text" });
  const res = await (deps.fetch ?? fetch)("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": "Keplar Business", "http-referer": "https://business.keplar.one" },
    body: JSON.stringify({ model: slug, messages: [{ role: "system", content: input.system }, { role: "user", content: input.user }], max_tokens: input.maxTokens, usage: { include: true } }),
    signal: AbortSignal.timeout(90_000),
  });
  const data = (await res.json().catch(() => ({}))) as Completion;
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!res.ok || !text) throw new HttpError(502, "The model did not answer. Try again in a moment.", "upstream");
  const usd = typeof data.usage?.cost === "number" && data.usage.cost > 0 ? data.usage.cost : callCostUsd(spec, data.usage?.prompt_tokens ?? 0, data.usage?.completion_tokens ?? 0, new Date().toISOString()) ?? 0;
  const metered = usd * METER_MARGIN;
  const units = usd > 0 ? await chargeUnits(ws, input.action, toUnits(metered), metered) : 0;
  return { text, units };
}
