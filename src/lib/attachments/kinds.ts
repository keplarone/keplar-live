/**
 * One attachment taxonomy for the whole product (chat composer, Create, API). Pure: no fs, no network, no DOM, so the browser,
 * the route handlers and the tests agree on what each file is, which limits apply, and how it is described on a chip.
 *
 * What travels where (docs/multimodal-status.md):
 *  - image  → re-encoded in the browser, sent as validated data URLs to vision models (orchestration/media.ts).
 *  - video  → smart keyframes (scene-change aware) in the browser + the audio track transcribed (/api/keplar/transcribe).
 *  - audio  → decoded in the browser to 16 kHz mono WAV chunks and transcribed.
 *  - link   → fetched server-side through the SSRF-safe fetch (/api/keplar/link) and read into clean text.
 *  - everything else (PDF, Word, PowerPoint, Excel, CSV, JSON, RTF, text, code, zip of code) → /api/keplar/extract, which decides
 *    the type from the BYTES (never the name), parses it with size/time/zip-bomb guards and, for data, computes real statistics.
 */

export type AttachKind = "image" | "video" | "audio" | "pdf" | "docx" | "pptx" | "xlsx" | "csv" | "json" | "rtf" | "text" | "code" | "zip" | "link";

/** Kinds read by the server-side extractor. */
export type DocKind = Exclude<AttachKind, "image" | "video" | "audio" | "link">;

const EXT: Record<string, AttachKind> = {
  png: "image", jpg: "image", jpeg: "image", webp: "image", gif: "image", heic: "image", heif: "image",
  mp4: "video", webm: "video", mov: "video", m4v: "video",
  mp3: "audio", m4a: "audio", wav: "audio", ogg: "audio", oga: "audio", opus: "audio", aac: "audio", flac: "audio", weba: "audio",
  pdf: "pdf",
  docx: "docx", pptx: "pptx", xlsx: "xlsx", xlsm: "xlsx",
  csv: "csv", tsv: "csv",
  json: "json", jsonl: "json", ndjson: "json", geojson: "json",
  rtf: "rtf",
  txt: "text", md: "text", markdown: "text", log: "text", tex: "text", rst: "text", org: "text", srt: "text", vtt: "text", ini: "text", cfg: "text", conf: "text", env: "text",
  zip: "zip",
};

/** Source-code extensions (read as text, labeled with their language). */
export const CODE_LANG: Record<string, string> = {
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript", ts: "TypeScript", tsx: "TypeScript", py: "Python", rb: "Ruby", go: "Go", rs: "Rust",
  java: "Java", kt: "Kotlin", kts: "Kotlin", swift: "Swift", c: "C", h: "C", cc: "C++", cpp: "C++", hpp: "C++", cs: "C#", php: "PHP", scala: "Scala",
  sh: "Shell", bash: "Shell", zsh: "Shell", ps1: "PowerShell", sql: "SQL", r: "R", lua: "Lua", dart: "Dart", ex: "Elixir", exs: "Elixir", erl: "Erlang",
  hs: "Haskell", clj: "Clojure", vue: "Vue", svelte: "Svelte", html: "HTML", htm: "HTML", css: "CSS", scss: "SCSS", less: "Less", xml: "XML",
  yaml: "YAML", yml: "YAML", toml: "TOML", gradle: "Gradle", dockerfile: "Dockerfile", makefile: "Makefile", graphql: "GraphQL", gql: "GraphQL",
  proto: "Protobuf", tf: "Terraform", sol: "Solidity", m: "Objective-C", mm: "Objective-C", zig: "Zig", nim: "Nim", jl: "Julia", ipynb: "Jupyter",
};

export const extOf = (name: string) => {
  const n = name.toLowerCase().trim();
  const base = n.split("/").pop() ?? n;
  if (base === "dockerfile" || base === "makefile") return base;
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1) : "";
};

/** Best guess from the name and the browser's type. The server re-decides from the bytes. */
export function kindOfFile(f: { name: string; type?: string }): AttachKind | null {
  const ext = extOf(f.name);
  const t = (f.type ?? "").toLowerCase();
  if (EXT[ext]) return EXT[ext];
  if (CODE_LANG[ext]) return "code";
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return "audio";
  if (t === "application/pdf") return "pdf";
  if (t.includes("wordprocessingml")) return "docx";
  if (t.includes("presentationml")) return "pptx";
  if (t.includes("spreadsheetml")) return "xlsx";
  if (t === "text/csv") return "csv";
  if (t === "application/json") return "json";
  if (t === "application/rtf" || t === "text/rtf") return "rtf";
  if (t === "application/zip" || t === "application/x-zip-compressed") return "zip";
  if (t.startsWith("text/")) return "text";
  return null;
}

export const isDocKind = (k: AttachKind | null): k is DocKind => !!k && k !== "image" && k !== "video" && k !== "audio" && k !== "link";

/** The file picker's accept list: everything Keplar reads. */
export const ACCEPT_ALL = [
  "image/*", "video/mp4", "video/webm", "video/quicktime", "audio/*",
  ...Object.keys(EXT).map((e) => `.${e}`),
  ...Object.keys(CODE_LANG).filter((e) => e !== "dockerfile" && e !== "makefile").map((e) => `.${e}`),
  "application/pdf",
].filter((v, i, a) => a.indexOf(v) === i).join(",");

/** Short label for a chip badge. */
export const KIND_BADGE: Record<AttachKind, string> = {
  image: "IMG", video: "VID", audio: "AUD", pdf: "PDF", docx: "DOC", pptx: "PPT", xlsx: "XLS", csv: "CSV", json: "JSON", rtf: "RTF", text: "TXT", code: "CODE", zip: "ZIP", link: "WEB",
};

/** Human name used in chip sublines and notes. */
export const KIND_NAME: Record<AttachKind, string> = {
  image: "Image", video: "Video", audio: "Audio", pdf: "PDF", docx: "Word document", pptx: "Slides", xlsx: "Spreadsheet", csv: "Table", json: "JSON data", rtf: "Rich text", text: "Text", code: "Code", zip: "Code archive", link: "Web page",
};

/**
 * Limits, per plan class. Bytes are the ORIGINAL file; chars are what reaches the models after extraction.
 * Vercel caps a function request body at ~4.5 MB, so server-read files stay under that; images and video never upload whole.
 */
export const ATTACH_LIMITS = {
  free: { docBytes: 4 * 1024 * 1024, docChars: 30_000, pdfPages: 40, zipEntries: 400, zipBytes: 40 * 1024 * 1024, audioSeconds: 180, transcribePerDay: 20, linksPerMessage: 3, linkReadsPerDay: 40, sheetRows: 20_000 },
  paid: { docBytes: 4.2 * 1024 * 1024, docChars: 80_000, pdfPages: 150, zipEntries: 2_000, zipBytes: 120 * 1024 * 1024, audioSeconds: 600, transcribePerDay: 120, linksPerMessage: 5, linkReadsPerDay: 300, sheetRows: 100_000 },
} as const;
export type AttachLimits = { [K in keyof (typeof ATTACH_LIMITS)["free"]]: number };
export const limitsForPlan = (plan: string | null | undefined): AttachLimits => (!plan || plan === "free" ? ATTACH_LIMITS.free : ATTACH_LIMITS.paid);

/** Files per message the composer accepts besides images and the video (links are counted separately). */
export const MAX_FILES = 6;
/** Seconds of audio sent per transcription request (16 kHz mono 16-bit WAV ≈ 1.9 MB, under the body cap with room). */
export const AUDIO_CHUNK_SECONDS = 55;
export const AUDIO_SAMPLE_RATE = 16_000;

/** What Keplar reads, for the composer's capability menu and hints. One source of truth for the copy. */
export const READS: { kind: string; label: string; detail: string }[] = [
  { kind: "link", label: "Links", detail: "Web pages, articles, PDFs and YouTube videos. Paste a URL" },
  { kind: "image", label: "Images", detail: "Photos, screenshots, charts, diagrams and handwriting" },
  { kind: "video", label: "Video", detail: "Key scenes plus the spoken audio, up to 3 minutes" },
  { kind: "audio", label: "Audio", detail: "Voice notes, calls and lectures, transcribed" },
  { kind: "pdf", label: "Documents", detail: "PDF, Word, PowerPoint, RTF, Markdown and text" },
  { kind: "code", label: "Code", detail: "Source files and .zip projects, with a file map" },
  { kind: "csv", label: "Data", detail: "CSV, Excel and JSON, with real statistics computed" },
];

/* ─────────────────────────── URLs in a message ─────────────────────────── */

const URL_RX = /\bhttps?:\/\/[^\s<>"'`]+/gi;
/** Public-looking http(s) URLs in a message, trailing punctuation trimmed, de-duplicated, in order. */
export function urlsIn(text: string, max = 5): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(URL_RX)) {
    let u = m[0].replace(/[),.;:!?\]}]+$/, "");
    // Balance a closing paren that belongs to the URL (Wikipedia-style).
    if ((u.match(/\(/g)?.length ?? 0) > (u.match(/\)/g)?.length ?? 0) && m[0].slice(u.length).startsWith(")")) u += ")";
    try {
      const p = new URL(u);
      if (!p.hostname.includes(".")) continue;
      const norm = p.toString();
      if (!out.includes(norm)) out.push(norm);
    } catch {
      /* not a URL */
    }
    if (out.length >= max) break;
  }
  return out;
}

/** YouTube video id from any common URL form, or null. */
export function youtubeId(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const h = u.hostname.replace(/^www\.|^m\.|^music\./, "");
  const ok = (id: string | null | undefined) => (id && /^[\w-]{11}$/.test(id) ? id : null);
  if (h === "youtu.be") return ok(u.pathname.slice(1).split("/")[0]);
  if (h === "youtube.com" || h === "youtube-nocookie.com") {
    if (u.pathname === "/watch") return ok(u.searchParams.get("v"));
    const m = /^\/(?:shorts|embed|live|v)\/([\w-]{11})/.exec(u.pathname);
    return ok(m?.[1]);
  }
  return null;
}

export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 60);
  }
};
