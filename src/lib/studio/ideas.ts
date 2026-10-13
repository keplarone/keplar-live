/**
 * Studio's game idea generator, server side (route: /api/studio/ideas; page: IdeasPanel.tsx; signals: idea-market.ts).
 *
 * One model turn through runStudioTurn, so it has the Roblox Studio model lock, the credit check before and the real-cost charge
 * after (Roblox credit rate). The model answers through one tool, propose_ideas, whose arguments are checked here: lengths
 * capped, signal ids kept only when they are Keplar's own, so every figure the page shows comes from idea-market.ts. The output
 * cap is small (one set of three ideas), which keeps a set cheap.
 */
import { USD_PER_UNIT } from "@/lib/create/platform/compute";
import { HttpError } from "@/lib/create/platform/http";
import type { Workspace } from "@/lib/create/platform/workspace";
import { costConfig, featureMultiplier } from "@/lib/cost/config";
import { ledgerFeature } from "@/lib/cost/hooks";
import { catalogById } from "@/lib/orchestration/catalog";
import { METER_MARGIN } from "@/lib/orchestration/limits";
import { callCostUsd } from "@/lib/orchestration/pricing";
import { buildTools, ROBLOX_CREDIT_RATE, runStudioTurn, STUDIO_MODEL, validateMessages, type TurnProfile } from "./agent";
import { IDEA_LIMITS, MARKET_SIGNALS, marketSignal, type GameIdea, type IdeaScope } from "./idea-market";
import { creditsForTokens } from "./solar-modes";

export const IDEAS_TOOL_NAME = "propose_ideas";

const text = (description: string, maxLength: number) => ({ type: "string", description, maxLength });

export const IDEAS_TOOL = {
  name: IDEAS_TOOL_NAME,
  description: `Return exactly ${IDEA_LIMITS.count} game ideas. This is the only way to answer.`,
  inputSchema: {
    type: "object",
    properties: {
      ideas: {
        type: "array",
        minItems: IDEA_LIMITS.count,
        maxItems: IDEA_LIMITS.count,
        items: {
          type: "object",
          properties: {
            title: text("A short, memorable game title.", 60),
            hook: text("One sentence a player would read on the game's page.", 180),
            signals: { type: "array", minItems: 1, maxItems: IDEA_LIMITS.signalsPerIdea, items: { type: "string", enum: MARKET_SIGNALS.map((s) => s.id) }, description: "The market signals this idea answers, by id." },
            coreLoop: text("What a player does every minute, and why they keep going.", 260),
            twist: text("The one mechanic that makes it different from the top games in its genre.", 220),
            session: text("How long a typical session is, and how it fits phones.", 100),
            monetization: text("Fair ways it earns: game passes, developer products, Premium payouts. No pay-to-win.", 200),
            firstBuild: text("What Solar should build first in Studio for a playable test.", 320),
          },
          required: ["title", "hook", "signals", "coreLoop", "twist", "session", "monetization", "firstBuild"],
          additionalProperties: false,
        },
      },
    },
    required: ["ideas"],
    additionalProperties: false,
  },
} as const;

const SIGNAL_LINES = MARKET_SIGNALS.map((s) => `- ${s.id} (${s.kind}): ${s.label}. ${s.stat}. ${s.note}`).join("\n");

export const IDEAS_SYSTEM = `You are Keplar's game designer for Roblox. You propose original games a small team can build in Roblox Studio with Solar, Keplar's Roblox agent.

Market signals (the only market facts you may use; refer to them by id):
${SIGNAL_LINES}

How to answer:
1. Call ${IDEAS_TOOL_NAME} with exactly ${IDEA_LIMITS.count} ideas. Make them meaningfully different from each other: different signals, genres, loops and audiences.
2. Each idea answers one or two of the signals above. A "risk" signal may be used only when the brief asks for that theme, and the hook must still give a reason to play.
3. The twist is the reason the idea is worth building: a mechanic or a combination the top games in that genre don't have. Don't copy an existing game or its characters, names or art.
4. Never state player counts, revenue or other facts in the ideas. The page shows the signals' own evidence next to each idea.
5. Fit Roblox: playable on phones first, short sessions that still feel complete, server-authoritative rules, and content suitable for all ages (no gore, no gambling, no paid random items).
6. Monetization is fair: cosmetics, convenience and access through game passes and developer products, plus Premium payouts. Nothing that lets paying players beat others.
7. Scope: "weekend" means the whole first playable fits one focused build session; "full" means a complete game whose first build is a solid vertical slice.
8. firstBuild is a concrete brief for Solar: the map or area, the core systems and the UI to build first.
9. Follow the person's brief when they give one. If it asks for something unsuitable for Roblox, steer to the nearest suitable idea.`;

/** Small budgets: one set of three ideas, a little thinking first. */
export const IDEAS_PROFILE: TurnProfile = {
  system: IDEAS_SYSTEM,
  riskOf: (name) => (name === IDEAS_TOOL_NAME ? "read" : "blocked"),
  meter: "studio.ideas",
  title: "Keplar Studio ideas",
  maxOutputTokens: 6_000,
  reasoningTokens: 1_500,
  lockedModel: true,
  creditRate: ROBLOX_CREDIT_RATE,
};

/** A generous ceiling on a request's input: the system prompt, the tool and the brief at about 2 characters per token. */
export const IDEAS_INPUT_CEILING_TOKENS = Math.ceil((IDEAS_SYSTEM.length + JSON.stringify(IDEAS_TOOL).length + 1_000) / 2);

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** The model's ideas, checked: every text field present and capped, signals limited to Keplar's own ids. */
export function parseIdeas(args: unknown): GameIdea[] {
  const raw = args && typeof args === "object" ? (args as { ideas?: unknown }).ideas : null;
  if (!Array.isArray(raw)) return [];
  const out: GameIdea[] = [];
  for (const r of raw.slice(0, IDEA_LIMITS.count) as Record<string, unknown>[]) {
    if (!r || typeof r !== "object") continue;
    const signals = [...new Set(Array.isArray(r.signals) ? r.signals.filter((s): s is string => typeof s === "string" && !!marketSignal(s)) : [])].slice(0, IDEA_LIMITS.signalsPerIdea);
    const idea: GameIdea = {
      title: clip(r.title, 60),
      hook: clip(r.hook, 180),
      signals,
      coreLoop: clip(r.coreLoop, 260),
      twist: clip(r.twist, 220),
      session: clip(r.session, 100),
      monetization: clip(r.monetization, 200),
      firstBuild: clip(r.firstBuild, 320),
    };
    if (idea.title && idea.hook && idea.coreLoop && idea.twist && idea.firstBuild && signals.length) out.push(idea);
  }
  return out;
}

export type IdeasResult = { ideas: GameIdea[]; units: number };

/** One set of ideas for a brief: one charged model turn. */
export async function generateIdeas(ws: Workspace, input: { brief: string; scope: IdeaScope }, deps: { fetch?: typeof fetch } = {}): Promise<IdeasResult> {
  const brief = input.brief.trim().slice(0, IDEA_LIMITS.briefChars);
  const content = `Scope: ${input.scope}\nBrief from the person: ${brief || "(none: surprise them, across different genres)"}`;
  const tools = buildTools([IDEAS_TOOL], (n) => (n === IDEAS_TOOL_NAME ? "read" : undefined));
  const turn = await runStudioTurn(ws, { messages: validateMessages([{ role: "user", content }]), tools }, deps, IDEAS_PROFILE);
  const call = turn.actions.find((a) => a.name === IDEAS_TOOL_NAME);
  const ideas = call ? parseIdeas(call.args) : [];
  if (!ideas.length) throw new HttpError(502, "Solar didn't return usable ideas this time. Try again, or add a few words to the brief.", "no_ideas");
  return { ideas, units: turn.units };
}

/** The most one set can cost, in credits: the full output cap plus the input ceiling, with the same arithmetic as the charge. */
export async function ideasCreditCeiling(at: string = new Date().toISOString()): Promise<number | null> {
  const spec = catalogById.get(STUDIO_MODEL);
  if (!spec) return null;
  const inputPer1M = callCostUsd(spec, 1_000_000, 0, at);
  const outputPer1M = callCostUsd(spec, 0, 1_000_000, at);
  if (inputPer1M == null || outputPer1M == null) return null;
  const chargeMultiplier = featureMultiplier(await costConfig(), ledgerFeature(IDEAS_PROFILE.meter));
  return creditsForTokens({ inputPer1M, outputPer1M, margin: METER_MARGIN, creditRate: IDEAS_PROFILE.creditRate ?? 1, usdPerCredit: USD_PER_UNIT, chargeMultiplier }, IDEAS_INPUT_CEILING_TOKENS, IDEAS_PROFILE.maxOutputTokens);
}
