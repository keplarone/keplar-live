/**
 * The Keplar Apps build pipeline, resumable across requests:
 *   plan -> generate (wave 1 with images in parallel, wave 2) -> verify (static + browser + requested-vs-built + visual review)
 *   -> fix -> verify ... (up to the plan's attempts) -> save.
 * Each request runs stages until ~285 s, persists the build, and tells the client to continue; the client calls again with the
 * build id. Cost is charged after every request (so an abandoned build still pays for what it used, never more), and every
 * build is capped by the plan's maxBuildUsd.
 */
import { assertCanSpend, charge } from "@/lib/create/platform/compute";
import { narrateBuild, promptForDisplay } from "@/lib/style/create-narration";
import { breakerLevel } from "@/lib/create/platform/breaker";
import { HttpError } from "@/lib/create/platform/http";
import { id as newId, now } from "@/lib/create/platform/ids";
import { acquireJobSlot } from "@/lib/create/platform/jobs";
import { rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { collection } from "@/lib/create/platform/store";
import type { Workspace } from "@/lib/create/platform/workspace";
import { meteredUsd } from "@/lib/orchestration/limits";
import { newBlobId, putImage, setPublic } from "@/lib/images/blob";
import { PRODUCTION_URL, siteUrl } from "@/lib/site";
import { checkPrompt } from "@/lib/site-builder/safety";
import { addVersion, getVersion, sites } from "@/lib/site-builder/store";
import type { Site } from "@/lib/site-builder/types";
import { appCtx } from "@/lib/app-runtime/context";
import { seedDraft } from "@/lib/app-runtime/data";
import { designBrief, normalizeDesign, tokensFor } from "./design/tokens";
import { styleById } from "./design/presets";
import { surpriseFor } from "./design/surprise";
import { finishFiles, planWaves, runWave } from "./generate";
import { fixProblems, type Problem } from "./fix";
import { generateSlotImages } from "./images";
import { LlmError } from "./llm";
import { APP_BUILD_LIMITS, chainFor } from "./models";
import { normalizeAppFiles, AppFilesError } from "./files";
import { planApp } from "./plan";
import { rubricFindings } from "./rubric";
import { autofixImports, staticCheck } from "./verify/static";
import { reviewBuild } from "./verify/review";
import type { AppBuild, AppMeta, AppSpec, CheckResult, DesignChoice, FeatureVerdict } from "./types";
import { publicSpec, buildEstimateUnits, buildMaxUnits, previewUrlFor, type PublicSpec } from "./public";
export { publicSpec, buildEstimateUnits, buildMaxUnits, previewUrlFor, type PublicSpec };

export type BuildRow = AppBuild & { workspaceId: string; siteId: string };
export const builds = () => collection<BuildRow>("app_builds");

export type BuildEvent =
  | { type: "build"; id: string; stage: AppBuild["stage"] }
  | { type: "stage"; stage: AppBuild["stage"]; text: string }
  | { type: "plan"; spec: PublicSpec }
  | { type: "file"; path: string; bytes: number; text?: string }
  | { type: "progress"; group: string; chars: number }
  | { type: "image"; slot: string; ok: boolean }
  | { type: "check"; check: CheckResult }
  | { type: "verdicts"; verdicts: FeatureVerdict[] }
  | { type: "visual"; visual: NonNullable<AppBuild["visual"]> }
  | { type: "design"; design: DesignChoice }
  | { type: "problems"; count: number; sample: string[] }
  | { type: "log"; text: string }
  | { type: "continue"; id: string }
  | { type: "done"; version: number; previewUrl: string; units: number; report: NonNullable<AppMeta["report"]>; notBuilt: string[] }
  | { type: "error"; error: string; code: string };

const PROMPT_MAX: Record<Workspace["plan"], number> = { free: 2_000, lite: 4_000, plus: 8_000, pro: 12_000, business: 16_000 };
const BUILDS_PER_DAY: Record<Workspace["plan"], number> = { free: 4, lite: 10, plus: 25, pro: 60, business: 120 };

/** Seconds a stage needs before it is started in the current request (otherwise the request ends with "continue"). */
const NEED_S = { plan: 75, generate: 130, verify: 90, fix: 140, save: 15 } as const;
const REQUEST_BUDGET_MS = 286_000;
/** A build left mid-stage when the serverless function was killed (no catch/finally) is failed on the next touch so the UI never spins forever. */
const STALE_BUILD_MS = 8 * 60_000;

/** Validates and creates a build (everything that can refuse happens here, so the route answers with a proper status). */
export async function startBuild(ws: Workspace, site: Site, input: { prompt?: string; design?: unknown; confirm?: boolean; edit?: boolean }): Promise<BuildRow> {
  const prompt = String(input.prompt ?? "").trim();
  if (prompt.length < 3) throw new HttpError(400, "Describe what you want to build.");
  if (prompt.length > PROMPT_MAX[ws.plan]) throw new HttpError(413, `That's too long for your plan (up to ${PROMPT_MAX[ws.plan].toLocaleString("en-US")} characters).`, "too_large");
  if (!process.env.OPENROUTER_API_KEY?.trim()) throw new HttpError(503, "The app builder isn't connected to its models yet.", "not_configured");
  if (site.takenDown) throw new HttpError(451, "This project was taken down for breaking the terms.", "taken_down");
  const problem = await checkPrompt(prompt);
  if (problem) throw new HttpError(422, problem, "refused");
  try {
    await rateLimit(`apps:min:${ws.id}`, 4, 60, { shared: true });
    await rateLimit(`apps:day:${ws.id}`, BUILDS_PER_DAY[ws.plan], 86_400, { shared: true });
  } catch (e) {
    if (e instanceof RateLimitError) throw new HttpError(429, `You've reached the build limit for now (${BUILDS_PER_DAY[ws.plan]} builds a day on your plan).${ws.plan === "free" ? " Upgrade for more." : ""}`, "daily_limit");
    throw e;
  }
  const est = buildEstimateUnits(ws.plan);
  await assertCanSpend(ws, est);
  if (est > 0 && !input.confirm) throw new HttpError(409, `This build uses about ${est.toLocaleString("en-US")} credits (at most ${buildMaxUnits(ws.plan).toLocaleString("en-US")}). Confirm to start.`, "confirm", { estimate: { units: est, max: buildMaxUnits(ws.plan) } });
  const editing = Boolean(input.edit && site.kind === "app" && site.app && site.headVersion);
  const auto = !editing && (input.design === "auto" || (typeof input.design === "object" && input.design !== null && (input.design as { auto?: unknown }).auto === true));
  const design = normalizeDesign(auto ? { ...(input.design as object), style: (input.design as { style?: string })?.style } : input.design ?? (editing ? site.app!.design : undefined));
  const t = now();
  const row: BuildRow = {
    id: newId("abl"), workspaceId: ws.id, siteId: site.id, prompt, design, stage: "plan", spec: null, files: {}, images: editing ? { ...(site.app!.images ?? {}) } : {}, attempts: 0,
    checks: [], verdicts: [], visual: null, shots: [], usd: 0, model: null, log: [], startedAt: t, updatedAt: t, error: null, version: null, wave: 0, charged: 0, units: 0, runs: 0,
    base: editing ? { version: site.headVersion, changes: [] } : null,
    ...(auto && !(input.design as { style?: string })?.style ? { designAuto: true } : {}),
  };
  await builds().insert(row);
  return row;
}

export async function getBuild(ws: Workspace, id: string): Promise<BuildRow> {
  const b = await builds().get(ws.id, id);
  if (!b) throw new HttpError(404, "Build not found.", "not_found");
  return b;
}

/** Marks a build failed when it was abandoned mid-stage (serverless kill, crash) so GET/resume show an error + Retry instead of "Reading your idea…". */
export async function failStaleBuild(b: BuildRow): Promise<BuildRow> {
  if (b.stage === "done" || b.stage === "failed") return b;
  const age = Date.now() - new Date(b.updatedAt || b.startedAt).getTime();
  if (age < STALE_BUILD_MS) return b;
  const stageHint = b.stage === "plan" ? "while planning" : b.stage === "generate" ? "while writing code" : b.stage === "verify" || b.stage === "visual" ? "while testing" : b.stage === "fix" ? "while fixing" : "while building";
  b.error = b.error || `The build stopped ${stageHint} (the server timed out). Nothing was published — try again.`;
  b.stage = "failed";
  b.updatedAt = now();
  await builds().update(b.workspaceId, b.id, b).catch(() => undefined);
  return b;
}

/** Runs the build forward for one request. Always persists and charges what was spent. */
export async function* runBuild(ws: Workspace, site: Site, buildId: string, opts: { origin: string }): AsyncGenerator<BuildEvent> {
  const started = Date.now();
  const deadline = started + REQUEST_BUDGET_MS;
  const left = () => (deadline - Date.now()) / 1000;
  let b = await getBuild(ws, buildId);
  if (b.siteId !== site.id) throw new HttpError(404, "Build not found.", "not_found");
  b = await failStaleBuild(b);
  yield { type: "build", id: b.id, stage: b.stage };
  if (b.stage === "done" || b.stage === "failed") {
    if (b.stage === "failed") yield { type: "error", error: b.error ?? "The build failed.", code: "failed" };
    return;
  }
  const release = await acquireJobSlot(ws.id, "app", 1, 6 * 60_000, "appslot", "This project already has a build running.");
  const L = APP_BUILD_LIMITS[ws.plan];
  const breaker = await breakerLevel();
  let tokens = tokensFor(b.design);
  let brief = designBrief(b.design, tokens);
  const log = (text: string) => {
    b.log = [...b.log, { at: now(), text }].slice(-80);
  };
  const save = async () => {
    b.updatedAt = now();
    await builds().update(ws.id, b.id, b);
  };
  const overBudget = () => L.maxBuildUsd > 0 && !ws.admin && b.usd >= L.maxBuildUsd;
  const events: BuildEvent[] = [];
  let wake: (() => void) | null = null;
  const emit = (e: BuildEvent) => {
    events.push(e);
    wake?.();
  };
  const flush = function* () {
    while (events.length) yield events.shift()!;
  };
  /** Streams events emitted while `p` runs (files, checks, images...) instead of after it finishes. */
  async function* during<T>(p: Promise<T>): AsyncGenerator<BuildEvent, T> {
    let settled = false;
    let value: T | undefined;
    let error: unknown = null;
    p.then((v) => { settled = true; value = v; wake?.(); }, (e) => { settled = true; error = e ?? new Error("failed"); wake?.(); });
    for (;;) {
      while (events.length) yield events.shift()!;
      if (settled) break;
      await new Promise<void>((r) => {
        wake = r;
        if (events.length || settled) r();
      });
      wake = null;
    }
    if (error) throw error;
    return value as T;
  }
  b.runs = (b.runs ?? 0) + 1;
  try {
    if (b.runs > 8) throw new LlmError("This build took too many steps and was stopped. Try a simpler request.", "too_long");
    while (true) {
      yield* flush();
      if (b.stage === "plan") {
        // Several continue rounds that never left "plan" (surprise + LLM burns the budget without a spec) → fail loudly with Retry.
        if ((b.runs ?? 0) > 3 && !b.spec) throw new LlmError("Planning took too long and was stopped. Try again in a minute, or simplify the request.", "plan_timeout");
        if (left() < NEED_S.plan) break;
        yield { type: "stage", stage: "plan", text: b.base ? "Planning the change" : "Understanding the idea and planning the product" };
        await save(); // heartbeat so a kill mid-plan is detectable as stale (and resume does not spin forever)
        if (b.designAuto) {
          // A distinctive art direction for this idea (palette, type, shape, motion, signature motif) instead of a default look.
          const d = yield* during(surpriseFor(ws.plan, b.prompt, "", `${b.id}:${b.prompt}`));
          b.usd += d.usd;
          b.design = { ...d.design, mode: (b.design.mode === "dark" ? "dark" : d.design.mode) };
          b.designAuto = false;
          tokens = tokensFor(b.design);
          brief = designBrief(b.design, tokens);
          log(`Art direction: ${styleById(b.design.style).name}, ${b.design.mode}.`);
          await save(); // persist the pick so a later kill does not re-run surprise on every continue
          yield { type: "design", design: b.design };
        }
        const prev = b.base ? site.app?.spec ?? null : null;
        let lastPlanChars = 0;
        const r = yield* during(planApp({
          prompt: b.prompt, designBrief: brief, L, chain: chainFor(ws.plan, "plan", breaker),
          deadline: Math.min(deadline, Date.now() + 150_000), previous: prev,
          // Stream plan tokens so a silent hang hits the idle timeout and the UI sees progress (not a forever spinner).
          onDelta: (_d, total) => {
            if (total - lastPlanChars >= 400 || total < 40) {
              lastPlanChars = total;
              emit({ type: "progress", group: "plan", chars: total });
            }
          },
        }));
        b.usd += r.usd;
        b.model = r.model;
        b.spec = r.spec;
        if (b.base) {
          b.base.changes = r.changes.length ? r.changes : r.spec.files.filter((f) => f.path !== "index.html").map((f) => ({ path: f.path, what: "Apply the requested change." }));
          const cur = await getVersion(site, b.base.version);
          b.files = { ...(cur?.files ?? {}) };
        }
        log(`Planned ${r.spec.name}: ${r.spec.pages.length} screens, ${r.spec.collections.length} collections, ${r.spec.ai.length} AI actions, ${r.spec.features.length} features.`);
        b.stage = "generate";
        b.wave = 0;
        await save();
        yield { type: "plan", spec: publicSpec(r.spec) };
        continue;
      }
      const spec = b.spec!;
      if (b.stage === "generate") {
        const waves = b.base ? [editGroups(spec, b.base.changes)] : planWaves(spec, L);
        const w = b.wave ?? 0;
        if (w >= waves.length) {
          b.files = finishFiles(spec, b.files);
          b.stage = "verify";
          await save();
          continue;
        }
        if (left() < NEED_S.generate) break;
        if (overBudget()) throw new LlmError("This build reached your plan's cost cap before the code was written.", "budget");
        const todo = waves[w].filter((g) => g.files.some((f) => b.files[f.path] === undefined) || b.base);
        yield { type: "stage", stage: "generate", text: b.base ? `Writing the change (${todo.flatMap((g) => g.files).length} files)` : w === 0 ? "Writing the foundation: design language and shared components" : "Writing the screens and wiring the app" };
        const allCss = waves.flat().map((g) => g.css).filter((c): c is string => Boolean(c));
        const imageJob = !b.base && w === 0 && spec.images.length && L.images > 0 && !Object.keys(b.images).length
          ? generateSlotImages({ slots: spec.images, workspaceId: ws.id, origin: imageOrigin(opts.origin), styleHint: `${styleById(b.design.style).name}. ${b.design.direction ?? ""} Palette ${tokens.palette.bg}, ${tokens.palette.accent}, ${tokens.palette.accent2}.`, deadline, onImage: (slot, url) => emit({ type: "image", slot, ok: Boolean(url) }) })
          : null;
        const r = yield* during(runWave({ spec, designBrief: brief + (b.base ? `\n\nCHANGE REQUEST FROM THE OWNER: ${b.prompt}` : ""), groups: todo, context: b.files, allCss, chain: chainFor(ws.plan, "code", breaker), L, deadline: deadline - 5_000, onEvent: (e) => emit(e) }));
        b.usd += r.usd;
        b.model = r.model ?? b.model;
        Object.assign(b.files, r.files);
        if (imageJob) {
          const im = yield* during(imageJob);
          b.usd += im.usd;
          Object.assign(b.images, im.images);
          log(`Generated ${Object.keys(im.images).length} of ${spec.images.length} images.`);
        }
        if (r.failed.length) {
          log(`Could not write ${r.failed.join(", ")} yet.`);
          const retried = (b.log.filter((l) => l.text.startsWith("Could not write")).length);
          if (retried >= 4) throw new LlmError(`The models could not write ${r.failed.slice(0, 3).join(", ")}. Try again in a minute.`, "model_failed");
          await save();
          // Busy or out-of-capacity providers usually clear within seconds; don't burn the remaining attempts back to back.
          await new Promise((res) => setTimeout(res, Math.min(15_000, 4_000 * retried)));
          if (b.base) {
            b.wave = w + 1;
          }
          continue;
        }
        b.wave = w + 1;
        await save();
        continue;
      }
      if (b.stage === "verify") {
        if (left() < NEED_S.verify) break;
        yield { type: "stage", stage: "verify", text: b.attempts ? `Re-testing after fix ${b.attempts}` : "Testing: type-checking the code, then clicking through every screen in a real browser" };
        const auto = autofixImports(b.files);
        if (auto.changed.length) {
          b.files = auto.files;
          log(`Repaired imports in ${auto.changed.join(", ")} (no model needed).`);
        }
        const st = staticCheck(b.files, spec);
        const usesChanged = [...st.uses].some((u) => !spec.uses.includes(u));
        if (usesChanged) {
          spec.uses = [...new Set([...spec.uses, ...st.uses])];
          b.files = finishFiles(spec, b.files);
        }
        const rubric = rubricFindings(b.files);
        const checks: CheckResult[] = [];
        const addCheck = (c: CheckResult) => {
          checks.push(c);
          emit({ type: "check", check: c });
        };
        addCheck({ id: "static", label: "Code checks (syntax, imports, data names)", ok: st.issues.length === 0, detail: st.issues.length ? `${st.issues.length} problem${st.issues.length === 1 ? "" : "s"}: ${st.issues[0].message}` : `${Object.keys(b.files).length} files parse and link` });
        const rubricErrors = rubric.filter((f) => f.severity === "error");
        addCheck({ id: "rubric", label: "Anti-generic rubric", ok: rubricErrors.length === 0, detail: rubric.length ? rubric.slice(0, 3).map((f) => f.message).join(" ") : "No template tells, stock images or invented proof" });
        yield* flush();
        const meta = metaFor(ws, site, spec, b.design, b.images);
        const finalPass = b.attempts >= L.fixAttempts;
        const { smokeTest } = await import("./verify/smoke");
        const smoke = yield* during(smokeTest({ site, meta, files: b.files, plan: ws.plan, deadline: Math.min(deadline - 40_000, Date.now() + 100_000), onCheck: addCheck, aiCalls: b.attempts === 0 || finalPass, shots: true, workspace: ws }));
        if (smoke.skipped) addCheck({ id: "browser", label: "Browser test", ok: false, detail: smoke.skipped });
        yield* flush();
        let verdicts: FeatureVerdict[] = b.verdicts;
        let visual = b.visual;
        let fixes: Problem[] = [];
        if (left() > 45) {
          yield { type: "stage", stage: "visual", text: "Comparing what you asked for with what was built, and reviewing the design" };
          const rv = yield* during(reviewBuild({ spec, prompt: b.prompt, designBrief: brief, files: b.files, checks, issues: smoke.issues, texts: smoke.texts, shots: smoke.shots, vision: L.visualPass, chain: chainFor(ws.plan, L.visualPass ? "vision" : "plan", breaker), deadline: Math.min(deadline - 10_000, Date.now() + 90_000) }));
          b.usd += rv.usd;
          if (rv.review) {
            verdicts = rv.review.verdicts;
            visual = rv.review.visual;
            fixes = rv.review.fixes.map((f) => ({ file: f.file, message: `${f.problem} -> ${f.instruction}`, source: "review" as const, severity: f.severity }));
            yield { type: "verdicts", verdicts };
            if (visual) yield { type: "visual", visual };
          }
        }
        const problems: Problem[] = [
          ...st.issues.map((i) => ({ file: i.file, message: `${i.line ? `line ${i.line}: ` : ""}${i.message}`, source: "static" as const, severity: "high" as const })),
          ...smoke.issues.map((i) => ({ file: i.file, message: `[screen ${i.route}] ${i.message}${i.line ? ` (line ${i.line})` : ""}`, source: "browser" as const, severity: "high" as const })),
          ...checks.filter((c) => !c.ok && c.id.startsWith("flow:")).map((c) => ({ message: `${c.label} failed in the browser test: ${c.detail}`, source: "browser" as const, severity: "high" as const })),
          ...rubric.filter((f) => f.severity === "error" || b.attempts === 0).map((f) => ({ file: f.file, message: f.message, source: "rubric" as const, severity: f.severity === "error" ? ("high" as const) : ("low" as const) })),
          ...fixes.filter((f) => f.severity !== "low" || (visual?.score ?? 10) < 7),
          // Design-review findings the reviewer did not turn into a file fix still get one pass (broken layouts, cramped columns).
          ...(fixes.length ? [] : (visual?.issues ?? []).slice(0, 4).map((m) => ({ message: `Design review (screenshots): ${m}`, source: "review" as const, severity: "medium" as const }))),
        ];
        b.checks = checks;
        b.verdicts = verdicts;
        b.visual = visual;
        const blocking = problems.filter((p) => p.severity === "high" || (p.severity === "medium" && b.attempts === 0)).length + verdicts.filter((v) => v.status !== "built" && spec.features.find((f) => f.id === v.id)?.must).length + ((visual?.score ?? 10) < 7 ? 1 : 0);
        if (finalPass || !blocking || overBudget() || !problems.length) {
          // Keep screenshots of the final state for the report.
          b.shots = await storeShots(ws, smoke.shots, opts.origin);
          b.problems = [];
          b.stage = "save";
          log(blocking ? `Shipping with ${blocking} open item${blocking === 1 ? "" : "s"} after ${b.attempts} fix round${b.attempts === 1 ? "" : "s"}.` : "All checks passed.");
        } else {
          b.problems = problems.slice(0, 30);
          b.stage = "fix";
          yield { type: "problems", count: problems.length, sample: problems.slice(0, 5).map((p) => `${p.file ? `${p.file}: ` : ""}${p.message}`.slice(0, 200)) };
        }
        await save();
        continue;
      }
      if (b.stage === "fix") {
        if (left() < NEED_S.fix) break;
        if (overBudget()) {
          b.stage = "save";
          log("Reached the plan's cost cap; saving the best version so far.");
          continue;
        }
        b.attempts += 1;
        yield { type: "stage", stage: "fix", text: `Fixing ${b.problems?.length ?? 0} problem${b.problems?.length === 1 ? "" : "s"} (round ${b.attempts} of ${L.fixAttempts})` };
        const r = yield* during(fixProblems({ spec, designBrief: brief, files: b.files, problems: b.problems ?? [], chain: chainFor(ws.plan, "fix", breaker), L, deadline: deadline - 5_000, onFile: (p) => emit({ type: "file", path: p, bytes: 0 }) }));
        b.usd += r.usd;
        b.files = finishFiles(spec, r.files);
        log(r.changed.length ? `Fix round ${b.attempts}: rewrote ${r.changed.join(", ")}.` : `Fix round ${b.attempts}: no file changed.`);
        b.stage = "verify";
        await save();
        continue;
      }
      if (b.stage === "save") {
        if (left() < NEED_S.save) break;
        yield { type: "stage", stage: "save", text: "Saving the version and preparing the preview" };
        const { files } = normalizeAppFiles(b.files, { maxFiles: L.maxFiles + 14, maxBytes: L.maxBytes });
        const report: NonNullable<AppMeta["report"]> = { checks: b.checks, verdicts: b.verdicts, visual: b.visual, shots: b.shots, attempts: b.attempts, version: 0, at: now(), model: b.model, usd: b.usd };
        const meta: AppMeta = { ...metaFor(ws, site, spec, b.design, b.images), report };
        const fresh = (await sites().get(ws.id, site.id)) ?? site;
        const units = await settle(ws, b, site.id);
        const built = b.verdicts.filter((v) => v.status === "built").length;
        const summary = `${b.base ? "Updated" : "Built"} ${spec.name}: ${spec.pages.length} screens${spec.collections.length ? `, ${spec.collections.length} data collections` : ""}${spec.auth.enabled ? ", accounts" : ""}${spec.ai.length ? `, ${spec.ai.length} AI feature${spec.ai.length === 1 ? "" : "s"}` : ""}. Requested vs built: ${built}/${b.verdicts.length || spec.features.length} built.`;
        const updatedSite = (await sites().update(ws.id, site.id, { kind: "app", app: meta, name: fresh.headVersion ? fresh.name : spec.name.slice(0, 60), updatedAt: now() })) ?? { ...fresh, kind: "app" as const, app: meta };
        const { version } = await addVersion(ws, updatedSite, files, { kind: "ai", summary, prompt: b.prompt, model: b.model, units: b.units ?? units }, (n) => [
          { id: newId("msg"), role: "user", text: promptForDisplay(b.prompt).slice(0, 2000), at: b.startedAt },
          { id: newId("msg"), role: "assistant", text: narrateBuild(summary, spec), at: now(), units: b.units ?? units, version: n },
        ]);
        report.version = version.n;
        const withSeed: AppMeta = { ...meta, report, seededVersion: version.n };
        const finalSite = (await sites().update(ws.id, site.id, { app: withSeed })) ?? { ...updatedSite, app: withSeed };
        const ctx = appCtx(finalSite, "draft", ws.plan);
        if (ctx?.limits.backend) await seedDraft(ctx).catch((e) => console.error("[apps] seed failed", e));
        b.version = version.n;
        b.stage = "done";
        await save();
        yield { type: "done", version: version.n, previewUrl: previewUrlFor(site, version.n), units: b.units ?? units, report, notBuilt: spec.notBuilt };
        return;
      }
      break;
    }
    // Out of time for the next stage in this request.
    await save();
    await settle(ws, b, site.id);
    yield* flush();
    yield { type: "continue", id: b.id };
  } catch (e) {
    const code = e instanceof LlmError ? e.code : e instanceof AppFilesError ? "invalid_files" : e instanceof HttpError ? e.code ?? "error" : "internal";
    if (e instanceof LlmError) b.usd += e.usd;
    const msg = e instanceof LlmError || e instanceof AppFilesError || e instanceof HttpError ? e.message : "Something went wrong while building. Nothing was published.";
    if (code === "internal") console.error("[apps] build failed", e);
    b.error = msg;
    b.stage = "failed";
    await save().catch(() => undefined);
    await settle(ws, b, site.id).catch(() => 0);
    yield* flush();
    yield { type: "error", error: msg, code };
  } finally {
    await release();
  }
}

/** Charges what this build spent since the last charge. Returns total units charged for the build. */
async function settle(ws: Workspace, b: BuildRow, ref: string): Promise<number> {
  const due = b.usd - (b.charged ?? 0);
  if (due > 0.00005) {
    const u = await charge(ws, "app.build", { usd: meteredUsd(due), ref });
    b.charged = b.usd;
    b.units = (b.units ?? 0) + u;
    await builds().update(ws.id, b.id, { charged: b.charged, units: b.units }).catch(() => undefined);
  }
  return b.units ?? 0;
}

function editGroups(spec: AppSpec, changes: { path: string; what: string }[]) {
  const files = changes.map((c) => ({ ...(spec.files.find((f) => f.path === c.path) ?? { path: c.path, role: "js" as const, purpose: "" }), purpose: `${spec.files.find((f) => f.path === c.path)?.purpose ?? ""} CHANGE: ${c.what}` }));
  const groups = [];
  for (let i = 0; i < files.length; i += 2) groups.push({ id: `edit${groups.length + 1}`, files: files.slice(i, i + 2), css: `styles/edit${groups.length + 1}.css` });
  return groups;
}

export function metaFor(ws: Workspace, site: Site, spec: AppSpec, design: DesignChoice, images: Record<string, string>): AppMeta {
  const prev = site.app;
  return {
    spec,
    design,
    admins: prev?.admins?.length ? prev.admins : ws.email ? [ws.email.toLowerCase()] : [],
    settings: prev?.settings ?? { signups: true, ai: true, uploads: true },
    images,
    ...(prev?.report ? { report: prev.report } : {}),
  };
}

const imageOrigin = (reqOrigin: string) => (process.env.VERCEL ? (siteUrl.startsWith("https://") ? siteUrl : PRODUCTION_URL) : reqOrigin);

async function storeShots(ws: Workspace, shots: { route: string; viewport: string; png: Buffer }[], origin: string): Promise<AppBuild["shots"]> {
  const out: AppBuild["shots"] = [];
  for (const s of shots.slice(0, 8)) {
    try {
      const id = newBlobId();
      await putImage(id, ws.id, s.png, "image/jpeg");
      await setPublic(ws.id, id, true);
      out.push({ route: s.route, viewport: s.viewport, url: `${imageOrigin(origin)}/i/${id}` });
    } catch {
      /* a screenshot that cannot be stored is skipped */
    }
  }
  return out;
}
