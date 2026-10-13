// Pure helpers shared by the popup and the service worker. No DOM, no chrome.* calls, so they are unit-tested in Node.

export const API_ORIGIN = "https://keplar.one";
export const ASK_URL = `${API_ORIGIN}/api/v1/ask`;
export const DOCS_URL = `${API_ORIGIN}/developers`;
export const KEYS_URL = `${API_ORIGIN}/account#api`;
export const APP_URL = `${API_ORIGIN}/app`;
export const USAGE_URL = `${API_ORIGIN}/api/v1/usage`;
// Connecting to the person's account (src/lib/api/extension.ts on keplar.one): no key to create or paste; searches spend their credits.
export const CONNECT_URL = `${API_ORIGIN}/api/extension/connect`;
export const TOKEN_URL = `${API_ORIGIN}/api/extension/token`;
export const DISCONNECT_URL = `${API_ORIGIN}/api/extension/disconnect`;
/** How often the extension asks whether the person approved, and for how long (the request itself dies after 10 minutes). */
export const CONNECT_POLL_MS = 2000;
export const CONNECT_TTL_MS = 10 * 60 * 1000;

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
/** PKCE (RFC 7636): a 32-byte verifier that never leaves the extension, and the SHA-256 challenge sent to start connecting. */
export async function pkcePair(cryptoImpl = globalThis.crypto) {
  const verifier = b64url(cryptoImpl.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(new Uint8Array(await cryptoImpl.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  return { verifier, challenge };
}

/** What the popup says about a finished connect attempt, from the server's status. */
export function connectStatusText(status) {
  if (status === "denied") return "The connection was stopped on keplar.one. Press Connect to try again.";
  if (status === "expired") return "That took too long and the request expired. Press Connect to try again.";
  if (status === "cancelled") return "The connection was canceled. Press Connect to try again.";
  if (status === "used") return "That approval was already used. Press Connect to try again.";
  return "Couldn't connect. Press Connect to try again.";
}

/** The API accepts questions up to 8,000 characters; leave room for the user's own words and the label. */
export const MAX_QUESTION = 8000;
export const MAX_PAGE_CHARS = 20000;

export const looksLikeKey = (v) => typeof v === "string" && /^kpl_[A-Za-z0-9_-]{32}$/.test(v.trim());

export function hostOf(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.hostname : "";
  } catch {
    return "";
  }
}

/**
 * Build the question sent to the API: the person's own words, then the context they chose to attach, labeled with the page's host
 * (never the full URL: addresses can carry tokens). Returns { question, truncated } and never exceeds MAX_QUESTION.
 */
export function contextLabel(kind) {
  if (kind === "page") return "Page text";
  if (kind === "region") return "Text in the area you dragged";
  return "Selected text";
}

export function composeQuestion({ ask, context, kind, url }) {
  const own = String(ask ?? "").trim();
  const ctx = String(context ?? "").trim();
  if (!own && !ctx) return { question: "", truncated: false };
  const head = own || (kind === "page" ? "Summarize this page and point out anything questionable." : "Explain this and say what is uncertain.");
  if (!ctx) return { question: head.slice(0, MAX_QUESTION), truncated: head.length > MAX_QUESTION };
  const host = hostOf(url);
  const label = `\n\n--- ${contextLabel(kind)}${host ? ` from ${host}` : ""} ---\n`;
  const room = MAX_QUESTION - head.length - label.length;
  if (room < 200) return { question: head.slice(0, MAX_QUESTION), truncated: true };
  const truncated = ctx.length > room;
  return { question: head + label + ctx.slice(0, room), truncated };
}

/** The API's limits for an image (src/lib/api/policy.ts imageChars) and follow-up history (historyTurns, historyTurnChars). */
export const MAX_IMAGE_CHARS = 2_800_000;
export const MAX_HISTORY = 10;
export const MAX_HISTORY_CHARS = 4000;
const IMAGE_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

/**
 * The /api/v1/ask body for a Keplar Lens search: the person's question (or a sensible default), the words inside the area,
 * one picture of the area, and earlier turns for follow-ups. Returns null when there is nothing to ask about.
 * Only called after the person agreed to Lens sending the picture (lens.js asks once).
 */
export function lensRequest({ ask, words, url, image, history }) {
  const own = String(ask ?? "").trim();
  const text = String(words ?? "").trim();
  const pic = image && typeof image.dataUrl === "string" && IMAGE_URL.test(image.dataUrl) && image.dataUrl.length <= MAX_IMAGE_CHARS
    && Number.isInteger(image.width) && Number.isInteger(image.height) && image.width > 0 && image.height > 0 ? image : null;
  if (!own && !text && !pic) return null;
  let question;
  if (text) {
    question = composeQuestion({ ask: own || (pic ? "Explain what is in this area of the page (the picture and the words in it), and say what is uncertain." : ""), context: text, kind: "region", url }).question;
  } else {
    question = (own || "What is in this picture? Explain it briefly, and say what is uncertain.").slice(0, MAX_QUESTION);
  }
  const turns = (Array.isArray(history) ? history : [])
    .filter((t) => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content.trim())
    .slice(-MAX_HISTORY)
    .map((t) => ({ role: t.role, content: t.content.slice(0, MAX_HISTORY_CHARS) }));
  return { question, stream: true, ...(turns.length ? { history: turns } : {}), ...(pic ? { image: { data_url: pic.dataUrl, width: pic.width, height: pic.height } } : {}) };
}

/**
 * Map a CSS-pixel rectangle onto a screenshot of the same viewport.
 * rect: { left, top, width, height }. viewport: { w, h }. Returns image pixels, or null if the area is too small.
 */
export function cropRect(rect, viewport, shotW, shotH) {
  const vw = Number(viewport?.w) || 0;
  const vh = Number(viewport?.h) || 0;
  const iw = Number(shotW) || 0;
  const ih = Number(shotH) || 0;
  if (vw < 2 || vh < 2 || iw < 2 || ih < 2) return null;
  const l = Number(rect?.left) || 0;
  const t = Number(rect?.top) || 0;
  const left = Math.max(0, Math.min(vw, l));
  const top = Math.max(0, Math.min(vh, t));
  const right = Math.max(0, Math.min(vw, l + (Number(rect?.width) || 0)));
  const bottom = Math.max(0, Math.min(vh, t + (Number(rect?.height) || 0)));
  if (right - left < 2 || bottom - top < 2) return null;
  const x = Math.min(iw - 1, Math.round(left * (iw / vw)));
  const y = Math.min(ih - 1, Math.round(top * (ih / vh)));
  return { x, y, w: Math.max(1, Math.min(iw - x, Math.round((right - left) * (iw / vw)))), h: Math.max(1, Math.min(ih - y, Math.round((bottom - top) * (ih / vh)))) };
}

/**
 * Keep text boxes that intersect rect and read them in order.
 * boxes: { text, left, top, right, bottom }. A new line starts when the next box sits more than 4px below the line.
 */
export function textInRect(boxes, rect) {
  const left = Number(rect?.left) || 0;
  const top = Number(rect?.top) || 0;
  const right = left + (Number(rect?.width) || 0);
  const bottom = top + (Number(rect?.height) || 0);
  const hits = [];
  for (const b of Array.isArray(boxes) ? boxes : []) {
    const text = String(b?.text ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const bl = Number(b.left), bt = Number(b.top), br = Number(b.right), bb = Number(b.bottom);
    if (!(br > left && bl < right && bb > top && bt < bottom)) continue;
    hits.push({ text, left: bl, top: bt, bottom: bb });
  }
  hits.sort((a, b) => a.top - b.top || a.left - b.left);
  const lines = [];
  let line = [];
  let lineBottom = -Infinity;
  for (const h of hits) {
    if (line.length && h.top > lineBottom + 4) { lines.push(line.join(" ")); line = []; }
    line.push(h.text);
    lineBottom = Math.max(lineBottom, h.bottom);
  }
  if (line.length) lines.push(line.join(" "));
  return lines.join("\n");
}

/** Split a Server-Sent Events buffer into complete events. Returns { events, rest }. Unknown or malformed events are skipped. */
export function parseSse(buffer) {
  const events = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const block of parts) {
    let name = "message";
    const data = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) name = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (!data.length) continue;
    try {
      events.push({ event: name, data: JSON.parse(data.join("\n")) });
    } catch {
      /* skip a malformed event */
    }
  }
  return { events, rest };
}

export const STAGE_TEXT = {
  understanding: "Reading your question…",
  choosing_models: "Choosing models…",
  comparing: "Asking several models…",
  comparing_disagreements: "Comparing where they differ…",
  checking: "Checking the draft…",
  writing: "Writing the answer…",
};

/** Turn an API answer into plain lines for display. Everything is rendered with textContent, never as HTML. */
/** Bold, inline code and italics inside one line, as text parts (never HTML). */
function inlineParts(text) {
  const parts = [];
  for (const piece of String(text).split(/(\*\*[^*\n]+\*\*|`[^`\n]+`|(?<![*\w])\*[^*\n]+\*(?![*\w]))/)) {
    if (!piece) continue;
    if (/^\*\*[^*]+\*\*$/.test(piece)) parts.push({ text: piece.slice(2, -2), bold: true });
    else if (/^`[^`]+`$/.test(piece)) parts.push({ text: piece.slice(1, -1), code: true });
    else if (/^\*[^*]+\*$/.test(piece)) parts.push({ text: piece.slice(1, -1), em: true });
    else parts.push({ text: piece });
  }
  return parts;
}

/**
 * A Markdown answer as blocks to build with DOM APIs (the extension never injects HTML): headings, paragraphs and list items
 * with bold, italic and inline-code parts. A line ending in two spaces (a Markdown line break) starts a new block, which is how
 * Keplar writes one point per line. Code fences become one code block.
 */
export function markdownBlocks(md) {
  const blocks = [];
  let para = [];
  const flush = () => { if (para.length) { blocks.push({ type: "p", parts: inlineParts(para.join(" ")) }); para = []; } };
  const lines = String(md ?? "").replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (/^\s*```/.test(raw)) {
      flush();
      const code = [];
      while (++i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i]);
      blocks.push({ type: "code", parts: [{ text: code.join("\n") }] });
      continue;
    }
    const line = raw.trim();
    if (!line) { flush(); continue; }
    let m;
    if ((m = /^#{1,6}\s+(.*)$/.exec(line))) { flush(); blocks.push({ type: "h", parts: inlineParts(m[1]) }); }
    else if ((m = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line))) { flush(); blocks.push({ type: "li", parts: inlineParts(m[1]) }); }
    else { para.push(line); if (/ {2}$/.test(raw)) flush(); }
  }
  flush();
  return blocks;
}

export function describeAnswer(a) {
  const out = { answer: String(a?.answer ?? ""), blocks: markdownBlocks(a?.answer), agreement: String(a?.agreement?.summary ?? ""), headline: "", positions: [], credits: Number(a?.usage?.credits ?? 0), models: [] };
  const d = a?.disagreement;
  if (d) {
    out.headline = String(d.headline ?? "");
    out.positions = (Array.isArray(d.positions) ? d.positions : []).map((p) => `${p.count} of ${p.of}: ${p.summary || p.stance}`);
  }
  out.models = (Array.isArray(a?.models) ? a.models : []).map((m) => String(m.name));
  // The API's own count of models consulted (a model that stood in for another is listed twice in `models`).
  const consulted = Number(a?.agreement?.consulted) || new Set(out.models).size;
  const plural = (n, one) => `${n} ${one}${n === 1 ? "" : "s"}`;
  out.meta = `${consulted ? `${plural(consulted, "model")} consulted. ` : ""}${plural(out.credits, "credit")}. Answers can be wrong; agreement isn't proof.`;
  return out;
}

export function errorText(status, body) {
  const m = body?.error?.message;
  if (status === 401) return "Keplar isn't connected anymore (it was disconnected, or the connection expired). Open the Keplar toolbar button and press Connect.";
  if (status === 402) return m || "Your plan's credits are used up for now.";
  if (status === 403) return m || "This key can't do that.";
  if (status === 429) return `${m || "Too many requests."} Try again in a moment.`;
  return m || "Something went wrong. Please try again.";
}
