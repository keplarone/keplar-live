/**
 * Scheduled questions: an agent (template "scheduled-question") that asks Keplar a question the person wrote, on their schedule, and
 * puts the cross-checked answer in their Keplar inbox. Runs the same pipeline as the app (src/lib/api/ask.ts, in-process), on the
 * person's own plan and credits. Scheduling itself is the existing agent scheduler (Plus and up; Free and Lite can't schedule).
 */
import type { Workspace } from "@/lib/create/platform/workspace";

export const QUESTION_LIMITS = { min: 8, max: 1000 } as const;

/** Validates the question an agent will ask. Returns the cleaned text or an error sentence. */
export function cleanQuestion(v: unknown): { question: string } | { error: string } {
  const q = typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, QUESTION_LIMITS.max) : "";
  if (q.length < QUESTION_LIMITS.min) return { error: `Write the question this agent should ask (at least ${QUESTION_LIMITS.min} characters).` };
  return { question: q };
}

export type InboxAnswer = { answer: string; agreement: { level: string; agree: number; responded: number; summary: string }; sources: { title: string; url: string | null }[] };

/** The inbox message body: the answer, then how far the models agreed and what they cited. Only real fields; nothing invented. */
export function inboxBody(question: string, a: InboxAnswer): string {
  const agree = a.agreement.level === "single"
    ? "One model answered, so this wasn't cross-checked."
    : `${a.agreement.agree} of ${a.agreement.responded} models agreed${a.agreement.summary ? `: ${a.agreement.summary}` : "."}`;
  const src = a.sources.filter((s) => s.url).slice(0, 6).map((s) => `- ${s.title || s.url}: ${s.url}`);
  return [`Question: ${question}`, "", a.answer.trim(), "", `Agreement: ${agree}`, ...(src.length ? ["", "Sources the models cited (not checked unless stated):", ...src] : [])].join("\n");
}

/** Asks once. Never throws: a failed run returns the reason, so the agent run records it. */
export async function askScheduled(ws: Workspace, question: string): Promise<{ ok: true; body: string } | { ok: false; error: string }> {
  try {
    const { runAsk } = await import("@/lib/api/ask");
    let final: InboxAnswer | null = null;
    for await (const ev of runAsk(ws, { prompt: question, history: [] }, new Headers())) {
      if (ev.event === "answer") final = { answer: ev.data.answer, agreement: ev.data.agreement, sources: ev.data.sources };
    }
    if (!final || !final.answer.trim()) return { ok: false, error: "No model answered this time. Nothing was put in your inbox." };
    return { ok: true, body: inboxBody(question, final) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The question could not be answered." };
  }
}
