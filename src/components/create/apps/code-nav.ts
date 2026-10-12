/** Pure helpers for the code views (FileFinder.tsx, LiveCode.tsx): file matching and the build checklist. No imports, testable. */

/** Lower is better; null when the query is not a subsequence of the path ("pgfd" matches pages/feed.js). */
export function matchScore(path: string, query: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const p = path.toLowerCase();
  const nameStart = p.lastIndexOf("/") + 1;
  let at = -1;
  let first = -1;
  let gaps = 0;
  for (const ch of q) {
    const next = p.indexOf(ch, at + 1);
    if (next < 0) return null;
    if (first < 0) first = next;
    if (at >= 0) gaps += next - at - 1;
    at = next;
  }
  return gaps * 2 + first + (first >= nameStart ? 0 : 20) + p.length / 100;
}

/** Paths matching the query, best first (tight, early matches in the file name win), at most `limit`. */
export function rankPaths(paths: string[], query: string, limit = 50): string[] {
  return paths
    .map((p) => ({ p, sc: matchScore(p, query) }))
    .filter((x): x is { p: string; sc: number } => x.sc !== null)
    .sort((a, b) => a.sc - b.sc || a.p.localeCompare(b.p))
    .slice(0, limit)
    .map((x) => x.p);
}

/** Pipeline stages in order (src/lib/app-builder/pipeline.ts). "fix" only happens when the checks found problems. */
export const BUILD_ORDER = ["plan", "generate", "verify", "visual", "fix", "save", "done"] as const;
export type StepState = "done" | "active" | "todo";

/** Where a step stands for the stage the build is in. A finished build (or one shown after the fact) has every step done. */
export function stepState(step: string, stage: string, running: boolean): StepState {
  const cur = BUILD_ORDER.indexOf(stage as (typeof BUILD_ORDER)[number]);
  if (stage === "done" || (!running && cur < 0)) return "done";
  const at = BUILD_ORDER.indexOf(step as (typeof BUILD_ORDER)[number]);
  return at < cur ? "done" : at === cur ? "active" : "todo";
}

/** A planned screen counts as written once a file for it exists (pages/<first route segment>…; "/" is home or index). */
export function screenWritten(route: string, paths: string[]): boolean {
  const seg = route.replace(/^\/+/, "").split("/")[0]?.replace(/[:[\]]/g, "").toLowerCase() || "";
  const names = seg ? [seg] : ["home", "index"];
  return paths.some((p) => names.some((n) => p.toLowerCase().startsWith(`pages/${n}`)));
}
