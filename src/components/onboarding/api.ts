import type { Answers, OnboardingState, ProgressKey, Starter, ChecklistItem } from "@/lib/onboarding/model";

export type Payload = {
  state: OnboardingState;
  plan: { id: string; line: string; connectorsAllowed: boolean };
  name: string;
  starters: Starter[];
  checklist: ChecklistItem[];
  firstQuestionDone: boolean;
};

export class AuthLost extends Error {}

async function call(method: "GET" | "PATCH" | "POST", body?: unknown): Promise<Payload> {
  const res = await fetch("/api/onboarding", { method, cache: "no-store", credentials: "same-origin", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401) throw new AuthLost("signed out");
  const j = (await res.json().catch(() => ({}))) as Payload & { error?: string };
  if (!res.ok) throw new Error(j.error ?? "Couldn't save that.");
  return j;
}

export const loadOnboarding = () => call("GET");
export const saveStep = (step: number, answers?: Answers) => call("PATCH", { step, ...(answers && Object.keys(answers).length ? { answers } : {}) });
export const finishOnboarding = (action: "complete" | "skip", answers?: Answers) => call("POST", { action, ...(answers && Object.keys(answers).length ? { answers } : {}) });
export const replayOnboarding = () => call("POST", { action: "replay" });
export const markProgress = (key: ProgressKey) => call("POST", { action: "progress", key });
