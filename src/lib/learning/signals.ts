/** Client-safe helpers for feedback signals (no server imports). */

/** Detects a follow-up that says the previous answer was wrong ("no, that's wrong", "that's not what I asked"). Conservative. */
export function looksLikeCorrection(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length < 3 || t.length > 400) return false;
  return /^(no[,.!]|nope\b|wrong\b|incorrect\b|that'?s (?:not right|wrong|incorrect|not what i (?:asked|meant|wanted))|not what i (?:asked|meant|wanted)|you (?:got (?:it|that) wrong|misunderstood|missed)|actually[, ])/.test(t);
}

/** Fire-and-forget: tell Keplar what the person did with an answer. Never throws, never blocks the UI. */
export function sendSignal(answerId: string | undefined, kind: "up" | "down" | "regenerate" | "copy" | "correct", text?: string): void {
  if (!answerId || typeof fetch !== "function") return;
  try {
    void fetch("/api/learning/signal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answerId, kind, ...(text ? { text: text.slice(0, 600) } : {}) }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* feedback is optional */
  }
}
