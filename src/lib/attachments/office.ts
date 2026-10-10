/**
 * Word (.docx), PowerPoint (.pptx) and Excel (.xlsx) readers (server only), on top of the defensive ZIP reader.
 * Output is plain text with light markdown structure (headings, lists, tables) so models can cite "slide 4" or "Sheet2".
 */
import { attr, decodeEntities, elements, texts } from "./xml";
import { listZip, readText, type ZipEntry, type ZipLimits } from "./zip";

export type OfficeLimits = ZipLimits & { maxChars: number; maxRows: number };

export type SheetTable = { name: string; rows: (string | number | null)[][]; truncated: boolean };

const docTitle = (buf: Uint8Array, entries: ZipEntry[]) => {
  const core = readText(buf, entries, "docProps/core.xml", 200_000);
  const t = core ? texts(core, "dc:title").trim() : "";
  return t || undefined;
};

/* ───────────────────────── DOCX ───────────────────────── */

function docxParagraph(p: string): string {
  const style = /<w:pStyle\s+w:val="([^"]+)"/.exec(p)?.[1] ?? "";
  let txt = "";
  // Runs in document order: text, tabs and breaks.
  const rx = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>|<w:cr\/>/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(p))) txt += m[1] !== undefined ? decodeEntities(m[1]) : m[0] === "<w:tab/>" ? "\t" : "\n";
  txt = txt.replace(/[ \t]+$/g, "");
  if (!txt.trim()) return "";
  const h = /^(?:Heading|heading|berschrift|Titre)\s?(\d)/.exec(style);
  if (style === "Title") return `# ${txt.trim()}`;
  if (style === "Subtitle") return `_${txt.trim()}_`;
  if (h) return `${"#".repeat(Math.min(6, Number(h[1]) + 1))} ${txt.trim()}`;
  if (/<w:numPr>/.test(p) || /List/i.test(style)) return `- ${txt.trim()}`;
  return txt;
}

function docxTable(tbl: string): string {
  const rows: string[][] = [];
  for (const tr of elements(tbl, "w:tr")) {
    const cells: string[] = [];
    for (const tc of elements(tr.inner, "w:tc")) {
      const paras = [...elements(tc.inner, "w:p")].map((p) => docxParagraph(`<w:p>${p.inner}</w:p>`).replace(/^[-#]+\s/, "")).filter(Boolean);
      cells.push(paras.join(" ").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim());
    }
    if (cells.length) rows.push(cells);
    if (rows.length > 200) break;
  }
  if (!rows.length) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? "").join(" | ")} |`;
  return [line(rows[0]), `|${" --- |".repeat(width)}`, ...rows.slice(1).map(line)].join("\n");
}

export function readDocx(buf: Uint8Array, limits: OfficeLimits): { title?: string; text: string; truncated: boolean; paragraphs: number; tables: number } {
  const entries = listZip(buf, limits);
  const xml = readText(buf, entries, "word/document.xml", limits.maxEntryBytes);
  if (!xml) throw new Error("docx: no document.xml");
  const body = /<w:body>([\s\S]*)<\/w:body>/.exec(xml)?.[1] ?? xml;
  const out: string[] = [];
  let len = 0, paragraphs = 0, tables = 0, truncated = false;
  const rx = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[\s>][\s\S]*?<\/w:p>|<w:p\/>/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(body))) {
    const block = m[0].startsWith("<w:tbl") ? docxTable(m[0]) : docxParagraph(m[0]);
    if (!block) continue;
    if (m[0].startsWith("<w:tbl")) tables++; else paragraphs++;
    if (len + block.length > limits.maxChars) { truncated = true; break; }
    out.push(block);
    len += block.length + 2;
  }
  // Footnotes and comments carry real content in many documents.
  for (const [file, label] of [["word/footnotes.xml", "Footnotes"], ["word/comments.xml", "Comments"]] as const) {
    if (truncated) break;
    const x = readText(buf, entries, file, 2_000_000);
    if (!x) continue;
    const notes = [...elements(x, file.includes("foot") ? "w:footnote" : "w:comment")].map((n) => texts(n.inner, "w:t").trim()).filter((t) => t.length > 1);
    if (notes.length) {
      const block = `## ${label}\n${notes.map((n) => `- ${n}`).join("\n")}`;
      if (len + block.length <= limits.maxChars) { out.push(block); len += block.length; } else truncated = true;
    }
  }
  return { title: docTitle(buf, entries), text: out.join("\n\n"), truncated, paragraphs, tables };
}

/* ───────────────────────── PPTX ───────────────────────── */

const slideNo = (n: string) => Number(/(\d+)\.xml$/.exec(n)?.[1] ?? 0);

function slideText(xml: string): { title: string; body: string[] } {
  let title = "";
  const body: string[] = [];
  for (const sp of elements(xml, "p:sp")) {
    const isTitle = /<p:ph[^>]*type="(?:title|ctrTitle)"/.test(sp.inner);
    const paras = [...elements(sp.inner, "a:p")].map((p) => texts(p.inner, "a:t").trim()).filter(Boolean);
    if (!paras.length) continue;
    if (isTitle && !title) title = paras.join(" ");
    else body.push(...paras.map((p) => (/<a:buNone\/>/.test(sp.inner) ? p : `- ${p}`)));
  }
  // Tables and other frames.
  for (const tbl of elements(xml, "a:tbl")) {
    const rows = [...elements(tbl.inner, "a:tr")].map((tr) => [...elements(tr.inner, "a:tc")].map((tc) => texts(tc.inner, "a:t").trim().replace(/\|/g, "\\|")));
    if (rows.length) body.push(rows.map((r) => `| ${r.join(" | ")} |`).join("\n"));
  }
  return { title, body };
}

export function readPptx(buf: Uint8Array, limits: OfficeLimits): { title?: string; text: string; truncated: boolean; slides: number } {
  const entries = listZip(buf, limits);
  const slides = entries.filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.name)).sort((a, b) => slideNo(a.name) - slideNo(b.name));
  if (!slides.length) throw new Error("pptx: no slides");
  const out: string[] = [];
  let len = 0, truncated = false;
  for (const s of slides) {
    const n = slideNo(s.name);
    const xml = readText(buf, entries, s.name, limits.maxEntryBytes) ?? "";
    const { title, body } = slideText(xml);
    const notesXml = readText(buf, entries, `ppt/notesSlides/notesSlide${n}.xml`, 1_000_000);
    const notes = notesXml ? [...elements(notesXml, "a:p")].map((p) => texts(p.inner, "a:t").trim()).filter((t) => t && !/^\d+$/.test(t)).join(" ") : "";
    const block = [`## Slide ${n}${title ? `: ${title}` : ""}`, ...body, notes ? `Speaker notes: ${notes}` : ""].filter(Boolean).join("\n");
    if (len + block.length > limits.maxChars) { truncated = true; break; }
    out.push(block);
    len += block.length + 2;
  }
  return { title: docTitle(buf, entries), text: out.join("\n\n"), truncated, slides: slides.length };
}

/* ───────────────────────── XLSX ───────────────────────── */

const colIndex = (ref: string) => {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

/** Excel serial day → ISO date (1900 system, with the Lotus leap-year bug). */
export const excelDate = (serial: number) => {
  const ms = Math.round((serial - 25569) * 86_400_000);
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return String(serial);
  const iso = d.toISOString();
  return serial % 1 === 0 ? iso.slice(0, 10) : iso.slice(0, 16).replace("T", " ");
};

export function readXlsx(buf: Uint8Array, limits: OfficeLimits): { sheets: SheetTable[]; title?: string } {
  const entries = listZip(buf, limits);
  const wb = readText(buf, entries, "xl/workbook.xml", 4_000_000);
  if (!wb) throw new Error("xlsx: no workbook");
  const rels = readText(buf, entries, "xl/_rels/workbook.xml.rels", 2_000_000) ?? "";
  const target = new Map<string, string>();
  for (const r of elements(rels, "Relationship")) {
    const id = attr(r.open, "Id"), t = attr(r.open, "Target");
    if (id && t) target.set(id, t.startsWith("/") ? t.slice(1) : `xl/${t.replace(/^\.\//, "")}`);
  }
  const shared: string[] = [];
  const ss = readText(buf, entries, "xl/sharedStrings.xml", limits.maxEntryBytes);
  if (ss) for (const si of elements(ss, "si")) shared.push(texts(si.inner, "t"));
  // Date styles: cellXfs index → is a date format.
  const dateStyle: boolean[] = [];
  const styles = readText(buf, entries, "xl/styles.xml", 4_000_000);
  if (styles) {
    const custom = new Map<number, string>();
    for (const f of elements(styles, "numFmt")) custom.set(Number(attr(f.open, "numFmtId")), attr(f.open, "formatCode") ?? "");
    const xfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? "";
    for (const xf of elements(xfs, "xf")) {
      const id = Number(attr(xf.open, "numFmtId") ?? 0);
      const code = custom.get(id)?.replace(/"[^"]*"|\[[^\]]*\]/g, "") ?? "";
      dateStyle.push(BUILTIN_DATE.has(id) || (/[dy]/i.test(code) && !/^[#0.,%\s]*$/.test(code)));
    }
  }
  const sheets: SheetTable[] = [];
  for (const s of elements(wb, "sheet")) {
    const name = attr(s.open, "name") ?? `Sheet${sheets.length + 1}`;
    const rid = attr(s.open, "r:id");
    const path = (rid && target.get(rid)) || `xl/worksheets/sheet${sheets.length + 1}.xml`;
    const xml = readText(buf, entries, path, limits.maxEntryBytes);
    if (!xml) continue;
    const rows: (string | number | null)[][] = [];
    let truncated = false;
    for (const row of elements(xml, "row")) {
      if (rows.length >= limits.maxRows) { truncated = true; break; }
      const r = Number(attr(row.open, "r") ?? rows.length + 1) - 1;
      const cells: (string | number | null)[] = [];
      for (const c of elements(row.inner, "c")) {
        const ref = attr(c.open, "r");
        const t = attr(c.open, "t");
        const sIdx = Number(attr(c.open, "s") ?? -1);
        const v = /<v>([\s\S]*?)<\/v>/.exec(c.inner)?.[1];
        let val: string | number | null = null;
        if (t === "s" && v !== undefined) val = shared[Number(v)] ?? "";
        else if (t === "inlineStr") val = texts(c.inner, "t");
        else if (t === "str" || t === "e") val = v !== undefined ? decodeEntities(v) : null;
        else if (t === "b") val = v === "1" ? "TRUE" : "FALSE";
        else if (v !== undefined) {
          const n = Number(v);
          val = Number.isFinite(n) ? (dateStyle[sIdx] ? excelDate(n) : n) : decodeEntities(v);
        }
        const i = ref ? colIndex(ref) : cells.length;
        if (i > 200) continue;
        cells[i] = val;
      }
      // Keep row positions (blank rows inside a table stay blank) but never pad more than 50 empty rows.
      while (rows.length < r && rows.length - (rows.findLastIndex((x) => x.length) ?? -1) < 50) rows.push([]);
      rows.push(Array.from(cells, (x) => (x === undefined ? null : x)));
    }
    while (rows.length && !rows[rows.length - 1].some((x) => x !== null && x !== "")) rows.pop();
    sheets.push({ name, rows, truncated });
    if (sheets.length >= 12) break;
  }
  return { sheets, title: docTitle(buf, entries) };
}
