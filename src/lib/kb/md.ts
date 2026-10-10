/**
 * A small, strict Markdown subset for the docs and blog content files (content/**.md).
 * Supported: ## / ### headings, paragraphs, - and 1. lists, > quotes, :::note|tip|warning callouts, ``` fenced code
 * (optional title="..."), pipe tables, --- rules, and inline `code`, **bold**, *italic*, [text](href). No raw HTML.
 * Pure functions (no React), so the build, the tests and the search index all read the same structure.
 */

export type Node =
  | { t: "h2" | "h3"; id: string; text: string }
  | { t: "p"; text: string }
  | { t: "ul" | "ol"; items: string[] }
  | { t: "code"; lang: string; title?: string; code: string }
  | { t: "table"; head: string[]; rows: string[][] }
  | { t: "quote"; text: string }
  | { t: "callout"; kind: "note" | "tip" | "warning"; text: string }
  | { t: "hr" };

export type Front = Record<string, string>;

export function parseFront(src: string): { front: Front; body: string } {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { front: {}, body: src };
  const front: Front = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) front[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return { front, body: m[2] };
}

export const slugify = (s: string) =>
  s.toLowerCase().replace(/`/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "section";

export function parseBlocks(body: string): Node[] {
  const lines = body.replace(/\r/g, "").split("\n");
  const out: Node[] = [];
  const used = new Map<string, number>();
  const uid = (text: string) => {
    const base = slugify(text);
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    return n ? `${base}-${n + 1}` : base;
  };
  let i = 0;
  const isBlank = (l: string) => l.trim() === "";
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }
    const fence = line.match(/^```(\w*)\s*(?:title="([^"]*)")?\s*$/);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) code.push(lines[i++]);
      i++;
      out.push({ t: "code", lang: fence[1] || "text", title: fence[2], code: code.join("\n") });
      continue;
    }
    const call = line.match(/^:::(note|tip|warning)\s*$/);
    if (call) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^:::\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push({ t: "callout", kind: call[1] as "note" | "tip" | "warning", text: buf.join(" ").replace(/\s+/g, " ").trim() });
      continue;
    }
    const h = line.match(/^(##|###) (.+)$/);
    if (h) { out.push({ t: h[1] === "##" ? "h2" : "h3", id: uid(h[2]), text: h[2].trim() }); i++; continue; }
    if (/^---+\s*$/.test(line)) { out.push({ t: "hr" }); i++; continue; }
    if (line.startsWith("|") && i + 1 < lines.length && /^\|\s*:?-{2,}/.test(lines[i + 1])) {
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(cells(lines[i++]));
      out.push({ t: "table", head, rows });
      continue;
    }
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      out.push({ t: "quote", text: buf.join(" ").trim() });
      continue;
    }
    const li = line.match(/^(-|\d+\.) (.*)$/);
    if (li) {
      const ordered = li[1] !== "-";
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(-|\d+\.) (.*)$/);
        if (m && (m[1] !== "-") === ordered) { items.push(m[2]); i++; }
        else if (/^\s{2,}\S/.test(lines[i]) && items.length) { items[items.length - 1] += " " + lines[i].trim(); i++; }
        else break;
      }
      out.push({ t: ordered ? "ol" : "ul", items });
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && !isBlank(lines[i]) && !/^(##|###) |^```|^:::|^\|.*\|\s*$|^>\s?|^(-|\d+\.) /.test(lines[i])) buf.push(lines[i++].trim());
    if (!buf.length) { buf.push(lines[i++].trim()); }
    out.push({ t: "p", text: buf.join(" ") });
  }
  return out;
}

/** Inline tokens, shared by the renderer and the plain-text extractor. */
export type Inline = { k: "text" | "code" | "b" | "i"; v: string } | { k: "a"; v: string; href: string };
const INLINE = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|(?<![\w*])\*([^*\s][^*]*)\*(?![\w*])/g;
export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of s.matchAll(INLINE)) {
    if (m.index! > last) out.push({ k: "text", v: s.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ k: "code", v: m[1] });
    else if (m[2] !== undefined) out.push({ k: "a", v: m[2], href: m[3] });
    else if (m[4] !== undefined) out.push({ k: "b", v: m[4] });
    else out.push({ k: "i", v: m[5] });
    last = m.index! + m[0].length;
  }
  if (last < s.length) out.push({ k: "text", v: s.slice(last) });
  return out;
}

export const plain = (s: string) => parseInline(s).map((t) => t.v).join("");

/** All text of a document (for word counts, duplicate checks and search). Code blocks are excluded from prose counts. */
export function nodesToText(nodes: Node[], opts: { code?: boolean } = {}): string {
  const parts: string[] = [];
  for (const n of nodes) {
    if (n.t === "h2" || n.t === "h3") parts.push(n.text);
    else if (n.t === "p" || n.t === "quote" || n.t === "callout") parts.push(plain(n.text));
    else if (n.t === "ul" || n.t === "ol") n.items.forEach((x) => parts.push(plain(x)));
    else if (n.t === "table") [n.head, ...n.rows].forEach((r) => r.forEach((c) => parts.push(plain(c))));
    else if (n.t === "code" && opts.code) parts.push(n.code);
  }
  return parts.join("\n");
}

export const wordCount = (s: string) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

/** Every internal link target in a node list (paths starting with "/"), without hash or query. */
export function internalLinks(nodes: Node[]): string[] {
  const texts: string[] = [];
  for (const n of nodes) {
    if (n.t === "p" || n.t === "quote" || n.t === "callout") texts.push(n.text);
    else if (n.t === "ul" || n.t === "ol") texts.push(...n.items);
    else if (n.t === "table") [n.head, ...n.rows].forEach((r) => texts.push(...r));
  }
  const links: string[] = [];
  for (const t of texts) for (const x of parseInline(t)) if (x.k === "a" && x.href.startsWith("/")) links.push(x.href.split("#")[0].split("?")[0] || "/");
  return links;
}
