/**
 * Applying critic fixes. Each patch carries the exact text it replaces; if the file moved since the critique, the patch is
 * re-anchored by searching for that text near its old position (nearest occurrence wins). Overlapping patches are skipped,
 * never merged blindly. Pure.
 */
import type { Finding, Patch } from "./types";

export type ApplyResult = { files: Record<string, string>; applied: string[]; skipped: { id: string; reason: string }[] };

function nearest(src: string, needle: string, near: number): number {
  let best = -1;
  for (let i = src.indexOf(needle); i >= 0; i = src.indexOf(needle, i + 1)) if (best < 0 || Math.abs(i - near) < Math.abs(best - near)) best = i;
  return best;
}

/** Where the patch applies in the current text: in place if unchanged, else by its context (both sides, then one side, then the text alone if distinctive). */
function anchor(src: string, p: Patch): Patch | null {
  const pre = p.pre ?? "";
  const post = p.post ?? "";
  if (p.end <= src.length && src.slice(p.start, p.end) === p.expect && src.slice(Math.max(0, p.start - pre.length), p.start) === pre && src.slice(p.end, p.end + post.length) === post) return p;
  const tries: [string, number][] = [[pre + p.expect + post, pre.length], [pre.slice(-12) + p.expect + post.slice(0, 12), Math.min(12, pre.length)]];
  if (pre.length >= 8) tries.push([pre + p.expect, pre.length]);
  if (post.length >= 8) tries.push([p.expect + post, 0]);
  if (p.expect.length >= 8) tries.push([p.expect, 0]);
  for (const [needle, off] of tries) {
    if (!needle) continue;
    const i = nearest(src, needle, p.start - off);
    if (i >= 0) return { ...p, start: i + off, end: i + off + p.expect.length };
  }
  return null;
}

export function applyFindings(files: Record<string, string>, findings: Finding[]): ApplyResult {
  const out = { ...files };
  const applied: string[] = [];
  const skipped: { id: string; reason: string }[] = [];
  // resolve every patch against the current text first, per file
  const byFile = new Map<string, { f: Finding; p: Patch }[]>();
  for (const f of findings) {
    if (!f.patch?.length) { skipped.push({ id: f.id, reason: "No automatic fix for this one." }); continue; }
    const resolved: { f: Finding; p: Patch }[] = [];
    let ok = true;
    for (const p of f.patch) {
      const src = out[p.file];
      if (src === undefined) { ok = false; break; }
      const a = anchor(src, p);
      if (!a) { ok = false; break; }
      resolved.push({ f, p: a });
    }
    if (!ok) { skipped.push({ id: f.id, reason: "The code changed since this was found. Re-run the critic." }); continue; }
    // reject if it overlaps a patch already accepted
    const clash = resolved.some(({ p }) => (byFile.get(p.file) ?? []).some((x) => p.start < x.p.end && x.p.start < p.end || (p.start === p.end && x.p.start === x.p.end && p.start === x.p.start && p.replace === x.p.replace)));
    if (clash) { skipped.push({ id: f.id, reason: "Overlaps another fix in this batch; apply it after." }); continue; }
    for (const r of resolved) byFile.set(r.p.file, [...(byFile.get(r.p.file) ?? []), r]);
    applied.push(f.id);
  }
  for (const [file, list] of byFile) {
    let src = out[file];
    for (const { p } of [...list].sort((a, b) => b.p.start - a.p.start || b.p.end - a.p.end)) src = src.slice(0, p.start) + p.replace + src.slice(p.end);
    out[file] = src;
  }
  return { files: out, applied, skipped };
}
