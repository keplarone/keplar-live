/**
 * Keplar Core's reasoning loop: plan → execute → critique → revise, repeated until the work passes its checks.
 *
 * There is no fixed number of steps or rounds. A step is revised until its check passes; a plan with a step that can't be
 * made to pass is re-planned around what failed; the final answer is critiqued and revised until it reaches the pass score.
 * The loop stops early only at a real operational limit (config.ts): the plan's request / cost budget, the wall-clock
 * limit for this request (then it can keep going in the background, jobs.ts), the shared Free pool, or the person
 * stopping it. Each step goes to the specialist model for its kind of work, and each check is done by a model from a
 * different family, or by actually running code.
 */
import type { Classification, KeplarRequest, Retriever, RoutingPlan } from "@/lib/orchestration/types";
import { MAX_ROUNDS_SAFETY } from "./config";
import { coreCall, parseJson, type CoreBudget, type Registry } from "./llm";
import type { CoreModels } from "./models";
import { CRITIC, FINAL_CRITIC, INSIGHT, PLANNER, REVISER, STEP } from "./prompts";
import { bm25, chunk } from "./retrieval";
import { codeBlocks, isJs, lastNumber, numbersIn, runCheck, sameNumber, syntaxError, webSearch } from "./tools";
import type { Picked } from "./selfdev/variants";
import type { CoreCheck, CoreEvent, CoreStep, CoreStepKind } from "./types";

export type EngineCtx = {
  req: KeplarRequest;
  /** The question with its context (conversation, memory, documents), as the panel would see it. */
  context: string;
  registry: Registry;
  models: CoreModels;
  budget: CoreBudget;
  classification: Classification;
  picked: Picked;
  retriever?: Retriever | null;
  routingPlan?: RoutingPlan | null;
  emit: (e: CoreEvent) => void;
  signal?: AbortSignal;
  stepTokens: number;
};

const KINDS: CoreStepKind[] = ["reason", "math", "code", "search", "retrieve", "write"];
const sid = (n: number) => `s${n}`;
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s);
const name = (m: { name: string }) => m.name.replace(/\s*\(free\)$/, "");

/** Splits an obviously multi-part question when the planner can't be reached (no model call needed). */
export function fallbackPlan(prompt: string, needs: { math: boolean; code: boolean }): CoreStep[] {
  const parts = prompt.split(/(?<=\?)\s+|\n\s*(?:\d+[.)]|[-*])\s+/).map((s) => s.trim()).filter((s) => s.length > 8).slice(0, 8);
  const kind: CoreStepKind = needs.code ? "code" : needs.math ? "math" : "reason";
  const list = parts.length > 1 ? parts : [prompt.trim()];
  return list.map((p, i) => ({ id: sid(i + 1), title: clip(list.length > 1 ? p : needs.math ? "Work out the answer and check it" : needs.code ? "Write and test the code" : "Reason it through", 90), kind, status: "pending" as const, attempts: 0, detail: p } as CoreStep & { detail: string }));
}

export type PlannedStep = CoreStep & { detail?: string; work?: string };

export async function makePlan(ctx: EngineCtx, needs: { math: boolean; code: boolean }, failed?: { steps: PlannedStep[]; why: string }): Promise<PlannedStep[]> {
  const prompt = failed
    ? `${ctx.context}\n\nAn earlier plan got stuck. Steps done so far and their results:\n${failed.steps.filter((s) => s.status === "done" || s.status === "revised").map((s) => `- ${s.title}: ${s.result}`).join("\n") || "(none)"}\nWhat failed: ${failed.why}\nPlan only the remaining work, a different way.`
    : ctx.context;
  const r = await coreCall({ registry: ctx.registry, budget: ctx.budget, model: ctx.models.planner, system: PLANNER(ctx.picked.text.planner), prompt, classification: ctx.classification, maxTokens: 900, effort: "high", signal: ctx.signal, timeoutMs: 30_000 });
  const parsed = r.ok ? parseJson<{ steps?: { title?: string; kind?: string; detail?: string }[] }>(r.text) : null;
  const raw = (parsed?.steps ?? []).filter((s) => s && typeof s.title === "string" && s.title.trim());
  if (!raw.length) return failed ? [] : fallbackPlan(ctx.req.prompt, needs);
  return raw.map((s, i) => ({ id: sid(i + 1 + (failed ? failed.steps.length : 0)), title: clip(String(s.title).trim(), 90), kind: KINDS.includes(s.kind as CoreStepKind) ? (s.kind as CoreStepKind) : "reason", status: "pending", attempts: 0, detail: clip(String(s.detail ?? ""), 600) }));
}

const resultLine = (text: string) => {
  const m = text.match(/RESULT:\s*([\s\S]+)$/i);
  return clip((m ? m[1] : text.split(/\n+/).filter(Boolean).pop() ?? "").replace(/\s+/g, " ").trim(), 400);
};

type StepOutcome = { pass: boolean; check: string; issue?: string; checks: CoreCheck[] };

/** Checks one step: by running its code when it has some, else by an independent critic. */
async function checkStep(ctx: EngineCtx, step: PlannedStep, done: PlannedStep[]): Promise<StepOutcome> {
  const work = step.work ?? "";
  const blocks = codeBlocks(work).filter((b) => isJs(b.lang) || (!b.lang && /console\.log/.test(b.code)));
  const sandboxMs = ctx.picked.params.sandboxMs ?? 2000;
  const checks: CoreCheck[] = [];
  if ((step.kind === "math" || step.kind === "code" || ctx.picked.params.eagerMath) && blocks.length) {
    const block = blocks[blocks.length - 1];
    const bad = syntaxError(block.code);
    if (bad) {
      checks.push({ kind: "syntax", label: `${step.title}: the code didn't parse`, outcome: "failed", detail: bad });
      return { pass: false, check: "Code didn't parse", issue: `The code has a syntax error: ${bad}`, checks };
    }
    const run = await runCheck(block.code, sandboxMs);
    if (!run.ok) {
      checks.push({ kind: "execution", label: `${step.title}: running the code failed`, outcome: "failed", detail: run.error });
      return { pass: false, check: "Code failed when run", issue: `Running the code failed: ${run.error}. Output so far: ${clip(run.logs, 300)}`, checks };
    }
    const out = `${run.logs}\n${run.result ?? ""}`.trim();
    if (step.kind === "code" && /\bFAIL\b/.test(out)) {
      checks.push({ kind: "execution", label: `${step.title}: a test failed`, outcome: "failed", detail: clip(out, 300) });
      return { pass: false, check: "A test failed", issue: `Tests printed: ${clip(out, 400)}`, checks };
    }
    if (step.kind === "math") {
      const printed = numbersIn(out);
      const stated = lastNumber(step.result ?? "");
      if (stated !== null && printed.length && !printed.some((n) => sameNumber(n, stated))) {
        checks.push({ kind: "execution", label: `${step.title}: the calculation disagreed`, outcome: "failed", detail: `Stated ${stated}, code printed ${clip(out, 120)}` });
        return { pass: false, check: "Calculation disagreed", issue: `The result says ${stated}, but running the calculation printed: ${clip(out, 200)}. Find which is wrong.`, checks };
      }
      if (printed.length) {
        checks.push({ kind: "execution", label: `${step.title}: checked by running the calculation`, outcome: "passed", detail: clip(out, 160) });
        step.result = `${step.result} [computed: ${clip(out.split("\n").pop() ?? out, 120)}]`;
        return { pass: true, check: "Ran the calculation", checks };
      }
    }
    if (step.kind === "code" && /\bPASS\b/.test(out)) {
      checks.push({ kind: "execution", label: `${step.title}: tests passed when run`, outcome: "passed", detail: clip(out, 160) });
      return { pass: true, check: "Tests passed when run", checks };
    }
  }
  // No runnable check: an independent critic (another model family) reviews the step.
  const critic = ctx.models.critic(ctx.models.forKind(step.kind));
  const prompt = `Question and context:\n${clip(ctx.context, 6000)}\n\nEarlier steps:\n${done.map((s) => `- ${s.title}: ${s.result}`).join("\n") || "(none)"}\n\nThis step: ${step.title}\n${step.detail ?? ""}\n\nThe work:\n${clip(work, 5000)}`;
  const r = await coreCall({ registry: ctx.registry, budget: ctx.budget, model: critic, system: CRITIC(ctx.picked.text.critic), prompt, classification: ctx.classification, maxTokens: 400, effort: "medium", signal: ctx.signal, timeoutMs: 25_000 });
  if (!r.ok) return { pass: true, check: "Not independently checked (no budget left for a check)", checks: [{ kind: "critique", label: `${step.title}: not independently checked`, outcome: "inconclusive" }] };
  const v = parseJson<{ ok?: boolean; issue?: string; fix?: string }>(r.text);
  if (!v || v.ok !== false) return { pass: true, check: `Checked by ${name(r.model)}`, checks: [{ kind: "cross-model", label: `${step.title}: checked by ${name(r.model)}`, outcome: "passed" }] };
  return { pass: false, check: `${name(r.model)} found a problem`, issue: `${v.issue ?? "A problem was found."}${v.fix ? ` Fix: ${v.fix}` : ""}`, checks: [{ kind: "cross-model", label: `${step.title}: ${name(r.model)} found a problem`, outcome: "failed", detail: clip(v.issue ?? "", 200) }] };
}

async function execStep(ctx: EngineCtx, step: PlannedStep, done: PlannedStep[], issue?: string): Promise<boolean> {
  const model = ctx.models.forKind(step.kind);
  let tool = "";
  if (step.kind === "search") {
    const hits = ctx.routingPlan ? await webSearch(ctx.retriever, `${step.detail || step.title}`.slice(0, 280) + (ctx.picked.params.searchHints?.length ? ` ${ctx.picked.params.searchHints.join(" ")}` : ""), ctx.routingPlan, ctx.signal) : null;
    if (hits) {
      ctx.budget.usd += hits.costUsd;
      tool = `Web search results (pages a live search returned; cite the page when you use it):\n${hits.notes}\n${hits.sources.map((s, i) => `[${i + 1}] ${s.title} - ${s.url}`).join("\n")}`;
    } else tool = "No live web search is available for this request. Use what you reliably know, and say plainly what may be out of date.";
  }
  if (step.kind === "retrieve") {
    const material = [...(ctx.req.docs ?? []).map((d) => ({ name: d.name, text: d.text })), ...(ctx.req.history ?? []).map((h, i) => ({ name: `turn ${i + 1}`, text: h.text }))];
    const hits = bm25(`${step.title} ${step.detail ?? ""} ${ctx.req.prompt}`, material.flatMap((m) => chunk(m.text, m.name)), 6);
    tool = hits.length ? `Passages found in the conversation and attachments:\n${hits.map((h) => `[${h.source}] ${h.text}`).join("\n---\n")}` : "Nothing relevant was found in the conversation or attachments.";
  }
  const prompt = `${clip(ctx.context, 12_000)}\n\nPlan:\n${[...done, step].map((s, i) => `${i + 1}. ${s.title}`).join("\n")}\n\nResults so far:\n${done.map((s) => `- ${s.title}: ${s.result}`).join("\n") || "(none)"}\n\nCurrent step: ${step.title}\n${step.detail ?? ""}${tool ? `\n\n${tool}` : ""}${issue ? `\n\nA check of your previous attempt found: ${issue}\nPrevious attempt:\n${clip(step.work ?? "", 3000)}\nRedo the step and fix this.` : ""}`;
  const r = await coreCall({ registry: ctx.registry, budget: ctx.budget, model, system: STEP(ctx.picked.text.step), prompt, classification: ctx.classification, maxTokens: ctx.stepTokens, effort: "high", signal: ctx.signal });
  if (!r.ok) return false;
  step.work = r.text;
  step.result = resultLine(r.text);
  step.model = name(r.model);
  return true;
}

export type SolveResult = { steps: PlannedStep[]; checks: CoreCheck[]; rounds: number; complete: boolean };

/** Plan and work through the steps, checking each, revising until it passes, re-planning around what can't be fixed. */
export async function solve(ctx: EngineCtx, needs: { math: boolean; code: boolean }, resume?: PlannedStep[]): Promise<SolveResult> {
  const checks: CoreCheck[] = [];
  let steps = resume?.length ? resume.map((s) => ({ ...s })) : await makePlan(ctx, needs);
  ctx.emit({ phase: "plan", steps: steps.map(({ id, title, kind }) => ({ id, title, kind })), round: 1 });
  const done: PlannedStep[] = steps.filter((s) => s.status === "done" || s.status === "revised");
  let rounds = 1;
  let queue: PlannedStep[] = steps.filter((s) => !done.includes(s));
  queue.forEach((s) => { s.status = "pending"; });
  while (queue.length && rounds <= MAX_ROUNDS_SAFETY) {
    const step = queue.shift()!;
    step.status = "active";
    ctx.emit({ phase: "step", step: publicStep(step) });
    let issue: string | undefined;
    let passed = false;
    // A step is revised until its check passes. It may use at most half of what is left, so one stubborn step can't starve the rest.
    const startCalls = ctx.budget.calls;
    const share = Math.max(2, Math.floor((ctx.budget.limit.calls - ctx.budget.calls) / 2));
    while (ctx.budget.calls - startCalls < share) {
      step.attempts++;
      if (!(await execStep(ctx, step, done, issue))) break;
      const c = await checkStep(ctx, step, done);
      checks.push(...c.checks);
      step.check = c.check;
      if (c.pass) { passed = true; break; }
      issue = c.issue;
      step.status = "revised";
      ctx.emit({ phase: "step", step: publicStep(step) });
      if (!ctx.budget.canSpend()) break;
    }
    if (passed) {
      step.status = step.attempts > 1 ? "revised" : "done";
      done.push(step);
      ctx.emit({ phase: "step", step: publicStep(step) });
      continue;
    }
    step.status = step.result ? "failed" : "skipped";
    ctx.emit({ phase: "step", step: publicStep(step) });
    if (!ctx.budget.canSpend()) { queue.forEach((s) => { s.status = "skipped"; }); break; }
    // Re-plan the remaining work around the step that couldn't be made to pass.
    rounds++;
    const replanned = await makePlan(ctx, needs, { steps: [...done, step], why: issue ?? "the step could not be completed" });
    if (!replanned.length) { done.push(step); continue; }
    steps = [...done, step, ...replanned];
    queue = replanned;
    ctx.emit({ phase: "plan", steps: steps.map(({ id, title, kind }) => ({ id, title, kind })), round: rounds });
  }
  const all = steps.map((s) => (s.status === "pending" || s.status === "active" ? { ...s, status: "skipped" as const } : s));
  return { steps: all, checks, rounds, complete: all.every((s) => s.status === "done" || s.status === "revised") };
}

export const publicStep = (s: PlannedStep): CoreStep => ({ id: s.id, title: s.title, kind: s.kind, status: s.status, attempts: s.attempts, ...(s.result ? { result: clip(s.result.replace(/\s*\[computed:[^\]]*\]/, ""), 240) } : {}), ...(s.check ? { check: s.check } : {}), ...(s.model ? { model: s.model } : {}) });

export type Verdict = { score: number | null; issues: string[] };

/** Deterministic checks of a final answer: JS code blocks parse; the verified numbers from the plan appear in it. */
export function localChecks(markdown: string, steps: PlannedStep[]): { checks: CoreCheck[]; issues: string[] } {
  const checks: CoreCheck[] = [];
  const issues: string[] = [];
  for (const b of codeBlocks(markdown).filter((x) => isJs(x.lang)).slice(0, 4)) {
    const err = syntaxError(b.code, b.lang);
    if (err) { checks.push({ kind: "syntax", label: "A code block in the answer doesn't parse", outcome: "failed", detail: err }); issues.push(`A JavaScript code block in the answer has a syntax error: ${err}`); }
    else checks.push({ kind: "syntax", label: "Code in the answer parses", outcome: "passed" });
  }
  const verified = steps.filter((s) => s.kind === "math" && s.check === "Ran the calculation" && s.result);
  const last = verified[verified.length - 1];
  if (last) {
    const m = last.result!.match(/\[computed:\s*([^\]]*)\]/);
    const nums = numbersIn(m ? m[1] : last.result!);
    const want = nums[nums.length - 1];
    if (want !== undefined) {
      const inAnswer = numbersIn(markdown.replace(/```[\s\S]*?```/g, " "));
      if (inAnswer.some((n) => sameNumber(n, want))) checks.push({ kind: "execution", label: "The answer matches the computed result", outcome: "passed", detail: String(want) });
      else { checks.push({ kind: "execution", label: "The answer doesn't state the computed result", outcome: "failed", detail: String(want) }); issues.push(`The verified calculation gave ${want}, but the answer doesn't state it. Use the verified result or explain why it differs.`); }
    }
  }
  return { checks, issues };
}

/** Critique and revise the final answer until it passes (or a limit is reached). Keeps the best-scoring version. */
export async function refine(ctx: EngineCtx, markdown: string, steps: PlannedStep[], pass: number): Promise<{ markdown: string; checks: CoreCheck[]; score: number | null; rounds: number; revised: boolean }> {
  const notes = steps.filter((s) => s.result).map((s) => `- ${s.title}: ${s.result}${s.check ? ` (${s.check})` : ""}`).join("\n");
  let best = { markdown, score: null as number | null };
  let current = markdown;
  const allChecks: CoreCheck[] = [];
  let rounds = 0;
  let revised = false;
  while (rounds < MAX_ROUNDS_SAFETY) {
    rounds++;
    ctx.emit({ phase: "verify", status: "active", round: rounds });
    const local = localChecks(current, steps);
    const critic = ctx.models.critic(ctx.models.writer);
    const r = await coreCall({ registry: ctx.registry, budget: ctx.budget, model: critic, system: FINAL_CRITIC(ctx.picked.text.critic), prompt: `Question and context:\n${clip(ctx.context, 8000)}\n\nVerified working notes:\n${notes || "(none)"}\n\nDeterministic check results:\n${local.checks.map((c) => `- ${c.label}: ${c.outcome}${c.detail ? ` (${c.detail})` : ""}`).join("\n") || "(none)"}\n\nThe answer:\n${clip(current, 9000)}`, classification: ctx.classification, maxTokens: 600, effort: "high", signal: ctx.signal, timeoutMs: 30_000 });
    const v = r.ok ? parseJson<{ score?: number; issues?: string[]; missing?: string[]; overclaims?: string[] }>(r.text) : null;
    const score = v && typeof v.score === "number" ? Math.max(0, Math.min(10, v.score)) : null;
    const issues = [...local.issues, ...(v?.issues ?? []), ...(v?.missing ?? []).map((m) => `Not answered: ${m}`), ...(v?.overclaims ?? []).map((o) => `Overclaims: ${o}`)].filter((x) => typeof x === "string" && x.trim()).slice(0, 8);
    allChecks.push(...local.checks);
    if (score !== null) allChecks.push({ kind: "critique", label: `Final review by ${name(r.ok ? r.model : critic)}: ${score}/10`, outcome: score >= pass && !local.issues.length ? "passed" : "failed", ...(issues[0] ? { detail: clip(issues[0], 200) } : {}) });
    // Keep the best version seen (a revision that scores lower is dropped).
    if (score !== null && (best.score === null || score >= best.score)) best = { markdown: current, score };
    if (score === null && best.score === null && rounds === 1 && !local.issues.length) { ctx.emit({ phase: "verify", status: "done", detail: "The final review couldn't run; the answer is shown as written." }); break; }
    if ((score === null || score >= pass) && !local.issues.length) { ctx.emit({ phase: "verify", status: "done", detail: score !== null ? `Passed the final review (${score}/10)` : "Passed the automatic checks" }); break; }
    if (!issues.length || !ctx.budget.canSpend(12_000)) { ctx.emit({ phase: "verify", status: "done", detail: ctx.budget.stopped ? "Stopped at the plan's limit; showing the best version so far" : "No fixable issues found" }); break; }
    const w = await coreCall({ registry: ctx.registry, budget: ctx.budget, model: ctx.models.writer, system: REVISER, prompt: `Question and context:\n${clip(ctx.context, 8000)}\n\nVerified working notes:\n${notes || "(none)"}\n\nIssues to fix:\n${issues.map((x) => `- ${x}`).join("\n")}\n\nThe answer to revise:\n${clip(current, 9000)}`, classification: ctx.classification, maxTokens: Math.max(1200, ctx.stepTokens), effort: "medium", signal: ctx.signal });
    if (!w.ok || w.text.trim().length < 20) { ctx.emit({ phase: "verify", status: "done", detail: "Stopped at the plan's limit; showing the best version so far" }); break; }
    current = w.text.trim();
    revised = true;
    allChecks.push({ kind: "critique", label: "Revised to fix the review's findings", outcome: "fixed", detail: clip(issues[0], 200) });
  }
  // The last revision was never reviewed when the loop stopped on budget right after it: keep it only if nothing better was scored.
  const final = best.score !== null ? best.markdown : current;
  return { markdown: final, checks: allChecks, score: best.score, rounds, revised: revised && final !== markdown };
}

const FILLER = /\b(let me know|feel free|hope this helps|consult (?:a|an) (?:professional|expert)|do your own research|stay curious|keep learning)\b/i;

export function cleanInsights(next: unknown, answer: string, max = 3): string[] {
  if (!Array.isArray(next)) return [];
  const seen = new Set<string>();
  const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const aw = words(answer);
  return next
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.replace(/^\s*[-*\d.)]+\s*/, "").trim())
    .filter((x) => x.length >= 15 && x.length <= 240 && !FILLER.test(x))
    // Not a restatement: at least a third of its words are new compared with the answer.
    .filter((x) => { const w = [...words(x)]; return w.length > 0 && w.filter((t) => !aw.has(t)).length / w.length >= 0.34; })
    .filter((x) => { const k = x.toLowerCase().slice(0, 40); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, max);
}

export async function insights(ctx: EngineCtx, markdown: string): Promise<{ nextSteps: string[]; clarify?: string }> {
  const max = ctx.picked.params.maxNext ?? 3;
  if (max <= 0) return { nextSteps: [] };
  const model = ctx.models.forKind("reason");
  const r = await coreCall({ registry: ctx.registry, budget: ctx.budget, model, system: INSIGHT(ctx.picked.text.insight), prompt: `The question:\n${clip(ctx.req.prompt, 3000)}\n\nThe answer given:\n${clip(markdown, 5000)}`, classification: ctx.classification, maxTokens: 400, effort: "low", signal: ctx.signal, timeoutMs: 15_000 });
  if (!r.ok) return { nextSteps: [] };
  const v = parseJson<{ next?: unknown; clarify?: unknown }>(r.text);
  const clarify = typeof v?.clarify === "string" && v.clarify.trim().endsWith("?") && v.clarify.length <= 200 ? v.clarify.trim() : undefined;
  return { nextSteps: cleanInsights(v?.next, markdown, max), ...(clarify ? { clarify } : {}) };
}
