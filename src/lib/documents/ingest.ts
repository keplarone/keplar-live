/**
 * Upload validation and text extraction for Slides attachments and Study guides (server only).
 *
 * Nothing in an upload is trusted: the type is decided by the bytes (the "%PDF-" magic or valid UTF-8
 * text without NULs), not by the filename or the browser's content type; size, pages and characters are
 * capped before and after extraction; extraction runs under a time limit; the text that comes out is
 * stripped of control characters. Scanned (image-only) and encrypted PDFs get a clear message instead of
 * an empty guide. There is no OCR.
 */
import { TEXT_EXT } from "./chat-docs";

export class DocError extends Error {
  constructor(public code: "no_file" | "type" | "size" | "magic" | "encrypted" | "corrupt" | "scanned" | "pages" | "empty" | "timeout", message: string, public status = 422) {
    super(message);
  }
}

export type UploadLimits = { maxBytes: number; maxPages: number; maxChars: number };
export type Extracted = { kind: "pdf" | "text"; pages: string[]; numPages: number; chars: number; truncated: boolean };

const mb = (n: number) => `${Math.round((n / (1024 * 1024)) * 10) / 10} MB`;

/** Control characters out, line endings unified, runs of blank lines and spaces collapsed. */
export function normalizeText(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g, "")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type SniffedKind = "pdf" | "text";

/** What the bytes are. Throws DocError for anything else (a renamed .exe, an image, a zip). */
export function sniff(bytes: Uint8Array, filename = "", declaredType = ""): SniffedKind {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  if (head.includes("%PDF-")) {
    if (!/^\s*%PDF-/.test(head) && head.indexOf("%PDF-") > 1000) throw new DocError("magic", "That file isn't a valid PDF.");
    return "pdf";
  }
  const name = filename.toLowerCase();
  const claimsPdf = name.endsWith(".pdf") || declaredType === "application/pdf";
  if (claimsPdf) throw new DocError("magic", "That file says it's a PDF but doesn't look like one. Upload a real PDF or paste the text.");
  const textish = TEXT_EXT.test(name) || declaredType.startsWith("text/") || declaredType === "";
  if (!textish) throw new DocError("type", "Upload a PDF, or a .txt or .md file, or paste the text.", 415);
  const sample = bytes.subarray(0, 8192);
  if (sample.includes(0)) throw new DocError("type", "That file isn't text. Upload a PDF, or a .txt or .md file, or paste the text.", 415);
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, Math.min(bytes.length, 200_000)));
  } catch {
    // A multi-byte character may be cut at the sample end; only a failure well inside the text means "not UTF-8".
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, Math.max(0, Math.min(bytes.length, 200_000) - 4)));
    } catch {
      throw new DocError("type", "That text file isn't UTF-8. Save it as UTF-8 or paste the text.", 415);
    }
  }
  return "text";
}

/** Split plain text into pseudo-pages of about `size` characters at paragraph boundaries (so citations still point somewhere). */
export function paginateText(text: string, size = 3000): string[] {
  const out: string[] = [];
  let cur = "";
  for (const para of text.split(/\n{2,}/)) {
    if (cur && cur.length + para.length + 2 > size) {
      out.push(cur);
      cur = "";
    }
    if (para.length > size * 1.5) {
      for (let i = 0; i < para.length; i += size) out.push(para.slice(i, i + size));
    } else cur = cur ? `${cur}\n\n${para}` : para;
  }
  if (cur) out.push(cur);
  return out;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  return Promise.race([p, new Promise<never>((_, rej) => (t = setTimeout(() => rej(new DocError("timeout", "Reading that PDF took too long. Try a smaller file.", 422)), ms)))]).finally(() => clearTimeout(t));
}

async function extractPdf(bytes: Uint8Array, limits: UploadLimits): Promise<Extracted> {
  const { getDocumentProxy, extractText } = await import("unpdf");
  let pdf;
  try {
    pdf = await withTimeout(getDocumentProxy(new Uint8Array(bytes)), 15_000);
  } catch (e) {
    if (e instanceof DocError) throw e;
    const msg = e instanceof Error ? `${e.name} ${e.message}` : "";
    if (/password/i.test(msg)) throw new DocError("encrypted", "That PDF is password-protected. Remove the password and upload it again, or paste the text.");
    throw new DocError("corrupt", "Keplar couldn't read that PDF. It may be damaged. Try another copy, or paste the text.");
  }
  const numPages = pdf.numPages;
  if (numPages > limits.maxPages) throw new DocError("pages", `That PDF has ${numPages} pages. Your plan reads up to ${limits.maxPages}. Upload fewer pages or split it.`);
  let raw: string[];
  try {
    const r = await withTimeout(extractText(pdf, { mergePages: false }), 25_000);
    raw = Array.isArray(r.text) ? r.text : [String(r.text)];
  } catch (e) {
    if (e instanceof DocError) throw e;
    throw new DocError("corrupt", "Keplar couldn't read the text in that PDF. Try another copy, or paste the text.");
  } finally {
    await (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.()?.catch?.(() => undefined);
  }
  let pages = raw.map(normalizeText);
  const chars = pages.reduce((a, p) => a + p.length, 0);
  // Scanned or image-only: almost no extractable text per page. (No OCR.)
  const withText = pages.filter((p) => p.length >= 40).length;
  if (chars < 200 || chars / Math.max(1, numPages) < 25 || withText < Math.max(1, Math.floor(numPages * 0.25))) {
    throw new DocError("scanned", "This PDF looks like scanned pages or images, so there's no text to read. Keplar can't read scans yet. Upload a text-based PDF (one you can select text in), or paste the text.");
  }
  let truncated = false;
  let total = 0;
  pages = pages.map((p) => {
    const room = Math.max(0, limits.maxChars - total);
    if (p.length > room) truncated = true;
    const t = p.slice(0, room);
    total += t.length;
    return t;
  });
  return { kind: "pdf", pages, numPages, chars: total, truncated };
}

/** Validate and read one uploaded file. */
export async function readUpload(file: { bytes: Uint8Array; name: string; type: string }, limits: UploadLimits): Promise<Extracted> {
  if (!file.bytes.length) throw new DocError("empty", "That file is empty.");
  if (file.bytes.length > limits.maxBytes) throw new DocError("size", `That file is ${mb(file.bytes.length)}. Your plan accepts up to ${mb(limits.maxBytes)}.`, 413);
  const kind = sniff(file.bytes, file.name, file.type);
  if (kind === "pdf") return extractPdf(file.bytes, limits);
  return readPasted(new TextDecoder("utf-8").decode(file.bytes), limits);
}

/** Pasted (or .txt/.md) text: normalised, capped, and split into pages. */
export function readPasted(text: string, limits: Pick<UploadLimits, "maxChars">): Extracted {
  const clean = normalizeText(text);
  if (clean.length < 80) throw new DocError("empty", "There isn't enough text to work with. Paste at least a few paragraphs.");
  const truncated = clean.length > limits.maxChars;
  const body = truncated ? clean.slice(0, limits.maxChars) : clean;
  const pages = paginateText(body);
  return { kind: "text", pages, numPages: pages.length, chars: body.length, truncated };
}
