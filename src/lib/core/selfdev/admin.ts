/** Admin actions for Core's self-development (every one is logged in Core's change log and the admin audit log by the route). */
import { now } from "@/lib/create/platform/ids";
import { evalRows, gapRows, getCoreState, listVariants, logChange, proposalRows, saveCoreState, SYSTEM, turnRows, variantRows, changeRows } from "./repo";
import { loadActive, posterior } from "./variants";
import { VARIANT_TARGETS, type VariantTarget } from "./types";
import { turnReward } from "./outcomes";

export class CoreAdminError extends Error {}

export async function setKilled(killed: boolean, by: string, note = "") {
  await saveCoreState({ killed });
  await logChange({ action: killed ? "kill" : "unkill", by: "admin", note: `${by}: ${note || (killed ? "Core switched off; Ask runs exactly as before." : "Core switched back on.")}` });
  await loadActive(true);
}

export async function setFrozen(frozen: boolean, by: string, note = "") {
  await saveCoreState({ frozen });
  await logChange({ action: frozen ? "freeze" : "unfreeze", by: "admin", note: `${by}: ${note || (frozen ? "Only built-in prompts are used; nothing is promoted." : "Learned variants apply again.")}` });
  await loadActive(true);
}

export async function setCanaryPct(pct: number, by: string) {
  if (!Number.isFinite(pct) || pct < 1 || pct > 50) throw new CoreAdminError("Canary share must be 1-50%.");
  await saveCoreState({ canaryPct: Math.round(pct) });
  await logChange({ action: "canary", by: "admin", note: `${by}: canary share set to ${Math.round(pct)}%.` });
  await loadActive(true);
}

/** One-click rollback for a target: the canary is stopped, or the current champion is replaced by the one it replaced (or the built-in). */
export async function rollback(target: VariantTarget, by: string, note = "") {
  if (!VARIANT_TARGETS.includes(target)) throw new CoreAdminError("Unknown target.");
  const set = await loadActive(true);
  const { champion, canary } = set.byTarget[target];
  if (canary) {
    await variantRows().update(SYSTEM, canary.id, { status: "rolled_back", note: `admin: ${note}` });
    await logChange({ action: "rollback", target, variantId: canary.id, by: "admin", note: `${by}: canary stopped. ${note}` });
  } else if (champion.origin !== "seed") {
    await variantRows().update(SYSTEM, champion.id, { status: "rolled_back", note: `admin: ${note}` });
    if (champion.replaced && !champion.replaced.startsWith("seed-")) await variantRows().update(SYSTEM, champion.replaced, { status: "champion" });
    await logChange({ action: "rollback", target, variantId: champion.id, by: "admin", note: `${by}: restored ${champion.replaced ?? "the built-in prompt"}. ${note}` });
  } else throw new CoreAdminError("Nothing to roll back: the built-in prompt is in use.");
  await loadActive(true);
}

export async function promote(id: string, by: string) {
  const v = await variantRows().get(SYSTEM, id);
  if (!v || v.status !== "canary") throw new CoreAdminError("Only a canary can be promoted.");
  const set = await loadActive(true);
  const champ = set.byTarget[v.target].champion;
  if (champ.origin !== "seed") await variantRows().update(SYSTEM, champ.id, { status: "retired" });
  await variantRows().update(SYSTEM, id, { status: "champion", promotedAt: now(), replaced: champ.id, baseline: posterior(champ.stats) });
  await logChange({ action: "promote", target: v.target, variantId: id, by: "admin", note: `${by}: promoted by hand.` });
  await loadActive(true);
}

export async function rejectVariant(id: string, by: string) {
  const v = await variantRows().get(SYSTEM, id);
  if (!v || !["candidate", "canary"].includes(v.status)) throw new CoreAdminError("Only a candidate or canary can be rejected.");
  await variantRows().update(SYSTEM, id, { status: "rejected", note: `rejected by ${by}` });
  await logChange({ action: "reject", target: v.target, variantId: id, by: "admin", note: `${by}: rejected.` });
  await loadActive(true);
}

/** Code proposals: approving records the owner's decision; the code itself is still written and deployed by a person. */
export async function decideProposal(id: string, approve: boolean, by: string) {
  const p = await proposalRows().get(SYSTEM, id);
  if (!p || p.status !== "open") throw new CoreAdminError("Proposal not found or already decided.");
  await proposalRows().update(SYSTEM, id, { status: approve ? "approved" : "rejected", decidedBy: by, decidedAt: now() });
  await logChange({ action: approve ? "approve-proposal" : "reject-proposal", by: "admin", note: `${by}: ${approve ? "approved" : "rejected"} "${p.title}". ${approve ? "Implementation still goes through normal code review and deploy." : ""}` });
}

/** Dashboard data: daily quality, latency, cost and calibration series plus the variant, eval, gap, proposal and change lists. */
export async function dashboard(days = 30) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [state, variants, turns, evals, changes, proposals, gaps] = await Promise.all([
    getCoreState(),
    listVariants(),
    turnRows().listSystem((t) => t.at >= since),
    evalRows().listSystem((e) => e.at >= since),
    changeRows().listSystem(),
    proposalRows().listSystem(),
    gapRows().listSystem(),
  ]);
  const byDay = new Map<string, typeof turns>();
  for (const t of turns) { const d = t.at.slice(0, 10); byDay.set(d, [...(byDay.get(d) ?? []), t]); }
  const series = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, ts]) => {
    const rewards = ts.map(turnReward);
    const lat = ts.map((t) => t.latencyMs).sort((a, b) => a - b);
    const withFb = ts.filter((t) => Object.keys(t.fb ?? {}).length);
    // Calibration gap: mean |stated confidence - observed good outcome| over turns with feedback (lower is better).
    const calib = withFb.length ? withFb.reduce((a, t) => a + Math.abs(t.confidence - (turnReward(t) >= 0.5 ? 1 : 0)), 0) / withFb.length : null;
    return {
      day,
      turns: ts.length,
      quality: rewards.reduce((a, b) => a + b, 0) / (rewards.length || 1),
      p50: lat[Math.floor(lat.length * 0.5)] ?? 0,
      p95: lat[Math.floor(lat.length * 0.95)] ?? 0,
      units: ts.reduce((a, t) => a + t.units, 0),
      calls: ts.reduce((a, t) => a + t.calls, 0) / (ts.length || 1),
      deep: ts.filter((t) => t.depth !== "quick").length,
      escalated: ts.filter((t) => t.escalated).length,
      calibrationGap: calib,
      feedback: withFb.length,
    };
  });
  return {
    state,
    series,
    variants: variants.slice(0, 80),
    evals: evals.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40),
    changes: changes.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 80),
    proposals: proposals.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40),
    gaps: gaps.sort((a, b) => b.at.localeCompare(a.at))[0]?.clusters ?? [],
    durable: Boolean(process.env.DATABASE_URL?.trim()),
    cron: Boolean(process.env.CRON_SECRET?.trim()),
  };
}
