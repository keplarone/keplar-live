import { sleep } from "@/lib/orchestration/sleep";
import { nameOf, notNeeded, reviewerFor, uniqueClaims, type VerifyInput } from "@/lib/orchestration/verifier";
import type { Claim, Verification, VerificationCheck, Verifier } from "@/lib/orchestration/types";
import { pickScript } from "./scenarios";

/* ─────────────────────────────── demo ─────────────────────────────── */

/** Demo verifier: realistic scripted findings, mapped onto the models that actually responded. */
export class MockVerifier implements Verifier {
  async verify(input: VerifyInput): Promise<Verification> {
    const { req, results, comparison, plan, signal } = input;
    const reviewer = reviewerFor(input);
    if (plan.mode === "single" || !reviewer) {
      await sleep(200, signal);
      return notNeeded();
    }

    const script = pickScript(req.prompt);
    const claims = uniqueClaims(results);
    const stanceOfClaim = (c: Claim) => c.id.slice(0, c.id.lastIndexOf("-"));
    const supportedOf = (c: Claim) => script.positions[stanceOfClaim(c)]?.claims.find((x) => x.text === c.text)?.supported ?? true;
    const removed = claims.filter((c) => !supportedOf(c));

    // Only findings about positions some responding model actually took.
    const byStance = new Map<string, string[]>();
    for (const r of results) if (r.ok) byStance.set(r.stance, [...(byStance.get(r.stance) ?? []), nameOf(r.modelId)]);
    const checks: VerificationCheck[] = script.checks
      .filter((c) => c.stances.some((st) => byStance.has(st)))
      .map((c) => ({ kind: c.kind, finding: c.finding, outcome: c.outcome, resolution: c.resolution, models: c.stances.flatMap((st) => byStance.get(st) ?? []) }));

    // Disputed = minority-position claims plus anything left unsupported: the only retrieval candidates.
    const lead = comparison.positions[0]?.stance;
    const disputed = claims.filter((c) => !supportedOf(c) || (lead && stanceOfClaim(c) !== lead));

    await sleep(900, signal);
    let judgement: Verification["judgement"];
    if (reviewer.role === "judge") {
      await sleep(700, signal);
      judgement = { modelId: reviewer.rm.model.id, favoured: lead ?? "", why: "Stronger evidence and reasoning after weakly supported claims were set aside." };
    }

    return {
      mode: "cross-model",
      reviewer: { modelId: reviewer.rm.model.id, name: reviewer.rm.model.name, role: reviewer.role },
      checks,
      disputed,
      checked: claims.length,
      supported: claims.length - removed.length,
      removed,
      notes: script.verificationNotes,
      judgement,
    };
  }
}

