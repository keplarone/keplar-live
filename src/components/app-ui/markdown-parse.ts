/**
 * The block grammar of the answer renderer (Markdown.tsx), kept free of React and CSS so it can be tested on its own: headings,
 * paragraphs, lists (with one level of nesting), block quotes, rules, tables and fenced code. Partial input (a stream) is fine.
 */
import { joinLines } from "@/lib/md-lines";

export type Block =
  | { t: "h"; level: number; text: string }
  | { t: "p"; text: string }
  | { t: "ul" | "ol"; items: ListItem[]; start?: number }
  | { t: "quote"; text: string }
  | { t: "hr" }
  | { t: "code"; lang: string; code: string; open: boolean }
  | { t: "table"; head: string[]; align: ("left" | "right" | "center" | null)[]; rows: string[][] };

/** A list item and the indented items under it (one level: models rarely nest deeper, and deeper lines join this level). */
export type ListItem = { text: string; sub: { ordered: boolean; items: string[] } | null };

const BULLET = /^\s*[-*+]\s+/;
const NUMBERED = /^\s*(\d+)[.)]\s+/;
const INDENTED = /^(\s{2,}|\t)/;
/** A table's separator row: "---|:---:" with or without the outer pipes. */
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const FENCE = /^\s*(`{3,}|~{3,})\s*([\w+-]*)/;

/**
 * A run of list items of one kind. Blank lines between items don't end the list (models often write "1. …\n\n2. …", which used to
 * restart at 1 every time); indented bullets or numbers become the item's sub-list and indented text continues the item.
 */
function parseList(lines: string[], from: number, ordered: boolean): { items: ListItem[]; start?: number; next: number } {
  const own = ordered ? NUMBERED : BULLET;
  const items: ListItem[] = [];
  const start = ordered ? Number(lines[from].match(NUMBERED)?.[1] ?? 1) : undefined;
  let i = from;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      if (j < lines.length && (own.test(lines[j]) && !INDENTED.test(lines[j]) || (items.length && INDENTED.test(lines[j]) && (BULLET.test(lines[j]) || NUMBERED.test(lines[j]))))) { i = j; continue; }
      break;
    }
    const last = items[items.length - 1];
    if (last && INDENTED.test(line) && (BULLET.test(line) || NUMBERED.test(line))) {
      const subOrdered = !BULLET.test(line);
      last.sub ??= { ordered: subOrdered, items: [] };
      last.sub.items.push(line.replace(subOrdered ? NUMBERED : BULLET, ""));
      i++;
      continue;
    }
    if (own.test(line)) { items.push({ text: line.replace(own, ""), sub: null }); i++; continue; }
    if (last && INDENTED.test(line)) {
      if (last.sub) last.sub.items[last.sub.items.length - 1] += ` ${line.trim()}`;
      else last.text += ` ${line.trim()}`;
      i++;
      continue;
    }
    break;
  }
  return { items, start: start !== undefined && start !== 1 ? start : undefined, next: i };
}

const splitRow = (line: string) =>
  line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

export function parse(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const fence = line.match(FENCE);
    if (fence) {
      // Closed by the same character, at least as many times (``` or ~~~; a ```` fence can hold ``` lines).
      const mark = fence[1];
      const close = new RegExp(`^\\s*${mark[0] === "`" ? "`" : "~"}{${mark.length},}\\s*$`);
      const body: string[] = [];
      i++;
      while (i < lines.length && !close.test(lines[i])) body.push(lines[i++]);
      const open = i >= lines.length;
      i++;
      out.push({ t: "code", lang: fence[2] || "", code: body.join("\n"), open });
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { out.push({ t: "h", level: h[1].length, text: h[2] }); i++; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { out.push({ t: "hr" }); i++; continue; }

    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && (/^\s*\|/.test(line) || lines[i + 1].includes("|"))) {
      const head = splitRow(line);
      const align = splitRow(lines[i + 1]).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : c.startsWith(":") ? "left" : null));
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) rows.push(splitRow(lines[i++]));
      out.push({ t: "table", head, align, rows });
      continue;
    }
    if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = !BULLET.test(line);
      const l = parseList(lines, i, ordered);
      i = l.next;
      out.push({ t: ordered ? "ol" : "ul", items: l.items, ...(l.start !== undefined ? { start: l.start } : {}) });
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push({ t: "quote", text: joinLines(body) });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*```|\s*~~~|\s*[-*+]\s+|\s*\d+[.)]\s+|\s*>|\s*\|)/.test(lines[i]) && !(i + 1 < lines.length && lines[i].includes("|") && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes("|"))) para.push(lines[i++]);
    if (!para.length) para.push(lines[i++]);
    out.push({ t: "p", text: joinLines(para) });
  }
  return out;
}
