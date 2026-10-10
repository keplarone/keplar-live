/**
 * Record notes: the browser's speech service transcribes a meeting or lecture as it happens; Keplar keeps only the text,
 * in this browser, and opens it as a side draft that the panel can turn into notes. No audio is uploaded to Keplar.
 */
export const RECORD_LIMITS = { maxMinutes: 120, maxChars: 60_000 } as const;

export type Segment = { atMs: number; text: string };

export const stamp = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const mm = String(m).padStart(2, "0"), ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

/** Adds a finished phrase, merging into the previous line when it came within 20 seconds, and keeps the total under the cap. */
export function addSegment(list: Segment[], atMs: number, text: string): Segment[] {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return list;
  const total = list.reduce((n, x) => n + x.text.length, 0);
  if (total + t.length > RECORD_LIMITS.maxChars) return list;
  const last = list[list.length - 1];
  if (last && atMs - last.atMs < 20_000 && last.text.length < 600) return [...list.slice(0, -1), { ...last, text: `${last.text} ${t}` }];
  return [...list, { atMs, text: t }];
}

export const NOTES_PROMPT = "Turn this transcript into clear notes: a one-line summary, key points, decisions, and action items with owners where named. Keep facts as said; mark anything unclear.";

export function recordingDraft(segments: Segment[], startedAt: Date, durationMs: number, locale?: string): { title: string; markdown: string } {
  const when = startedAt.toLocaleString(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const mins = Math.max(1, Math.round(durationMs / 60_000));
  return {
    title: `Recording, ${when}`,
    markdown: [
      `# Recording, ${when} (${mins} min)`,
      "",
      `To get notes, revise this draft with: "${NOTES_PROMPT}"`,
      "",
      "## Transcript",
      "",
      ...(segments.length ? segments.map((x) => `[${stamp(x.atMs)}] ${x.text}`) : ["(Nothing was transcribed.)"]),
    ].join("\n"),
  };
}
