/**
 * Composer mode chips: which ones can be on together.
 * Study and Slides hand the message to their own studio (study set, deck), so each is a kind of run on its own: turning one on
 * turns off every other kind of run (Deep Research, Debate, Create, Create image, Agent) and the other studio, and turning any of
 * those on turns Study / Slides off. Debate and Deep Research stay exclusive with each other as before. Web is a retrieval switch,
 * not a kind of run, so it is left alone.
 */
import type { ComposerModes } from "@/lib/orchestration/types";

/** "reason" is a modifier like "web": it combines with any other mode. */
export type ModeKey = "web" | "deepResearch" | "debate" | "create" | "image" | "agent" | "study" | "slides" | "reason";
export type StudioMode = "study" | "slides";

const RUN_KINDS: ModeKey[] = ["deepResearch", "debate", "create", "image", "agent"];
const STUDIOS: StudioMode[] = ["study", "slides"];

export const isStudio = (k: ModeKey): k is StudioMode => k === "study" || k === "slides";

/** The modes after the person clicks the `key` chip. */
export function toggleMode(m: ComposerModes, key: ModeKey): ComposerModes {
  const on = !m[key];
  const next: ComposerModes = { ...m, [key]: on };
  if (!on) return next;
  if (isStudio(key)) {
    for (const k of [...RUN_KINDS, ...STUDIOS]) if (k !== key && next[k]) next[k] = false;
    return next;
  }
  if (RUN_KINDS.includes(key)) for (const k of STUDIOS) if (next[k]) next[k] = false;
  if (key === "debate") next.deepResearch = false;
  if (key === "deepResearch") next.debate = false;
  return next;
}

/** The studio this message goes to, if any. */
export const studioOf = (m: Partial<ComposerModes> | undefined): StudioMode | null => (m?.study ? "study" : m?.slides ? "slides" : null);
