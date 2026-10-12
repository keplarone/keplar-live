// Build the browser extension: validate it against the privacy rules, then write extension/dist/keplar-extension-<version>.zip.
// No bundler, no dependencies, no network. The zip is deterministic (fixed timestamps, sorted entries).
// Run: node scripts/build-extension.mjs        (or: npm run build:extension)
import { deflateRawSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "extension");
export const SHIPPED = ["manifest.json", "background.js", "lib.js", "lens.js", "popup.html", "popup.css", "popup.js", "icons/icon16.png", "icons/icon32.png", "icons/icon48.png", "icons/icon128.png"];
/** The only permissions the extension may ask for. Adding one must be a deliberate change to this list and to the store text. */
export const ALLOWED_PERMISSIONS = ["activeTab", "contextMenus", "scripting", "storage"];
export const ALLOWED_ORIGINS = ["https://keplar.one"];

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** Minimal ZIP writer (deflate). Entries: [{ name, data: Buffer }]. */
export function zip(entries) {
  const time = 0, date = ((2026 - 1980) << 9) | (1 << 5) | 1; // 2026-01-01 00:00
  const locals = [], centrals = [];
  let offset = 0;
  for (const { name, data } of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    const nameBuf = Buffer.from(name), comp = deflateRawSync(data, { level: 9 }), sum = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8); lh.writeUInt16LE(time, 10); lh.writeUInt16LE(date, 12);
    lh.writeUInt32LE(sum, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
    const local = Buffer.concat([lh, nameBuf, comp]);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10); ch.writeUInt16LE(time, 12); ch.writeUInt16LE(date, 14);
    ch.writeUInt32LE(sum, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(local); centrals.push(Buffer.concat([ch, nameBuf])); offset += local.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(centrals.length, 8); end.writeUInt16LE(centrals.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/** Returns a list of problems (empty = fine). */
export function validateExtension(dir = root) {
  const problems = [];
  const read = (f) => readFileSync(join(dir, f), "utf8");
  let m;
  try { m = JSON.parse(read("manifest.json")); } catch { return ["manifest.json is missing or not valid JSON"]; }
  if (m.manifest_version !== 3) problems.push("manifest_version must be 3");
  for (const p of m.permissions ?? []) if (!ALLOWED_PERMISSIONS.includes(p)) problems.push(`permission not on the allow-list: ${p}`);
  if (m.optional_permissions?.length) problems.push("no optional permissions");
  if (m.host_permissions?.length || m.optional_host_permissions?.length) problems.push("no host permissions: the API allows cross-origin calls with a bearer key");
  if (m.content_scripts) problems.push("no content scripts: pages are read only on a click, with activeTab");
  if (m.web_accessible_resources) problems.push("no web-accessible resources");
  if (m.externally_connectable) problems.push("no externally_connectable");
  const csp = m.content_security_policy?.extension_pages ?? "";
  if (!/script-src 'self'/.test(csp) || /unsafe-eval|unsafe-inline|wasm-unsafe-eval/.test(csp)) problems.push("CSP must be script-src 'self' without unsafe-*");
  for (const o of csp.match(/https?:\/\/[^\s;]+/g) ?? []) if (!ALLOWED_ORIGINS.includes(o)) problems.push(`CSP allows an origin not on the list: ${o}`);
  for (const f of SHIPPED) { try { readFileSync(join(dir, f)); } catch { problems.push(`missing file: ${f}`); } }
  for (const f of SHIPPED.filter((x) => /\.(js|html)$/.test(x))) {
    let src = ""; try { src = read(f); } catch { continue; }
    if (/\beval\s*\(|new Function\s*\(|importScripts\s*\(|document\.write\s*\(|\.innerHTML\s*=|insertAdjacentHTML|setTimeout\s*\(\s*["'`]/.test(src)) problems.push(`${f}: eval, dynamic code or HTML injection`);
    if (/<script[^>]+src=["']https?:/i.test(src) || /\bimport\s*\(?\s*["']https?:/.test(src)) problems.push(`${f}: remote script`);
    if (/\bonclick=|\bonload=|<script>(?!\s*<\/script>)/i.test(src) && f.endsWith(".html")) problems.push(`${f}: inline script`);
    if (/localStorage|sessionStorage|document\.cookie|indexedDB|XMLHttpRequest|sendBeacon|google-analytics|gtag\(/.test(src)) problems.push(`${f}: storage or tracking API outside chrome.storage`);
    for (const u of src.match(/https?:\/\/[^\s"'`)<>]+/g) ?? []) if (!/^https:\/\/keplar\.one(\/|$)/.test(u) && !/^https?:\/\/www\.w3\.org\//.test(u)) problems.push(`${f}: unexpected URL ${u}`);
  }
  return problems;
}

export function buildExtension() {
  const problems = validateExtension();
  if (problems.length) throw new Error(`extension failed validation:\n- ${problems.join("\n- ")}`);
  const m = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  const name = `keplar-extension-${m.version_name ?? m.version}.zip`;
  const out = join(root, "dist", name);
  mkdirSync(dirname(out), { recursive: true });
  const buf = zip(SHIPPED.map((f) => ({ name: f, data: readFileSync(join(root, f)) })));
  writeFileSync(out, buf);
  return { out, bytes: buf.length, files: SHIPPED.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = buildExtension();
  console.log(`built ${r.out} (${r.files} files, ${r.bytes} bytes)`);
}
