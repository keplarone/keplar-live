/**
 * A small, defensive ZIP reader (server only) for DOCX / PPTX / XLSX and zipped code projects. No dependency: it reads the
 * central directory and inflates entries with node:zlib.
 *
 * Guards (tests/attachments-parsers.test.ts):
 *  - entry count, per-entry and total uncompressed size are capped BEFORE inflating (sizes from the central directory), and
 *    inflate itself is capped with `maxOutputLength`, so a lying header can't blow up memory (zip bombs);
 *  - a compression ratio above 200:1 on a large entry is refused;
 *  - encrypted entries, ZIP64 and unknown compression methods are skipped, never "half-read";
 *  - names are normalised; absolute paths and `..` segments are dropped (nothing is ever written to disk anyway).
 */
import { inflateRawSync } from "node:zlib";

export class ZipError extends Error {
  constructor(message: string, public code: "not_zip" | "too_many" | "too_large" | "bomb" | "corrupt" = "corrupt") {
    super(message);
  }
}

export type ZipEntry = { name: string; size: number; compressedSize: number; method: number; offset: number; encrypted: boolean; dir: boolean };
export type ZipLimits = { maxEntries: number; maxTotalBytes: number; maxEntryBytes: number };

const SIG_EOCD = 0x06054b50;
const SIG_CEN = 0x02014b50;
const SIG_LOC = 0x04034b50;

export const isZip = (b: Uint8Array) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5) && (b[3] === 4 || b[3] === 6);

function cleanName(raw: string): string | null {
  const s = raw.replace(/\\/g, "/");
  if (s.startsWith("/") || /^[a-z]:/i.test(s)) return null;
  const n = s.replace(/^(\.\/)+/, "");
  if (!n) return null;
  const parts = n.split("/");
  if (parts.some((p) => p === "..")) return null;
  return parts.filter((p) => p && p !== ".").join("/") + (n.endsWith("/") ? "/" : "");
}

/** Read the central directory. Throws ZipError when the archive is not a ZIP or breaks the limits. */
export function listZip(buf: Uint8Array, limits: ZipLimits): ZipEntry[] {
  if (!isZip(buf)) throw new ZipError("That file isn't a valid ZIP archive.", "not_zip");
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // End of central directory: last 22 bytes + up to 64 KB of comment.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_535); i--) {
    if (dv.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new ZipError("That archive is damaged (no directory found).", "corrupt");
  const count = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOff = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || cdOff === 0xffffffff) throw new ZipError("That archive uses ZIP64, which Keplar doesn't read. Re-zip it with standard settings.", "too_large");
  if (count > limits.maxEntries) throw new ZipError(`That archive has ${count.toLocaleString("en-US")} files. Keplar reads up to ${limits.maxEntries.toLocaleString("en-US")}.`, "too_many");
  if (cdOff + cdSize > buf.length) throw new ZipError("That archive is damaged.", "corrupt");
  const out: ZipEntry[] = [];
  let p = cdOff;
  let total = 0;
  const dec = new TextDecoder("utf-8");
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || dv.getUint32(p, true) !== SIG_CEN) throw new ZipError("That archive is damaged.", "corrupt");
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const compressedSize = dv.getUint32(p + 20, true);
    const size = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const offset = dv.getUint32(p + 42, true);
    const rawName = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    const name = cleanName(rawName);
    if (!name) continue;
    const dir = name.endsWith("/");
    if (!dir) {
      total += size;
      if (total > limits.maxTotalBytes) throw new ZipError("That archive expands to more than Keplar reads at once. Zip only the folders you need.", "too_large");
      if (size > 1_000_000 && compressedSize > 0 && size / compressedSize > 200) throw new ZipError("That archive looks like a zip bomb (it expands far more than normal), so Keplar didn't open it.", "bomb");
    }
    out.push({ name, size, compressedSize, method, offset, encrypted: (flags & 1) === 1, dir });
  }
  return out;
}

/** Inflate one entry. Returns null for encrypted, oversize or unsupported entries. */
export function readEntry(buf: Uint8Array, e: ZipEntry, maxBytes: number): Uint8Array | null {
  if (e.dir || e.encrypted || e.size > maxBytes) return null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (e.offset + 30 > buf.length || dv.getUint32(e.offset, true) !== SIG_LOC) return null;
  const start = e.offset + 30 + dv.getUint16(e.offset + 26, true) + dv.getUint16(e.offset + 28, true);
  const end = start + e.compressedSize;
  if (end > buf.length) return null;
  const data = buf.subarray(start, end);
  try {
    if (e.method === 0) return data.length <= maxBytes ? data : null;
    if (e.method === 8) return new Uint8Array(inflateRawSync(data, { maxOutputLength: Math.min(maxBytes, Math.max(e.size, 1)) + 1024 }));
  } catch {
    return null;
  }
  return null;
}

/** Convenience: read one named entry as UTF-8 text. */
export function readText(buf: Uint8Array, entries: ZipEntry[], name: string, maxBytes = 8 * 1024 * 1024): string | null {
  const e = entries.find((x) => x.name === name);
  const b = e ? readEntry(buf, e, maxBytes) : null;
  return b ? new TextDecoder("utf-8").decode(b) : null;
}
