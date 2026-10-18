/**
 * Parse, ground, and stream the optional ```keplar-ui block.
 *
 * The validator is hand-rolled (zod is not a project dependency; see src/lib/inquire/schema.ts).
 * A missing, partial, or invalid block leaves the markdown and adds nothing.
 * Scores, stats, citations, years, and "as of" dates are kept only when the same
 * text is in the model responses. Per-item splits quote those responses and appear
 * only when the sentences actually differ.
 */
import type { AgreementCounts, RankedItem, RichAnswer, RichBlock, RichSplit } from "./types";

export const RICH_PENDING = "\n\n```keplar-ui\n";

const CLOSED = /```[ \t]*keplar-ui[ \t]*\r?\n([\s\S]*?)```/i;
const OPEN = /```[ \t]*keplar-ui\b/i;
const FENCE_HEAD = "```keplar-ui";

const SUBJECTIVE = "This order is a judgment, and it changes.";
const AS_OF = /\bas of\b[^.]{0,48}/gi;

const line = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

const list = (v: unknown, max: number, itemMax: number) =>
  (Array.isArray(v) ? v : []).map((x) => line(x, itemMax)).filter(Boolean).slice(0, max);

/** Pull a closed fence out of an answer. An opening fence with no close is dropped from the prose (the JSON is not shown). */
export function takeRichFence(markdown: string): { prose: string; raw: string | null; pending: boolean } {
  const m = CLOSED.exec(markdown);
  if (m && m.index !== undefined) {
    const prose = `${markdown.slice(0, m.index)}${markdown.slice(m.index + m[0].length)}`.replace(/\n{3,}/g, "\n\n").trim();
    return { prose, raw: m[1].trim(), pending: false };
  }
  const open = OPEN.exec(markdown);
  if (open && open.index !== undefined) return { prose: markdown.slice(0, open.index).trim(), raw: null, pending: true };
  return { prose: markdown, raw: null, pending: false };
}

/**
 * While the answer is still streaming: hide a finished or half-typed keplar-ui fence and say when a skeleton should show.
 * A closed, valid fence can render immediately. Anything else that looks like the fence stays a skeleton, never raw JSON.
 */
export function streamView(source: string): { prose: string; pending: boolean; data: RichAnswer | null } {
  const taken = takeRichFence(source);
  if (taken.raw) {
    const data = parseRich(taken.raw);
    return data ? { prose: taken.prose, pending: false, data } : { prose: taken.prose, pending: false, data: null };
  }
  if (taken.pending) return { prose: taken.prose, pending: true, data: null };
  const lines = source.split("\n");
  const last = (lines[lines.length - 1] ?? "").trim();
  // ```ke… only. A shorter prefix would also match a code fence that is still being typed (```kotlin).
  if (last.length >= 5 && FENCE_HEAD.startsWith(last)) {
    return { prose: lines.slice(0, -1).join("\n").trimEnd(), pending: true, data: null };
  }
  return { prose: source, pending: false, data: null };
}

function extractJson(raw: string): unknown {
  const obj = raw.indexOf("{");
  const arr = raw.indexOf("[");
  const i = obj < 0 ? arr : arr < 0 ? obj : Math.min(obj, arr);
  if (i < 0) return null;
  const open = raw[i];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let str = false;
  let esc = false;
  for (let k = i; k < raw.length; k++) {
    const c = raw[k];
    if (str) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') str = false;
      continue;
    }
    if (c === '"') str = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        const slice = raw.slice(i, k + 1);
        try {
          return JSON.parse(slice);
        } catch {
          try {
            return JSON.parse(slice.replace(/,\s*([}\]])/g, "$1"));
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

const KINDS: Record<string, RichBlock["type"]> = {
  ranked: "ranked",
  rankedlist: "ranked",
  compare: "compare",
  comparison: "compare",
  comparisontable: "compare",
  cards: "cards",
  timeline: "timeline",
  steps: "steps",
  proscons: "proscons",
  stats: "stats",
  statrow: "stats",
  callout: "callout",
  sources: "sources",
};

function kindOf(v: unknown): RichBlock["type"] | null {
  const k = line(v && typeof v === "object" ? (v as { type?: unknown }).type : "", 40).toLowerCase().replace(/[^a-z]/g, "");
  return KINDS[k] ?? null;
}

function domainOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function blockFrom(v: unknown): RichBlock | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const type = kindOf(o);
  if (!type) return null;
  const title = line(o.title, 80) || undefined;
  if (type === "ranked") {
    const items: RankedItem[] = [];
    for (const it of Array.isArray(o.items) ? o.items.slice(0, 8) : []) {
      if (!it || typeof it !== "object") continue;
      const r = it as Record<string, unknown>;
      const name = line(r.name, 80);
      const why = line(r.why, 220);
      if (!name || !why) continue;
      const rank = Number(r.rank);
      items.push({
        rank: Number.isInteger(rank) && rank > 0 && rank < 100 ? rank : items.length + 1,
        name,
        ...(line(r.maker, 60) ? { maker: line(r.maker, 60) } : {}),
        why,
        tags: list(r.tags, 3, 24),
        ...(line(r.score, 24) ? { score: line(r.score, 24) } : {}),
      });
    }
    if (!items.length) return null;
    return { type, ...(title ? { title } : {}), note: line(o.note, 180), items };
  }
  if (type === "compare") {
    const columns = list(o.columns, 6, 40);
    if (columns.length < 2) return null;
    const rows = (Array.isArray(o.rows) ? o.rows : [])
      .slice(0, 8)
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const r = row as Record<string, unknown>;
        const label = line(r.label, 40);
        const cells = list(r.cells, columns.length, 160);
        if (!label || cells.length !== columns.length) return null;
        return { label, cells };
      })
      .filter((x): x is { label: string; cells: string[] } => Boolean(x));
    if (!rows.length) return null;
    return { type, ...(title ? { title } : {}), columns, rows };
  }
  if (type === "cards") {
    const items = (Array.isArray(o.items) ? o.items : [])
      .slice(0, 8)
      .map((it) => {
        if (!it || typeof it !== "object") return null;
        const r = it as Record<string, unknown>;
        const t = line(r.title, 80);
        const body = line(r.body, 220);
        if (!t || !body) return null;
        const tag = line(r.tag, 24);
        return { title: t, body, ...(tag ? { tag } : {}) };
      })
      .filter((x): x is { title: string; body: string; tag?: string } => Boolean(x));
    if (!items.length) return null;
    return { type, ...(title ? { title } : {}), items };
  }
  if (type === "timeline" || type === "steps") {
    const items = (Array.isArray(o.items) ? o.items : [])
      .slice(0, 8)
      .map((it) => {
        if (!it || typeof it !== "object") return null;
        const r = it as Record<string, unknown>;
        const t = line(type === "timeline" ? r.title : r.title, 80);
        const body = line(r.body, 220);
        if (type === "steps") return t && body ? { title: t, body } : null;
        const when = line(r.when, 40);
        if (!when || !t) return null;
        return { when, title: t, ...(body ? { body } : {}) };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    if (!items.length) return null;
    return type === "steps"
      ? { type, ...(title ? { title } : {}), items: items as { title: string; body: string }[] }
      : { type, ...(title ? { title } : {}), items: items as { when: string; title: string; body?: string }[] };
  }
  if (type === "proscons") {
    const pros = list(o.pros, 6, 160);
    const cons = list(o.cons, 6, 160);
    if (!pros.length && !cons.length) return null;
    return { type, ...(title ? { title } : {}), pros, cons };
  }
  if (type === "stats") {
    const items = (Array.isArray(o.items) ? o.items : [])
      .slice(0, 6)
      .map((it) => {
        if (!it || typeof it !== "object") return null;
        const r = it as Record<string, unknown>;
        const label = line(r.label, 40);
        const value = line(r.value, 24);
        if (!label || !value) return null;
        const note = line(r.note, 80);
        return { label, value, ...(note ? { note } : {}) };
      })
      .filter((x): x is { label: string; value: string; note?: string } => Boolean(x));
    if (!items.length) return null;
    return { type, ...(title ? { title } : {}), items };
  }
  if (type === "callout") {
    const text = line(o.text, 320);
    return text ? { type, text } : null;
  }
  const items = (Array.isArray(o.items) ? o.items : [])
    .slice(0, 8)
    .map((it) => {
      if (!it || typeof it !== "object") return null;
      const r = it as Record<string, unknown>;
      const url = line(r.url, 300);
      const domain = domainOf(url);
      if (!domain) return null;
      return { title: line(r.title, 80) || domain, url, domain };
    })
    .filter((x): x is { title: string; url: string; domain: string } => Boolean(x));
  return items.length ? { type: "sources", items } : null;
}

/** Schema check only. Grounding (real numbers, URLs, splits) is `buildRich`. */
export function parseRich(raw: string): RichAnswer | null {
  const json = extractJson(raw);
  const blocksIn = Array.isArray(json) ? json : json && typeof json === "object" && Array.isArray((json as { blocks?: unknown }).blocks) ? (json as { blocks: unknown[] }).blocks : null;
  if (!blocksIn) return null;
  const blocks = blocksIn.slice(0, 6).map(blockFrom).filter((b): b is RichBlock => Boolean(b));
  return blocks.length ? { blocks } : null;
}

const numIn = (value: string, material: string) => {
  const nums = value.match(/\d+(?:\.\d+)?/g);
  return Boolean(nums?.length) && nums!.every((n) => material.includes(n));
};

const mentioned = (text: string, name: string) => {
  const s = text.toLowerCase();
  const n = name.toLowerCase().trim();
  if (n.length >= 3 && s.includes(n)) return true;
  const squashed = n.replace(/[^a-z0-9]/g, "");
  return squashed.length >= 4 && s.replace(/[^a-z0-9]/g, "").includes(squashed);
};

function scrubDates(text: string, material: string): string {
  const low = material.toLowerCase();
  return text
    .replace(AS_OF, (phrase) => (low.includes(phrase.toLowerCase()) ? phrase : ""))
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim();
}

function groundBlock(block: RichBlock, material: string): RichBlock | null {
  if (block.type === "stats") {
    const items = block.items.filter((it) => numIn(it.value, material));
    return items.length ? { ...block, items } : null;
  }
  if (block.type === "sources") {
    const items = block.items.filter((it) => material.includes(it.url));
    return items.length ? { ...block, items } : null;
  }
  if (block.type === "ranked") {
    const items = block.items
      .filter((it) => mentioned(material, it.name))
      .map((it) => {
        const tags = it.tags.filter((t) => mentioned(material, t));
        const maker = it.maker && mentioned(material, it.maker) ? it.maker : undefined;
        const score = it.score && numIn(it.score, material) ? it.score : undefined;
        return { ...it, tags, ...(maker ? { maker } : { maker: undefined }), ...(score ? { score } : { score: undefined }) };
      })
      .map(({ maker, score, ...rest }) => ({ ...rest, ...(maker ? { maker } : {}), ...(score ? { score } : {}) }));
    if (!items.length) return null;
    const note = scrubDates(block.note, material);
    const judged = /judgment|subjective|opinion|change/i.test(note);
    return { ...block, items, note: judged ? note : note ? `${note} ${SUBJECTIVE}` : SUBJECTIVE };
  }
  if (block.type === "timeline") {
    const items = block.items.filter((it) => {
      const years = it.when.match(/\b(?:1|2)\d{3}\b/g) ?? [];
      return years.every((y) => material.includes(y));
    });
    return items.length ? { ...block, items } : null;
  }
  if (block.type === "callout") {
    const text = scrubDates(block.text, material);
    return text ? { ...block, text } : null;
  }
  return block;
}

const clip = (s: string) => (s.length > 220 ? `${s.slice(0, 217).trim()}…` : s);

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 24 && s.length <= 320);
}

function excerpt(text: string, name: string): string | null {
  const hit = sentences(text).find((s) => mentioned(s, name));
  if (hit) return clip(hit);
  const low = text.toLowerCase();
  const n = name.toLowerCase();
  const at = low.indexOf(n);
  if (at < 0) return null;
  const start = Math.max(0, text.lastIndexOf(" ", Math.max(0, at - 70)));
  const endAt = text.indexOf(" ", at + n.length + 90);
  return clip(text.slice(start, endAt < 0 ? at + n.length + 120 : endAt).trim());
}

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 1;
}

function differs(voices: RichSplit[]): boolean {
  const sets = voices.map((v) => tokens(v.said));
  for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) if (jaccard(sets[i]!, sets[j]!) < 0.62) return true;
  return false;
}

function withSplits(block: RichBlock, responses: { name: string; text: string }[], disagreed: boolean): RichBlock {
  if (block.type !== "ranked" || !disagreed) return block;
  const items = block.items.map((it) => {
    const split = responses
      .map((r) => {
        const said = excerpt(r.text, it.name);
        return said ? { model: r.name, said } : null;
      })
      .filter((x): x is RichSplit => Boolean(x))
      .slice(0, 4);
    if (split.length < 2 || !differs(split)) return it;
    return { ...it, split };
  });
  return { ...block, items };
}

/**
 * Validate the fence, drop anything not grounded in the responses, and attach real per-item quotes
 * when the comparison found more than one position and the sentences differ.
 */
export function buildRich(
  raw: string | null,
  ctx: { responses: { name: string; text: string }[]; material?: string; disagreed: boolean },
): RichAnswer | undefined {
  if (!raw) return undefined;
  const parsed = parseRich(raw);
  if (!parsed) return undefined;
  const material = ctx.material ?? ctx.responses.map((r) => r.text).join("\n");
  const blocks = parsed.blocks
    .map((b) => groundBlock(b, material))
    .filter((b): b is RichBlock => Boolean(b))
    .map((b) => withSplits(b, ctx.responses, ctx.disagreed));
  return blocks.length ? { blocks } : undefined;
}

/** Compact agreement line. Returns "" unless the comparator actually scored more than one model. */
export function agreementLine(c: AgreementCounts | undefined): string {
  if (!c) return "";
  if (c.level !== "consensus" && c.level !== "partial" && c.level !== "none") return "";
  if (c.agree + c.disagree < 1) return "";
  return c.summary.trim();
}
