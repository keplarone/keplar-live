/**
 * The Active Routing Gate ("sentry code"). Pure, no model call, no network: it reads a want and wakes the 2–3 experts out of
 * 128 that fit it best. Everything else stays asleep, so a want costs a handful of model calls, not 128.
 *
 * Scoring per expert: a keyword phrase found in the text scores by its length (multi-word phrases are stronger evidence than a
 * single word), a match on a stem (plural / -ing / -ed forms) scores a little less, the intent the playbook detected adds a
 * domain prior, and the generalist is a fallback that only wins when nothing else matched. Then the gate keeps the top expert,
 * the second when it scores at least 35% of the top, and a third when it scores at least 55% (a close race needs a 3rd view).
 */
import { EXPERTS, GENERALIST, type Expert, type WantsDomain } from "./experts";

export type Activation = { expert: Expert; score: number; matched: string[] };
export type GateResult = { active: Activation[]; considered: number; asleep: number };

const stem = (w: string) => w.replace(/(?:ies)$/, "y").replace(/(?:ing|ed|es|s)$/, "");

function normalise(text: string): { padded: string; stems: Set<string> } {
  const clean = ` ${text.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9.#+$ ]+/g, " ").replace(/\s+/g, " ").trim()} `;
  return { padded: clean, stems: new Set(clean.trim().split(" ").filter((w) => w.length > 2).map(stem)) };
}

function scoreExpert(e: Expert, n: ReturnType<typeof normalise>): { score: number; matched: string[] } {
  let score = 0;
  const matched: string[] = [];
  for (const k of e.keywords) {
    const words = k.split(" ").length;
    if (n.padded.includes(` ${k} `)) {
      score += words > 1 ? 2 + words : 1.6;
      matched.push(k);
    } else if (words === 1 && k.length > 3 && n.stems.has(stem(k))) {
      score += 1.1;
      matched.push(k);
    }
  }
  return { score, matched };
}

export function routeExperts(text: string, opts: { domains?: WantsDomain[]; max?: 2 | 3; exclude?: string[] } = {}): GateResult {
  const n = normalise(text);
  const max = opts.max ?? 3;
  const prior = new Set(opts.domains ?? []);
  const scored: Activation[] = [];
  for (const e of EXPERTS) {
    if (e === GENERALIST || opts.exclude?.includes(e.id)) continue;
    const s = scoreExpert(e, n);
    const bonus = prior.has(e.domain) ? (s.score > 0 ? 1.5 : 0.6) : 0;
    if (s.score + bonus > 0) scored.push({ expert: e, score: s.score + bonus, matched: s.matched });
  }
  scored.sort((a, b) => b.score - a.score || a.expert.n - b.expert.n);
  const top = scored[0]?.score ?? 0;
  const active: Activation[] = [];
  for (const a of scored) {
    if (active.length >= max) break;
    const need = active.length === 0 ? 0 : active.length === 1 ? 0.35 : 0.55;
    if (a.score >= top * need && a.score >= 1) active.push(a);
  }
  // Nothing (or one weak match) woke up: the generalist joins so there are always at least two views.
  if (active.length < 2) active.push({ expert: GENERALIST, score: 0.5, matched: [] });
  return { active, considered: EXPERTS.length, asleep: EXPERTS.length - active.length };
}
