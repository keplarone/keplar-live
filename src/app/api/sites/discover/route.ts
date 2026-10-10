/**
 * Discovery for the Create chat: given the idea (and any answers so far), returns the follow-up questions to ask,
 * a draft brief, the style directions on offer and the credit estimate for building from that brief.
 * Free: no model is called and nothing is charged. Rate limited; the idea goes through the same prompt safety check as a build.
 */
import { errorResponse, HttpError, json, body } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { buildBrief, briefToPrompt, detectKind, normalizeBrief, planQuestions, type Answers } from "@/lib/site-builder/brief";
import { styleForDirection } from "@/lib/create/direction-style";
import { normalizeProduct } from "@/lib/site-builder/product/types";
import { DIRECTIONS, suggestDirections } from "@/lib/site-builder/design";
import { estimateFor } from "@/lib/site-builder/job";
import { BUILDER_LIMITS, confirmUnits } from "@/lib/site-builder/limits";
import { checkPrompt } from "@/lib/site-builder/safety";
import { loadLibrary } from "@/lib/site-builder/fingerprints";
import { recentRecipeTokens } from "@/lib/site-builder/sameness";
import { makeRecipe, newSeed, recipeSummary } from "@/lib/site-builder/variation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const ws = await currentWorkspace(req);
    await rateLimit(`sb:discover:${ws.id}`, 40, 60, { shared: true });
    const input = await body<{ idea?: string; name?: string; answers?: Answers; brief?: unknown; product?: unknown; reroll?: boolean }>(req);
    const L = BUILDER_LIMITS[ws.plan];
    const idea = String(input.idea ?? "").trim().slice(0, L.promptChars);
    if (idea.length < 3) throw new HttpError(400, "Tell me a little about what you want to build.");
    const problem = await checkPrompt(idea);
    if (problem) throw new HttpError(422, problem, "refused");
    const product = normalizeProduct(input.product ?? (input.brief as { product?: unknown } | undefined)?.product);
    const kind = product ? "shop" : detectKind(idea);
    const answers = input.answers && typeof input.answers === "object" ? input.answers : {};
    let draft = input.brief && typeof input.brief === "object" ? normalizeBrief(input.brief) : buildBrief(idea, answers, { name: input.name, kind, product });
    // A chosen direction arrives with the brief. Answers still have to rewrite purpose, audience, tone, and pages.
    if (Object.keys(answers).length) {
      const rebuilt = buildBrief(idea, answers, { name: draft.name, kind: draft.kind, product: draft.product ?? null });
      draft = {
        ...rebuilt,
        direction: input.brief ? draft.direction : rebuilt.direction,
        accent: input.brief ? draft.accent : rebuilt.accent,
        mode: input.brief ? draft.mode : rebuilt.mode,
        motion: input.brief ? draft.motion : rebuilt.motion,
        ...(draft.recipe ? { recipe: draft.recipe } : {}),
        ...(draft.mood ? { mood: draft.mood } : {}),
      };
    }
    // The structure recipe: drawn once per project, steered away from what recent builds used; "reroll" draws a new one.
    if (!draft.recipe || input.reroll === true) {
      draft.recipe = makeRecipe({ seed: newSeed(), kind: draft.kind, direction: draft.direction, tone: draft.tone, avoid: recentRecipeTokens(await loadLibrary()) });
    }
    const promptChars = briefToPrompt(draft, L.pages).length + 40;
    const estimate = await estimateFor(ws, null, promptChars);
    const order = suggestDirections(draft.kind);
    return json({
      kind,
      questions: planQuestions(idea, kind, product),
      brief: draft,
      structure: recipeSummary(draft.recipe),
      directions: order.map((d) => ({ id: d.id, name: d.name, tagline: d.tagline, swatch: d.swatch, mode: d.mode, display: d.fonts.displayName, body: d.fonts.bodyName, effect: d.effect })),
      directionCount: DIRECTIONS.length,
      prompt: briefToPrompt(draft, L.pages),
      styleId: styleForDirection(draft.direction),
      estimate,
      needsConfirm: estimate.units > confirmUnits(),
      limits: { pages: L.pages },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
