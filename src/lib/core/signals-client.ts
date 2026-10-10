/** Client-safe helpers for Core's outcome signals (no server imports). */

/** Follow-up messages that say the last answer was hard to follow. Conservative. */
export function looksConfused(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length < 3 || t.length > 200) return false;
  return /^(i (?:don'?t|do not) (?:understand|get it|follow)|what do you mean|huh\b|i'?m (?:confused|lost)|(?:can|could) you (?:explain|say) (?:that|it|this) (?:again|more simply|simpler|in simpler)|explain (?:it |that )?(?:like i'?m|simpler|more simply)|too (?:complicated|technical|long)|eli5)/.test(t);
}

/** The person re-asked nearly the same question in other words (the answer probably missed). Word-set overlap, 60%+. */
export function looksRephrased(previous: string | undefined, text: string): boolean {
  if (!previous) return false;
  const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
  const a = words(previous), b = words(text);
  if (a.size < 4 || b.size < 4 || previous.trim() === text.trim()) return false;
  let both = 0;
  for (const w of a) if (b.has(w)) both++;
  return both / (a.size + b.size - both) >= 0.6;
}

/** Fire-and-forget: confusion, an edited question or a finished task. Thumbs, copy, regenerate and corrections already go through /api/learning/signal. */
export function sendCoreSignal(answerId: string | undefined, kind: "confused" | "edit" | "complete"): void {
  if (!answerId || typeof fetch !== "function") return;
  try {
    void fetch("/api/core/signal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answerId, kind }), keepalive: true }).catch(() => undefined);
  } catch {
    /* optional */
  }
}
