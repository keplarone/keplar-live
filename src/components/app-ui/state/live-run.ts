/**
 * Live Research in the chat, the side effects: run research on the Keplar One desktop app before the question goes to /api/keplar,
 * then have the desktop check the answer's citations when it comes back. KeplarApp.run calls these two; everything they compute is in
 * live-research.ts (pure, tested). keplar-desktop: src/main/research (desktop app 0.2.0+).
 *
 * Retrieval finishes on this computer before the request is sent (never inside it): the route's time limit covers only Keplar's models.
 * Stop cancels the desktop run. Any failure here is reported and the question continues as an ordinary web question.
 */
import { resolveFollowup } from "@/lib/orchestration/followup";
import { isSmallTalk } from "@/lib/orchestration/smalltalk-kind";
import type { ComposerModes, KeplarAnswer, KeplarRequest, LiveDepth, ResearchEvent } from "@/lib/orchestration/types";
import { researchCapabilities, safe, type ResearchBridge, type ResearchRun } from "@/lib/desktop/research-bridge";
import { liveMarkdown, liveRequestField, newSourceEvents, progressEvents, toResearchSource, withLiveCheck } from "./live-research";
import type { Message } from "./types";

export type LiveSession = { run: ResearchRun; field: NonNullable<KeplarRequest["liveResearch"]>; webSearch: boolean };
export type LivePrep = { ok: true; session: LiveSession } | { ok: false; error: string };

/**
 * Whether a message gets Live Research: a web or Deep Research question, never a Debate, Create, image, Agent, Study or Slides run (they
 * keep their own flow, and the server would turn them off for a brief), and never small talk ("thanks!", "ok") sent with Web still on.
 */
export function wantsLiveResearch(m: Partial<ComposerModes>, prompt = ""): boolean {
  if (!(m.web || m.deepResearch) || m.debate || m.create || m.image || m.agent || m.study || m.slides) return false;
  return !(prompt && isSmallTalk({ prompt }));
}

/**
 * The modes a message is sent with when Live Research could not run: unchanged, except Deep Research on a plan without it (the desktop
 * offered it there because the pages would be read on this computer), which goes as a web question instead of being refused.
 */
export function modesWithoutLive(m: ComposerModes, planHasDeepResearch: boolean): ComposerModes {
  return m.deepResearch && !planHasDeepResearch ? { ...m, web: true, deepResearch: false } : m;
}

/** The desktop's limit for a question (longer ones are refused there); a pasted article keeps its start. */
export const RESEARCH_QUESTION_MAX = 2000;

/**
 * The question the desktop researches: a follow-up ("and AMD?") resolved against the conversation into a standalone question, as the
 * server resolves it (only the question: the server's note to the models would read as a long, deep question and make poor searches).
 */
export function researchQuestion(text: string, history: KeplarRequest["history"]): string {
  const f = resolveFollowup(text, history ?? []);
  return (f ? f.question : text).trim().slice(0, RESEARCH_QUESTION_MAX);
}

/**
 * Earlier Live Research runs in this chat (newest last, at most 3), before the message being answered: their sources stay citable in a
 * follow-up. A retried or refreshed answer's own run is not "earlier", so its pages are read again.
 */
export function previousRunIds(messages: readonly Message[] = [], beforeId?: string): string[] {
  const ids: string[] = [];
  for (const m of messages) {
    if (beforeId && m.id === beforeId) break;
    const id = m.role === "keplar" ? m.answer?.research?.live?.runId : undefined;
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids.slice(-3);
}

/**
 * Runs Live Research on the desktop: start, progress (mapped onto the chat's research card), wait, brief. Returns the request field,
 * or why it couldn't run. Never throws.
 */
export async function prepareLiveResearch(i: { bridge: ResearchBridge; question: string; depth?: LiveDepth; previousRunIds: string[]; fresh?: boolean; signal: AbortSignal; emit: (e: ResearchEvent) => void }): Promise<LivePrep> {
  const { bridge, emit, signal } = i;
  const caps = await researchCapabilities(bridge);
  if (!caps) return { ok: false, error: "Live Research is turned off or unavailable in the desktop app" };
  if (signal.aborted) return { ok: false, error: "Stopped" };
  // fresh: Refresh research reads every page again instead of using the desktop's short-lived cache.
  const question = i.question.trim().slice(0, RESEARCH_QUESTION_MAX);
  const started = await safe(() => bridge.start({ question, ...(i.depth ? { depth: i.depth } : {}), ...(i.previousRunIds.length ? { previousRunIds: i.previousRunIds } : {}), ...(i.fresh ? { fresh: true } : {}) }));
  if (!started.ok) return { ok: false, error: started.error };
  const runId = started.result.id;
  // Stopped while the run was starting: the abort event has already fired, so cancel it here.
  if (signal.aborted) {
    void safe(() => bridge.cancel(runId));
    return { ok: false, error: "Stopped" };
  }
  emit({ phase: "live", label: started.result.label, depth: started.result.depth.selected, webSearch: caps.webSearch });
  // The run is often already searching when start answers (its first progress report went out before this page listened).
  for (const e of progressEvents({ runId, stage: started.result.stage, label: started.result.label, searched: 0, found: 0, read: 0, failed: 0 })) if (e.phase === "step") emit(e);
  const shown = new Set<number>();
  let fetching = false;
  let lastRead = -1;
  // Pages appear in the card as the desktop reads them (progress carries counts; the run snapshot carries the pages).
  const refresh = async () => {
    if (fetching) return;
    fetching = true;
    try {
      const snap = await safe(() => bridge.get(runId));
      if (snap.ok) for (const e of newSourceEvents(snap.result, shown)) { if (e.phase === "source") shown.add(e.source.n); emit(e); }
    } finally {
      fetching = false;
    }
  };
  const off = bridge.onProgress((p) => {
    if (p.runId !== runId || signal.aborted) return; // progress for every run reaches every app page; only this run's counts
    for (const e of progressEvents(p)) emit(e);
    if (p.read !== lastRead) { lastRead = p.read; void refresh(); }
  });
  const cancel = () => void safe(() => bridge.cancel(runId));
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const done = await safe(() => bridge.wait(runId));
    if (signal.aborted) return { ok: false, error: "Stopped" };
    if (!done.ok) return { ok: false, error: done.error };
    const run = done.result;
    // The finished run numbers its pages by relevance, not reading order: the card takes that final numbering (the brief and the answer's [n] use it).
    emit({ phase: "live", label: run.label, sources: run.sources.map((x) => toResearchSource(x, run.queries)) });
    if (run.stage !== "ready" || !run.sources.length) return { ok: false, error: run.error ?? "No pages could be read for this question" };
    const b = await safe(() => bridge.brief(runId));
    if (!b.ok) return { ok: false, error: b.error };
    emit({ phase: "step", step: "read", status: "done" });
    return { ok: true, session: { run: b.result.run, field: liveRequestField(b.result.run, b.result.brief, caps.webSearch), webSearch: caps.webSearch } };
  } finally {
    off();
    signal.removeEventListener("abort", cancel);
  }
}

/**
 * Has the desktop check a finished answer's citations against the pages it read, and returns the answer with the check applied. When
 * the check can't run (the app was closed, the run expired), the answer keeps the server's citation linking and the run's provenance.
 */
export async function checkLiveAnswer(i: { bridge: ResearchBridge; session: LiveSession; answer: KeplarAnswer; emit: (e: ResearchEvent) => void }): Promise<KeplarAnswer> {
  i.emit({ phase: "step", step: "write", status: "done" });
  i.emit({ phase: "step", step: "check", status: "active" });
  // The desktop checks the text the page will show (its own rewrite isn't used: see withLiveCheck).
  const text = liveMarkdown(i.answer, i.session.run);
  const v = text.trim() ? await safe(() => i.bridge.validate(i.session.run.id, text)) : null;
  return withLiveCheck(i.answer, i.session.run, v?.ok ? v.result : null, i.session.webSearch);
}
