/**
 * The shared document of a live Create session (Yjs CRDT). Isomorphic: the server seeds and reads it, every browser edits it.
 *
 *   files : Y.Map<path, Y.Text>   the creation's source files, character-level CRDT (concurrent edits merge without conflicts)
 *   term  : Y.Array<TermLine>      the shared terminal: every command anyone runs and its output, seen by everyone live
 *   meta  : Y.Map                  base version the session started from, last save
 *
 * Seeding is deterministic (fixed client id, sorted paths), so two servers that seed the same room at the same moment produce
 * byte-identical updates and Yjs applies the second as a no-op: a race can never duplicate a file.
 */
import * as Y from "yjs";

export const SEED_CLIENT = 1;
export const FILES = "files";
export const TERM = "term";
export const META = "meta";
export const TERM_KEEP = 400;

export type TermKind = "cmd" | "out" | "ok" | "warn" | "err" | "sys";
export type TermLine = { id: string; at: number; by: string; color: string; kind: TermKind; text: string };

export const filesOf = (doc: Y.Doc) => doc.getMap<Y.Text>(FILES);
export const termOf = (doc: Y.Doc) => doc.getArray<TermLine>(TERM);
export const metaOf = (doc: Y.Doc) => doc.getMap<unknown>(META);

/** A full-state update holding `files` at `base`. Same input, same bytes. */
export function seedUpdate(files: Record<string, string>, base: number): Uint8Array {
  const doc = new Y.Doc({ gc: true });
  doc.clientID = SEED_CLIENT;
  doc.transact(() => {
    const map = filesOf(doc);
    for (const path of Object.keys(files).sort()) {
      const t = new Y.Text();
      map.set(path, t);
      t.insert(0, files[path]);
    }
    metaOf(doc).set("base", base);
  });
  const u = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return u;
}

export function docFiles(doc: Y.Doc): Record<string, string> {
  const out: Record<string, string> = {};
  filesOf(doc).forEach((t, path) => {
    out[path] = t.toString();
  });
  return out;
}

export function docFromUpdates(updates: Uint8Array[]): Y.Doc {
  const doc = new Y.Doc({ gc: true });
  if (updates.length) Y.applyUpdate(doc, updates.length === 1 ? updates[0] : Y.mergeUpdates(updates));
  return doc;
}

/** Minimal single-span edit turning `a` into `b` (common prefix and suffix kept), so concurrent cursors elsewhere stay put. */
export function spanDiff(a: string, b: string): { at: number; del: number; ins: string } | null {
  if (a === b) return null;
  let p = 0;
  const max = Math.min(a.length, b.length);
  while (p < max && a.charCodeAt(p) === b.charCodeAt(p)) p++;
  let s = 0;
  while (s < max - p && a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)) s++;
  return { at: p, del: a.length - p - s, ins: b.slice(p, b.length - s) };
}

/**
 * Brings the live doc to `files` with the smallest edits (a new version made outside the session: an AI refine, a critic fix,
 * a restore). Files missing from `files` are removed, new ones added. Returns the paths that changed.
 */
export function applyFiles(doc: Y.Doc, files: Record<string, string>, origin: unknown = "sync"): string[] {
  const changed: string[] = [];
  doc.transact(() => {
    const map = filesOf(doc);
    for (const path of [...map.keys()]) if (!(path in files)) { map.delete(path); changed.push(path); }
    for (const path of Object.keys(files).sort()) {
      const cur = map.get(path);
      if (!cur) {
        const t = new Y.Text();
        map.set(path, t);
        t.insert(0, files[path]);
        changed.push(path);
        continue;
      }
      const d = spanDiff(cur.toString(), files[path]);
      if (!d) continue;
      if (d.del) cur.delete(d.at, d.del);
      if (d.ins) cur.insert(d.at, d.ins);
      changed.push(path);
    }
  }, origin);
  return changed;
}

export function pushTerm(doc: Y.Doc, lines: Omit<TermLine, "id" | "at">[], origin: unknown = "local") {
  const arr = termOf(doc);
  doc.transact(() => {
    arr.push(lines.map((l) => ({ ...l, id: Math.random().toString(36).slice(2, 10), at: Date.now() })));
    if (arr.length > TERM_KEEP) arr.delete(0, arr.length - TERM_KEEP);
  }, origin);
}

/** Line-level change counts between two file sets (for "what changed in this session"). */
export function changeStats(before: Record<string, string>, after: Record<string, string>) {
  const out: { path: string; added: number; removed: number; status: "added" | "removed" | "modified" }[] = [];
  for (const path of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[path];
    const b = after[path];
    if (a === b) continue;
    if (a === undefined) { out.push({ path, added: b.split("\n").length, removed: 0, status: "added" }); continue; }
    if (b === undefined) { out.push({ path, added: 0, removed: a.split("\n").length, status: "removed" }); continue; }
    const al = a.split("\n");
    const bl = b.split("\n");
    let p = 0;
    while (p < al.length && p < bl.length && al[p] === bl[p]) p++;
    let s = 0;
    while (s < al.length - p && s < bl.length - p && al[al.length - 1 - s] === bl[bl.length - 1 - s]) s++;
    out.push({ path, added: bl.length - p - s, removed: al.length - p - s, status: "modified" });
  }
  return out.sort((x, y) => x.path.localeCompare(y.path));
}

export const toB64 = (u: Uint8Array): string => {
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
export const fromB64 = (b: string): Uint8Array => {
  const s = atob(b);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
};

/** Cheap content fingerprint (FNV-1a over UTF-16 units + length), used to mark files changed since the base version. */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `${(h >>> 0).toString(36)}.${text.length.toString(36)}`;
}
