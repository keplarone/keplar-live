/** Immutable "I want " prefix for the Keplar Wants composer. Pure: no DOM. */
export const PREFIX = "I want "; // 7 chars, indices 0..6
export const P = PREFIX.length;

/** Normalise any candidate value so it always begins with the exact prefix. */
export function enforcePrefix(next: string, prev: string): string {
  if (next.startsWith(PREFIX)) return next;
  if (!prev.startsWith(PREFIX)) prev = PREFIX;
  // Diff prev->next: deleted range [s, prev.length-e), inserted text in between.
  let s = 0;
  while (s < next.length && s < prev.length && next[s] === prev[s]) s++;
  let e = 0;
  while (e < next.length - s && e < prev.length - s && next[next.length - 1 - e] === prev[prev.length - 1 - e]) e++;
  const inserted = next.slice(s, next.length - e);
  // Any edit that touched indices 0..P-1 is clamped so the prefix survives intact.
  return prev.slice(0, Math.max(s, P)) + inserted + prev.slice(Math.max(prev.length - e, P));
}

export const clampCaret = (n: number) => Math.max(P, n);

export function appendTranscript(value: string, transcript: string): string {
  const body = value.slice(P).trimEnd();
  const t = transcript.trim();
  if (!t) return value;
  return PREFIX + (body ? body + " " : "") + t;
}
