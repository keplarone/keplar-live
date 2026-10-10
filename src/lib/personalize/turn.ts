/**
 * Personal context for one question: answer preferences, the chosen specialist, and how a Reason or Private turn is framed.
 * Built server-side only (nothing here is copied from the client body except the specialist id, which is looked up in the caller's
 * own workspace). Never read in a team workspace, for API keys or embeds. A Private chat still uses them: they are settings the
 * person wrote, not memory, and a Private chat never creates or reads memory.
 */
import { getPrefs, prefsBlock } from "./prefs";
import { getSpecialist, specialistBlock, validSpecialistId } from "./specialists";
import { familyBlock, getFamily } from "./family";

export const REASON_NOTE = [
  "<reason_mode>",
  "The person turned on Reason for this question. Work it through carefully: state the key assumptions, go step by step, check each",
  "intermediate result (recompute numbers, test edge cases, look for a counterexample), then give the conclusion. In the answer, show",
  "a short numbered list of the steps and checks that matter, then the conclusion. Say plainly where something stays uncertain.",
  "</reason_mode>",
].join("\n");

export type PersonalInput = {
  workspaceId: string;
  /** Team workspace, API key or embed: personal settings are never read. */
  personalAllowed: boolean;
  /** Free plan on hosts that may log: "About you" and specialist knowledge stay home. */
  withhold: boolean;
  specialistId?: string;
  reason?: boolean;
};

export type PersonalContext = { block: string; specialist: { id: string; name: string } | null; prefsUsed: boolean; family: boolean };

export async function personalContext(input: PersonalInput): Promise<PersonalContext> {
  const out: PersonalContext = { block: "", specialist: null, prefsUsed: false, family: false };
  const parts: string[] = [];
  // Family mode goes first and applies to every use of this workspace (web, API key, embed): it outranks preferences and specialists.
  const f = familyBlock(await getFamily(input.workspaceId).catch(() => null));
  if (f) { parts.push(f); out.family = true; }
  if (input.personalAllowed) {
    const [prefs, sp] = await Promise.all([
      getPrefs(input.workspaceId).catch(() => null),
      input.specialistId && validSpecialistId(input.specialistId) ? getSpecialist(input.workspaceId, input.specialistId).catch(() => null) : Promise.resolve(null),
    ]);
    const p = prefsBlock(prefs, { withholdPersonal: input.withhold });
    if (p) { parts.push(p); out.prefsUsed = true; }
    const s = specialistBlock(sp, { withholdKnowledge: input.withhold });
    if (s && sp) { parts.push(s); out.specialist = { id: sp.id, name: sp.name }; }
  }
  if (input.reason) parts.push(REASON_NOTE);
  out.block = parts.join("\n\n");
  return out;
}
