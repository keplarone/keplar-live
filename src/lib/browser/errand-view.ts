/**
 * How an errand card describes a Keplar Browser task: the promise before it starts, and the timeline while it runs.
 * Pure and client-safe. Every stage comes from the task's saved steps and status; nothing is invented.
 */
import type { ErrandKind } from "@/lib/chat-actions/intent";
import type { Stage } from "@/components/app-ui/task/TaskTimeline";

export type ErrandStep = { n: number; note: string; url: string; title: string; shot?: string };
export type ErrandStatus = "running" | "done" | "needs_you" | "failed" | "stopped" | "interrupted";
export type ErrandTask = { id: string; goal: string; status: ErrandStatus; steps: ErrandStep[]; answer?: string; reason?: string };

/** What Keplar will do, and where it hands over, in one sentence per kind. */
export const ERRAND_PLAN: Record<ErrandKind, { title: string; does: string; handsOver: string }> = {
  order: { title: "Keplar can order this for you", does: "It finds the restaurant or shop, picks the items and fills the order.", handsOver: "It stops at checkout so you confirm and pay." },
  book: { title: "Keplar can book this for you", does: "It finds options that fit and fills in the booking.", handsOver: "It stops before anything is reserved so you confirm and pay." },
  buy: { title: "Keplar can shop for this", does: "It compares options and fills the cart with the best match.", handsOver: "It stops at checkout so you choose and pay." },
  signup: { title: "Keplar can sign you up", does: "It finds the sign-up page and fills in what it can.", handsOver: "It stops before submitting or creating an account so you check it." },
  form: { title: "Keplar can fill this in", does: "It opens the form and fills in what it can.", handsOver: "It stops before submitting so you check it." },
  compare: { title: "Keplar can compare this for you", does: "It checks several sites and gathers prices and options.", handsOver: "Nothing is bought; you get the comparison." },
};

/** The task as timeline stages: each saved step is done, then where it stands now. */
export function errandStages(t: ErrandTask): Stage[] {
  const stages: Stage[] = t.steps.map((s) => ({ id: `s${s.n}`, label: s.note || `Opened ${hostOf(s.url)}`, detail: hostOf(s.url), status: "done" }));
  switch (t.status) {
    case "running":
      stages.push({ id: "now", label: t.steps.length ? "Working on the next step" : "Opening Keplar's browser", status: "running" });
      break;
    case "needs_you":
      stages.push({ id: "you", label: "Your turn", detail: t.reason ?? "Keplar stopped before a step only you should take.", status: "needs_you" });
      break;
    case "done":
      stages.push({ id: "end", label: "Finished", ...(t.answer ? { detail: t.answer } : {}), status: "done" });
      break;
    case "failed":
    case "interrupted":
      stages.push({ id: "end", label: "Didn't finish", detail: t.reason ?? "Nothing was bought, sent or changed.", status: "failed" });
      break;
    case "stopped":
      stages.push({ id: "end", label: "Stopped", detail: t.reason ?? "You stopped the task.", status: "canceled" });
      break;
  }
  return stages;
}

/** The page the person should open to take over (the last page Keplar was on), if it is a safe web address. */
export function handoverUrl(t: ErrandTask): string | null {
  const last = t.steps[t.steps.length - 1]?.url;
  return last && /^https:\/\//i.test(last) ? last : null;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
