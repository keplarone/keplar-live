/**
 * Did the gateway answer with a different model than the one Keplar asked for? OpenRouter echoes the model that actually served
 * the call; it can differ after a gateway fallback (`allow_fallbacks`) or a cost-guard rewrite to a free model (cost/meter.ts).
 * Dated snapshots and routing suffixes of the same model are not a substitution ("openai/gpt-4o" served as
 * "openai/gpt-4o-2024-08-06", ":nitro"); a different model, or the ":free" variant of a paid one, is.
 */
const base = (slug: string) =>
  slug
    .trim()
    .toLowerCase()
    .replace(/:(nitro|floor|online|beta|extended|thinking)$/, "")
    .replace(/-(\d{4}-\d{2}-\d{2}|\d{8}|\d{4})$/, "")
    .replace(/-(latest|preview)$/, "");

export function servedModelDiffers(requested: string | undefined, served: string | undefined): boolean {
  if (!requested || !served) return false;
  const r = requested.trim().toLowerCase();
  const s = served.trim().toLowerCase();
  if (r === s) return false;
  if (r.endsWith(":free") !== s.endsWith(":free")) return true;
  const rb = base(r.replace(/:free$/, ""));
  const sb = base(s.replace(/:free$/, ""));
  if (rb === sb) return false;
  // Some hosts drop the vendor prefix ("gpt-4o" for "openai/gpt-4o").
  const tail = (x: string) => x.slice(x.lastIndexOf("/") + 1);
  return tail(rb) !== tail(sb);
}

/** The line shown on a consulted model's card when the gateway substituted another model. */
export const substitutionNote = (plannedName: string, served: string) =>
  `Answered by ${served.slice(0, 80)} in place of ${plannedName}: the gateway substituted it (the requested model was unavailable or limited).`;
