#!/usr/bin/env node
/**
 * Builds vendor/roblox-docs/chunks.json.gz, the Roblox Creator Docs index behind Studio mode's roblox_docs tool
 * (src/lib/studio/roblox-docs.ts).
 *
 * Source: a checkout of https://github.com/Roblox/creator-docs (CC BY 4.0 for the docs, MIT for code samples). Only the English
 * pages and the Engine API reference are read, so a sparse clone is enough:
 *
 *   git clone --depth 1 --filter=blob:none --sparse https://github.com/Roblox/creator-docs.git
 *   git -C creator-docs sparse-checkout set --no-cone "/content/en-us/**\/*.md" "/content/en-us/reference/engine/**\/*.yaml" "/LICENSE*"
 *   node scripts/build-roblox-docs.mjs path/to/creator-docs
 *
 * Each chunk is [title, url, text]: a guide section (split at ## headings, at most MAX_TEXT characters), a class, datatype, enum or
 * library overview, or one API member with its signature. Deprecated members are kept and marked, so the model learns what not to use.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { parse as parseYaml } from "yaml";

const MAX_TEXT = 1_400;
const DOCS_URL = "https://create.roblox.com/docs";

const root = process.argv[2];
if (!root || !fs.existsSync(path.join(root, "content", "en-us"))) {
  console.error("Usage: node scripts/build-roblox-docs.mjs <path to a creator-docs checkout>");
  process.exit(1);
}
const en = path.join(root, "content", "en-us");
const outDir = path.join(process.cwd(), "vendor", "roblox-docs");

/** `Class.Tween|Tweens` → Tweens, `Class.TweenService:Create()` → TweenService:Create(), [text](link) → text, HTML dropped. */
function clean(s) {
  return String(s ?? "")
    .replace(/<img[^>]*>/gi, "")
    .replace(/<\/?[A-Za-z][^>]*>/g, "")
    .replace(/`(?:Class|Datatype|Enum|Global|Library)\.([^`|]+)\|([^`]+)`/g, "`$2`")
    .replace(/`(?:Class|Datatype|Enum|Global|Library)\.([^`]+)`/g, "`$1`")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Text over MAX_TEXT is split at paragraph breaks, so a chunk never ends mid-sentence when it can be helped. */
function pieces(text) {
  if (text.length <= MAX_TEXT) return [text];
  const out = [];
  let cur = "";
  for (const para of text.split(/\n\n/)) {
    if (cur && cur.length + para.length + 2 > MAX_TEXT) { out.push(cur); cur = ""; }
    cur = cur ? `${cur}\n\n${para}` : para;
    while (cur.length > MAX_TEXT) { out.push(cur.slice(0, MAX_TEXT)); cur = cur.slice(MAX_TEXT); }
  }
  if (cur) out.push(cur);
  return out;
}

const slug = (h) => h.toLowerCase().replace(/[`*_]/g, "").replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");

function walk(dir, ext, files = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, files);
    else if (e.name.endsWith(ext)) files.push(p);
  }
  return files;
}

const chunks = [];
const push = (title, url, text) => { for (const t of pieces(text)) if (t.length >= 40) chunks.push([title, url, t]); };

// Guides: every English page except the generated reference and shared include fragments.
for (const file of walk(en, ".md")) {
  const rel = path.relative(en, file).split(path.sep).join("/");
  if (rel.startsWith("reference/") || rel.startsWith("includes/")) continue;
  const raw = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n/);
  const meta = fm ? parseYaml(fm[1]) ?? {} : {};
  const body = fm ? raw.slice(fm[0].length) : raw;
  const page = typeof meta.title === "string" ? meta.title : rel;
  const url = `${DOCS_URL}/${rel.replace(/(^|\/)index\.md$/, "").replace(/\.md$/, "")}`;
  const sections = body.split(/^## /m);
  push(page, url, clean(`${meta.description ?? ""}\n\n${sections[0]}`));
  for (const s of sections.slice(1)) {
    const nl = s.indexOf("\n");
    const heading = clean(nl < 0 ? s : s.slice(0, nl));
    push(`${page} › ${heading}`, `${url}#${slug(heading)}`, clean(nl < 0 ? "" : s.slice(nl + 1)));
  }
}

// Engine API reference: one overview per class, datatype, enum, library or global, then one chunk per member.
const sig = (m, kind) => {
  const params = (m.parameters ?? []).map((p) => `${p.name}: ${p.type ?? "any"}${p.default != null && p.default !== "" ? ` = ${p.default}` : ""}`).join(", ");
  const rets = (m.returns ?? []).map((r) => r.type).filter(Boolean).join(", ");
  if (kind === "property") return `${m.name}: ${m.type ?? "any"}`;
  if (kind === "event") return `${m.name}(${params}) [event]`;
  return `${m.name}(${params})${rets ? `: ${rets}` : ""}`;
};
for (const group of ["classes", "datatypes", "enums", "libraries", "globals"]) {
  const dir = path.join(en, "reference", "engine", group);
  if (!fs.existsSync(dir)) continue;
  for (const file of walk(dir, ".yaml")) {
    const doc = parseYaml(fs.readFileSync(file, "utf8"));
    if (!doc?.name) continue;
    const url = `${DOCS_URL}/reference/engine/${group}/${doc.name}`;
    const tags = (doc.tags ?? []).join(", ");
    const head = [
      doc.deprecation_message ? `DEPRECATED: ${clean(doc.deprecation_message)}` : "",
      doc.inherits?.length ? `Inherits: ${doc.inherits.join(", ")}` : "",
      tags ? `Tags: ${tags}` : "",
    ].filter(Boolean).join("\n");
    if (group === "enums") {
      const items = (doc.items ?? []).map((i) => `${i.name} (${i.value})${i.deprecation_message ? " [deprecated]" : ""}${i.summary ? `: ${clean(i.summary)}` : ""}`).join("\n");
      push(`Enum.${doc.name}`, url, `${head ? `${head}\n` : ""}${clean(doc.summary)}\n\nItems:\n${items}`);
      continue;
    }
    push(doc.name, url, `${head ? `${head}\n\n` : ""}${clean(doc.summary)}\n\n${clean(doc.description)}`);
    for (const [key, kind] of [["properties", "property"], ["methods", "method"], ["functions", "method"], ["constructors", "method"], ["events", "event"], ["callbacks", "callback"]]) {
      for (const m of doc[key] ?? []) {
        if (!m?.name) continue;
        const memberTags = (m.tags ?? []).filter((t) => t !== "");
        const lines = [
          sig(m, kind),
          m.deprecation_message ? `DEPRECATED: ${clean(m.deprecation_message)}` : "",
          memberTags.length ? `Tags: ${memberTags.join(", ")}` : "",
          m.security && m.security !== "None" && typeof m.security === "string" ? `Security: ${m.security}` : "",
          clean(m.summary),
          clean(m.description),
        ].filter(Boolean);
        const short = String(m.name).split(/[.:]/).pop();
        push(m.name, `${url}#${short}`, lines.join("\n"));
      }
    }
  }
}

let commit = "unknown";
try { commit = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { /* not a git checkout */ }
const payload = { source: "https://github.com/Roblox/creator-docs", commit, built: new Date().toISOString().slice(0, 10), chunks };
fs.mkdirSync(outDir, { recursive: true });
const gz = zlib.gzipSync(JSON.stringify(payload), { level: 9 });
fs.writeFileSync(path.join(outDir, "chunks.json.gz"), gz);
for (const name of ["LICENSE", "LICENSE-CODE"]) {
  const src = path.join(root, name);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(outDir, name));
}
console.log(`${chunks.length} chunks from ${commit.slice(0, 12)}, ${(gz.length / 1024 / 1024).toFixed(1)} MB gzipped → vendor/roblox-docs/chunks.json.gz`);
