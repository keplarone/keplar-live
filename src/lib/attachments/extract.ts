/**
 * The unified server-side reader for everything that isn't an image, a video or audio (server only).
 *
 * The type is decided by the BYTES: %PDF, a ZIP whose parts say Word / PowerPoint / Excel, {\rtf, executable signatures
 * (refused), otherwise strict UTF-8 text which is then read as CSV, JSON, a notebook, code or prose by its name. Every path is
 * size-, entry- and time-bounded; macros, scripts and embedded objects are never run. Data files get an exact statistical
 * profile (data.ts). The output is plain text for the models plus a one-line summary for the chip.
 */
import { CODE_LANG, extOf, type AttachLimits, type DocKind } from "./kinds";
import { parseCsv, recordsIn, recordsTable, sniffDelimiter, tableBlock, tableFrom, jsonShape, type Table } from "./data";
import { readDocx, readPptx, readXlsx } from "./office";
import { readCodeZip, readNotebook } from "./code";
import { rtfToText } from "./rtf";
import { isZip, listZip, ZipError } from "./zip";
import { DocError, normalizeText, readUpload } from "@/lib/documents/ingest";

export type Extraction = {
  kind: DocKind;
  title?: string;
  text: string;
  /** Chip subline, e.g. "12 pages", "3 sheets · 1,204 rows", "48 files · TypeScript". */
  summary: string;
  pages: number;
  truncated: boolean;
  /** Anything the person should know (macros ignored, only the first sheets read …). */
  notes?: string[];
};

export class ExtractError extends DocError {}

const mb = (n: number) => `${Math.round((n / 1048576) * 10) / 10} MB`;

/** Executables and disk images are never accepted, whatever they're named. */
export function isExecutable(b: Uint8Array): boolean {
  const h = (i: number) => b[i];
  if (h(0) === 0x4d && h(1) === 0x5a) return true; // MZ (Windows PE)
  if (h(0) === 0x7f && h(1) === 0x45 && h(2) === 0x4c && h(3) === 0x46) return true; // ELF
  if ((h(0) === 0xcf || h(0) === 0xce) && h(1) === 0xfa && h(2) === 0xed && h(3) === 0xfe) return true; // Mach-O
  if (h(0) === 0xca && h(1) === 0xfe && h(2) === 0xba && h(3) === 0xbe) return true; // Mach-O fat / Java class
  return false;
}

const isUtf8 = (b: Uint8Array) => {
  if (b.subarray(0, 8192).includes(0)) return false;
  const n = Math.min(b.length, 400_000);
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(b.subarray(0, n));
    return true;
  } catch {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(b.subarray(0, Math.max(0, n - 4)));
      return n === b.length ? false : true;
    } catch {
      return false;
    }
  }
};

function withTimeout<T>(fn: () => Promise<T> | T, ms: number, what: string): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  return Promise.race([
    Promise.resolve().then(fn),
    new Promise<never>((_, rej) => (t = setTimeout(() => rej(new ExtractError("timeout", `Reading that ${what} took too long. Try a smaller file.`)), ms))),
  ]).finally(() => clearTimeout(t));
}

const sheetsBlock = (tables: Table[], budget: number) => {
  const per = Math.floor(budget / Math.max(1, tables.length));
  let truncated = false;
  const text = tables.map((t) => { const b = tableBlock(t, per); truncated ||= b.truncated || t.truncated; return b.text; }).join("\n\n");
  return { text, truncated };
};

/** Read one file. Throws DocError (safe message) for anything Keplar won't or can't read. */
export async function extractFile(file: { bytes: Uint8Array; name: string; type?: string }, L: AttachLimits): Promise<Extraction> {
  const { bytes, name } = file;
  if (!bytes.length) throw new ExtractError("empty", "That file is empty.");
  if (bytes.length > L.docBytes) throw new ExtractError("size", `That file is ${mb(bytes.length)}. Your plan reads files up to ${mb(L.docBytes)}.`, 413);
  if (isExecutable(bytes)) throw new ExtractError("type", "That's a program, not a document, so Keplar won't open it.", 415);
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  const ext = extOf(name);
  const zipLimits = { maxEntries: L.zipEntries, maxTotalBytes: L.zipBytes, maxEntryBytes: 30 * 1024 * 1024 };
  const office = { ...zipLimits, maxChars: L.docChars, maxRows: L.sheetRows };

  // PDF (the hardened reader shared with Study and Slides).
  if (/^\s*%PDF-/.test(head) || (head.includes("%PDF-") && head.indexOf("%PDF-") < 1000)) {
    const doc = await readUpload({ bytes, name, type: "application/pdf" }, { maxBytes: L.docBytes, maxPages: L.pdfPages, maxChars: L.docChars });
    const text = doc.pages.map((p, i) => (doc.pages.length > 1 ? `[Page ${i + 1}]\n${p}` : p)).filter((p) => p.trim()).join("\n\n");
    return { kind: "pdf", text, summary: `${doc.numPages} ${doc.numPages === 1 ? "page" : "pages"}`, pages: doc.numPages, truncated: doc.truncated };
  }

  if (isZip(bytes)) {
    let entries;
    try {
      entries = listZip(bytes, zipLimits);
    } catch (e) {
      if (e instanceof ZipError) throw new ExtractError(e.code === "not_zip" || e.code === "corrupt" ? "corrupt" : "size", e.message, 422);
      throw e;
    }
    const has = (n: string) => entries.some((e) => e.name === n);
    const macros = entries.some((e) => /vbaProject\.bin$/i.test(e.name));
    const notes = macros ? ["This file contains macros. Keplar read its text and never ran them."] : undefined;
    try {
      if (has("word/document.xml")) {
        const d = await withTimeout(() => readDocx(bytes, office), 20_000, "document");
        if (!d.text.trim()) throw new ExtractError("empty", "That Word document has no text in it.");
        return { kind: "docx", title: d.title, text: d.text, summary: `${d.paragraphs} paragraphs${d.tables ? ` · ${d.tables} ${d.tables === 1 ? "table" : "tables"}` : ""}`, pages: 1, truncated: d.truncated, notes };
      }
      if (has("ppt/presentation.xml")) {
        const p = await withTimeout(() => readPptx(bytes, office), 20_000, "presentation");
        return { kind: "pptx", title: p.title, text: p.text, summary: `${p.slides} ${p.slides === 1 ? "slide" : "slides"}`, pages: p.slides, truncated: p.truncated, notes };
      }
      if (has("xl/workbook.xml")) {
        const x = await withTimeout(() => readXlsx(bytes, office), 25_000, "spreadsheet");
        const tables = x.sheets.filter((s) => s.rows.some((r) => r.some((c) => c !== null && c !== ""))).map((s) => ({ ...tableFrom(s.name, s.rows, L.sheetRows), truncated: s.truncated }));
        if (!tables.length) throw new ExtractError("empty", "That spreadsheet has no data in it.");
        const b = sheetsBlock(tables, L.docChars);
        const rows = tables.reduce((a, t) => a + t.totalRows, 0);
        return { kind: "xlsx", title: x.title, text: b.text, summary: `${tables.length} ${tables.length === 1 ? "sheet" : "sheets"} · ${rows.toLocaleString("en-US")} rows`, pages: tables.length, truncated: b.truncated, notes };
      }
    } catch (e) {
      if (e instanceof DocError) throw e;
      if (e instanceof ZipError) throw new ExtractError("corrupt", e.message);
      throw new ExtractError("corrupt", "Keplar couldn't read that Office file. It may be damaged or password-protected. Try saving it again.");
    }
    if (has("[Content_Types].xml") && entries.some((e) => /^(word|ppt|xl)\//.test(e.name))) throw new ExtractError("type", "That Office file type isn't supported. Save it as .docx, .pptx or .xlsx.", 415);
    const z = await withTimeout(() => readCodeZip(bytes, { ...zipLimits, maxChars: L.docChars }), 25_000, "archive");
    if (!z.files) throw new ExtractError("empty", "That archive has no readable files.");
    return { kind: "zip", text: z.text, summary: z.summary, pages: 1, truncated: z.truncated };
  }

  if (/^\s*\{\\rtf/.test(head)) {
    const t = normalizeText(rtfToText(new TextDecoder("latin1").decode(bytes)));
    if (!t) throw new ExtractError("empty", "That RTF file has no text in it.");
    return { kind: "rtf", text: t.slice(0, L.docChars), summary: `${t.split(/\s+/).length.toLocaleString("en-US")} words`, pages: 1, truncated: t.length > L.docChars };
  }

  // Office binaries from before 2007 (OLE compound files).
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) throw new ExtractError("type", "That's an older Office format (.doc, .xls or .ppt). Save it as .docx, .xlsx or .pptx and attach it again.", 415);
  if (!isUtf8(bytes)) throw new ExtractError("type", "Keplar can't read that file type. Attach a PDF, Word, PowerPoint, Excel, CSV, JSON, text or code file, or a .zip of code.", 415);

  const raw = new TextDecoder("utf-8").decode(bytes).replace(/^\ufeff/, "");
  const trimmed = raw.trimStart();

  if (ext === "csv" || ext === "tsv" || (/^text\/(csv|tab-separated)/.test(file.type ?? ""))) {
    const delim = ext === "tsv" ? "\t" : sniffDelimiter(raw.slice(0, 20_000));
    const rows = parseCsv(raw, delim, L.sheetRows + 1);
    if (!rows.length) throw new ExtractError("empty", "That table is empty.");
    const t = tableFrom(name, rows, L.sheetRows);
    if (rows.length > L.sheetRows) { t.truncated = true; t.totalRows = Math.max(t.totalRows, raw.split("\n").length - 1); }
    const b = tableBlock(t, L.docChars);
    return { kind: "csv", text: b.text, summary: b.summary, pages: 1, truncated: b.truncated || t.truncated };
  }

  if (ext === "ipynb") {
    const nb = readNotebook(raw, L.docChars);
    if (nb) return { kind: "code", text: nb, summary: "Jupyter notebook", pages: 1, truncated: nb.length >= L.docChars - 100 };
  }

  if (ext === "json" || ext === "geojson" || ext === "jsonl" || ext === "ndjson" || ((trimmed.startsWith("{") || trimmed.startsWith("[")) && !CODE_LANG[ext])) {
    let value: unknown;
    let lines = false;
    try {
      value = JSON.parse(raw);
    } catch {
      // JSON Lines: one object per line.
      const objs = raw.split(/\r?\n/).filter((l) => l.trim()).slice(0, L.sheetRows).map((l) => { try { return JSON.parse(l); } catch { return undefined; } });
      if (objs.length && objs.every((o) => o !== undefined)) { value = objs; lines = true; }
      else if (ext.startsWith("json")) throw new ExtractError("corrupt", "That JSON file isn't valid JSON. Check it for a missing comma or bracket.");
    }
    if (value !== undefined) {
      const recs = recordsIn(value);
      if (recs && recs.records.length >= 3) {
        const t = recordsTable(recs.path === "$" ? name : `${name} ${recs.path}`, recs.records, L.sheetRows);
        const b = tableBlock(t, Math.floor(L.docChars * 0.75));
        const shape = `[JSON structure]\n${jsonShape(value)}`.slice(0, 3000);
        return { kind: "json", text: `${shape}\n\n${b.text}`, summary: `${recs.records.length.toLocaleString("en-US")} records${lines ? " (JSON Lines)" : ""}`, pages: 1, truncated: b.truncated };
      }
      const pretty = JSON.stringify(value, null, 2);
      const shape = jsonShape(value).slice(0, 4000);
      const body = pretty.slice(0, Math.max(1000, L.docChars - shape.length - 100));
      return { kind: "json", text: `[JSON structure]\n${shape}\n\n[Content]\n${body}`, summary: Array.isArray(value) ? `array of ${value.length}` : `${Object.keys(value as object).length} keys`, pages: 1, truncated: body.length < pretty.length };
    }
  }

  const lang = CODE_LANG[ext];
  const clean = lang ? raw.replace(/\r\n?/g, "\n").replace(/\u0000/g, "") : normalizeText(raw);
  if (!clean.trim()) throw new ExtractError("empty", "That file has no text in it.");
  const truncated = clean.length > L.docChars;
  const body = clean.slice(0, L.docChars);
  if (lang) {
    const n = body.split("\n").length;
    return { kind: "code", text: `\`\`\`${lang.toLowerCase().replace(/[^a-z+#]/g, "")}\n${body}\n\`\`\``, summary: `${lang} · ${n.toLocaleString("en-US")} lines`, pages: 1, truncated };
  }
  return { kind: "text", text: body, summary: `${body.split(/\s+/).filter(Boolean).length.toLocaleString("en-US")} words`, pages: 1, truncated };
}
