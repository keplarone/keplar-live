/**
 * Malicious-content checks for uploaded files, after the type sniff (magic bytes) and before storage.
 *
 * Two layers:
 *  1. Structural, always on, pure: PDFs with active content (JavaScript, launch actions, embedded files, open actions, forms that
 *     submit) are refused; images carrying an HTML/script polyglot tail are refused; ZIP-based and executable signatures hidden
 *     behind an allowed type are refused; decompression-bomb guards for PNG/GIF/WebP by declared dimensions.
 *  2. An external scanner, when KEPLAR_MALWARE_SCAN_URL is set (any HTTP service that answers {"malicious": boolean}, e.g. a
 *     ClamAV REST wrapper or a commercial API): the bytes are POSTed with a short timeout; "malicious" refuses, an unreachable
 *     scanner is fail-open by default (KEPLAR_MALWARE_SCAN_REQUIRED=1 makes it fail-closed) and is logged either way.
 *
 * Refused files are never stored. Callers log a `upload.rejected` security event (src/lib/security/events.ts).
 */

export type ScanVerdict = { ok: true } | { ok: false; reason: string; code: "active_pdf" | "polyglot" | "executable" | "bomb" | "scanner" | "scanner_unavailable" };

const MAX_PIXELS = 50_000_000; // 50 MP: a 7000x7000 image; anything larger is a decompression bomb for a browser or a resize step.
const PDF_ACTIVE = [/\/JavaScript\b/, /\/JS\b/, /\/Launch\b/, /\/EmbeddedFiles?\b/, /\/OpenAction\b/, /\/AA\b/, /\/SubmitForm\b/, /\/RichMedia\b/, /\/XFA\b/];
const EXEC_SIGS: [Buffer, string][] = [
  [Buffer.from("MZ"), "a Windows executable"],
  [Buffer.from([0x7f, 0x45, 0x4c, 0x46]), "a Linux executable"],
  [Buffer.from([0xcf, 0xfa, 0xed, 0xfe]), "a macOS executable"],
  [Buffer.from([0xca, 0xfe, 0xba, 0xbe]), "a Java class or universal binary"],
  [Buffer.from("PK\x03\x04", "latin1"), "an archive"],
  [Buffer.from("Rar!"), "an archive"],
  [Buffer.from([0x1f, 0x8b]), "a gzip archive"],
];

function declaredPixels(mime: string, b: Buffer): number | null {
  try {
    if (mime === "image/png" && b.length >= 24) return b.readUInt32BE(16) * b.readUInt32BE(20);
    if (mime === "image/gif" && b.length >= 10) return b.readUInt16LE(6) * b.readUInt16LE(8);
    if (mime === "image/webp" && b.length >= 30) {
      const chunk = b.subarray(12, 16).toString("latin1");
      if (chunk === "VP8X") return ((b[24] | (b[25] << 8) | (b[26] << 16)) + 1) * ((b[27] | (b[28] << 8) | (b[29] << 16)) + 1);
      if (chunk === "VP8 ") return (b.readUInt16LE(26) & 0x3fff) * (b.readUInt16LE(28) & 0x3fff);
      if (chunk === "VP8L") { const bits = b.readUInt32LE(21); return ((bits & 0x3fff) + 1) * (((bits >> 14) & 0x3fff) + 1); }
    }
  } catch {
    return null;
  }
  return null;
}

/** Layer 1: pure structural checks for a file whose type was decided by its bytes. */
export function scanBytes(bytes: Buffer, mime: string): ScanVerdict {
  const head = bytes.subarray(0, 8);
  for (const [sig, what] of EXEC_SIGS) if (head.subarray(0, sig.length).equals(sig)) return { ok: false, code: "executable", reason: `That file is ${what}, not a document or image.` };
  if (mime === "application/pdf") {
    const text = bytes.toString("latin1");
    if (PDF_ACTIVE.some((re) => re.test(text))) return { ok: false, code: "active_pdf", reason: "That PDF contains scripts, embedded files or actions. Export it again as a plain PDF (print to PDF works) and upload that." };
  }
  if (mime.startsWith("image/")) {
    const px = declaredPixels(mime, bytes);
    if (px !== null && px > MAX_PIXELS) return { ok: false, code: "bomb", reason: "That image declares an enormous size. Resize it below 7000 by 7000 pixels." };
    // Polyglots: an image that also parses as HTML or SVG when mis-served. Only the tail is scanned (valid images never end with markup).
    const tail = bytes.subarray(Math.max(0, bytes.length - 4096)).toString("latin1");
    if (/<script\b|<svg\b|<\/html>|<iframe\b|javascript:/i.test(tail)) return { ok: false, code: "polyglot", reason: "That image also contains web markup and was refused." };
  }
  if (mime.startsWith("text/")) {
    const s = bytes.toString("utf8", 0, Math.min(bytes.length, 64 * 1024));
    if (/<script\b|<\?php|<%|#!\s*\/(?:usr\/)?bin\//i.test(s)) return { ok: false, code: "polyglot", reason: "That text file contains script and was refused." };
  }
  return { ok: true };
}

export const scannerConfigured = (env: Record<string, string | undefined> = process.env) => Boolean(env.KEPLAR_MALWARE_SCAN_URL?.trim());

/** Layer 2: the external scanner, if any. Never throws. */
export async function scanRemote(bytes: Buffer, mime: string, env: Record<string, string | undefined> = process.env, fetchFn: typeof fetch = fetch): Promise<ScanVerdict> {
  const url = env.KEPLAR_MALWARE_SCAN_URL?.trim();
  if (!url) return { ok: true };
  const required = /^(1|true|on|yes)$/i.test(env.KEPLAR_MALWARE_SCAN_REQUIRED ?? "");
  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers: { "content-type": mime, ...(env.KEPLAR_MALWARE_SCAN_TOKEN ? { authorization: `Bearer ${env.KEPLAR_MALWARE_SCAN_TOKEN.trim()}` } : {}) },
      body: new Uint8Array(bytes),
      signal: AbortSignal.timeout(Number(env.KEPLAR_MALWARE_SCAN_TIMEOUT_MS) || 8000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`scanner HTTP ${res.status}`);
    const j = (await res.json().catch(() => null)) as { malicious?: unknown; infected?: unknown } | null;
    const bad = j?.malicious === true || j?.infected === true;
    return bad ? { ok: false, code: "scanner", reason: "That file was flagged as malicious and was refused." } : { ok: true };
  } catch (e) {
    console.warn("[upload-scan] scanner unavailable:", e instanceof Error ? e.name : "error");
    return required ? { ok: false, code: "scanner_unavailable", reason: "Uploads are paused while the file scanner is unavailable. Try again in a minute." } : { ok: true };
  }
}

/** Both layers. */
export async function scanUpload(bytes: Buffer, mime: string): Promise<ScanVerdict> {
  const local = scanBytes(bytes, mime);
  if (!local.ok) return local;
  return scanRemote(bytes, mime);
}
