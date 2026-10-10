/**
 * An honest, plain-language account of which consulted models answered and which did not. Used by the answer page so a
 * missing model is never hidden behind "2 of 3 responded". Pure: it only reads the answer's `models` list.
 */
import type { ConsultedModel } from "./types";

export type ModelStatusSummary = {
  /** Panel models that answered (including stand-ins). */
  answered: string[];
  /** Panel models that did not answer, with a short reason. */
  missing: { name: string; why: string }[];
  /** "X answered in place of Y" lines. */
  standIns: string[];
  /** True when anything is worth telling the user. */
  notable: boolean;
};

function whyMissing(m: ConsultedModel): string {
  if (m.status === "refused") return "declined to answer";
  const note = (m.note ?? "").toLowerCase();
  if (/latency budget|didn.t answer within|timed out|timeout|too long/.test(note)) return "ran out of time";
  if (/busy|rate|limit|capacity|overloaded/.test(note)) return "was busy (free models have rate limits)";
  if (/unusable|unreliable|quality|degenerate/.test(note)) return "gave an unusable answer, which was discarded";
  if (/switched off|stopped|not configured|no provider/.test(note)) return "was unavailable";
  return "did not answer";
}

export function summarizeModels(models: readonly ConsultedModel[]): ModelStatusSummary {
  const panel = models.filter((m) => m.slot === "panel");
  const answered = panel.filter((m) => m.status === "responded").map((m) => m.name);
  const missing = panel.filter((m) => m.status === "failed" || m.status === "refused").map((m) => ({ name: m.name, why: whyMissing(m) }));
  const standIns = panel.filter((m) => m.status === "responded" && m.note?.startsWith("Stood in for ")).map((m) => `${m.name} answered ${m.note!.replace(/^Stood in for /, "in place of ").replace(/\.$/, "")}`);
  return { answered, missing, standIns, notable: missing.length > 0 || standIns.length > 0 };
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** One sentence for the answer page, e.g. "2 of 3 models answered (A and B). C ran out of time." */
export function modelStatusSentence(s: ModelStatusSummary): string {
  const total = s.answered.length + s.missing.length;
  if (!s.missing.length) return s.standIns.length ? `${s.standIns.join(". ")}.` : "";
  const head = `${s.answered.length} of ${total} models answered${s.answered.length ? ` (${list(s.answered)})` : ""}.`;
  const miss = s.missing.map((m) => `${m.name} ${m.why}`).join(". ");
  return `${head} ${miss}. ${s.standIns.length ? `${s.standIns.join(". ")}. ` : ""}It is not counted as a vote for or against the answer.`.replace(/\s+/g, " ").trim();
}
