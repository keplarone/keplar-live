import type { KeplarAnswer } from "./types";

export function consensusSummary(level: KeplarAnswer["consensus"]["level"], agree: number, disagree: number, missing: number): string {
  const miss = missing ? `. ${agree + disagree} of ${agree + disagree + missing} models responded` : "";
  if (level === "single") return missing ? `One model answered${miss}.` : "One model answered. There was nothing to compare.";
  if (level === "unscored") return "Responses received; agreement not scored yet.";
  if (level === "none") return `No position holds a majority${miss}.`;
  return `${agree} agree, ${disagree} ${disagree === 1 ? "disagrees" : "disagree"}${miss}`;
}
