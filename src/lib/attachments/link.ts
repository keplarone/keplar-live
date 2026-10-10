/**
 * Read a link the person pasted (server only). The request goes through the shared SSRF-safe fetch: public addresses only
 * (private, loopback, link-local and cloud-metadata ranges refused, DNS pinned against rebinding), every redirect re-checked
 * (at most 4), no cookies, credentials or Referer sent, the body streamed and cut at a size cap, and a hard deadline.
 *
 * What comes back depends on what the link is: a web page (reader-mode text, metadata, JSON-LD facts and a design
 * reference for Create), a PDF, a YouTube video (metadata + transcript when YouTube offers one), an image (returned as a
 * data URL for the vision models), or a data/text file (parsed like an upload, with exact statistics).
 * Pages that opt out of AI use (`noai` in X-Robots-Tag or a robots meta tag) are not read.
 */
import { checkUrl, FetchError, safeFetch, SsrfError } from "@/lib/mcp/ssrf";
import { readUpload, DocError } from "@/lib/documents/ingest";
import { extractFile } from "./extract";
import { readHtml, type PageRead } from "./html";
import { hostOf, youtubeId, type AttachLimits } from "./kinds";
import { readYouTube } from "./youtube";
import { fmtClockLong } from "./time";

export type LinkKind = "page" | "pdf" | "youtube" | "image" | "data";

export type LinkRead = {
  url: string;
  finalUrl: string;
  host: string;
  kind: LinkKind;
  title: string;
  siteName?: string;
  description?: string;
  favicon?: string;
  image?: string;
  /** Text for the models (already labeled and capped). Empty for images. */
  text: string;
  /** Chip subline: "Article · 1,240 words", "PDF · 12 pages", "YouTube · 14:05 · transcript". */
  summary: string;
  truncated: boolean;
  /** Images only: the picture as a data URL the composer attaches for the vision models. */
  dataUrl?: string;
  design?: PageRead["design"];
  notes: string[];
};

export class LinkError extends Error {
  constructor(public code: "invalid_url" | "private" | "noai" | "not_found" | "denied" | "rate" | "server" | "timeout" | "network" | "too_large" | "unsupported" | "empty", message: string) {
    super(message);
  }
}

const MSG: Record<LinkError["code"], string> = {
  invalid_url: "That doesn't look like a web address. Paste the full link, starting with https://.",
  private: "Keplar only reads public web pages. That address points to a private or internal network.",
  noai: "That page asks not to be used by AI tools, so Keplar didn't read it.",
  not_found: "That page wasn't found (404). Check the link.",
  denied: "That site blocks automated readers or needs a login. Copy the part you need into your message instead.",
  rate: "That site is asking readers to slow down. Try again in a minute.",
  server: "That site had a problem showing the page. Try again later.",
  timeout: "That site took too long to respond.",
  network: "Keplar couldn't connect to that site. Check the link.",
  too_large: "That page or file is too large to read.",
  unsupported: "Keplar can't read that kind of link. Download the file and attach it instead.",
  empty: "That page didn't have readable text (it may build itself with scripts). Copy the part you need into your message.",
};
export const linkMessage = (c: LinkError["code"]) => MSG[c];

const UA = "Mozilla/5.0 (compatible; KeplarBot/1.0; +https://keplar.one/bot) reading a link a user shared";
const IMAGE_MAX = 2_600_000;
const PAGE_MAX = 5_000_000;

function mapError(e: unknown): LinkError {
  if (e instanceof LinkError) return e;
  if (e instanceof SsrfError) { const c = e.code === "invalid_url" ? "invalid_url" : e.code === "dns" ? "network" : "private"; return new LinkError(c, MSG[c]); }
  if (e instanceof FetchError) { const c = e.kind === "timeout" ? "timeout" : e.kind === "too_large" ? "too_large" : "network"; return new LinkError(c, e.kind === "redirect" ? e.message : MSG[c]); }
  if (e instanceof DocError) return new LinkError("unsupported", e.message);
  return new LinkError("network", MSG.network);
}

function decode(buf: Buffer, contentType: string): string {
  const head = buf.subarray(0, 4096).toString("latin1");
  const cs = (/charset=["']?([\w-]+)/i.exec(contentType)?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ?? "utf-8").toLowerCase();
  try {
    return new TextDecoder(cs, { fatal: false }).decode(buf);
  } catch {
    return buf.toString("utf8");
  }
}

const imageMime = (b: Buffer): string | null => {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
};

/** The labeled block the models get for a page. */
export function pageBlock(p: PageRead, finalUrl: string, maxChars: number): { text: string; truncated: boolean } {
  const head = [
    `Title: ${p.title}`,
    [p.siteName && `Site: ${p.siteName}`, p.author && `Author: ${p.author}`, p.published && `Published: ${p.published.slice(0, 10)}`].filter(Boolean).join(" · "),
    `URL: ${finalUrl}`,
    p.description ? `Description: ${p.description}` : "",
    p.structured.length ? `Structured data on the page:\n${p.structured.map((s) => `- ${s}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");
  const room = Math.max(500, maxChars - head.length - 40);
  const body = p.text.length > room ? p.text.slice(0, room).replace(/\s+\S*$/, "") + " …" : p.text;
  return { text: `${head}\n\n[Main text]\n${body || "(no readable body text)"}`, truncated: p.text.length > room };
}

export async function readLink(raw: string, L: AttachLimits & { linkChars: number }): Promise<LinkRead> {
  let url: URL;
  try {
    url = checkUrl(raw, { allowHttp: true });
  } catch (e) {
    throw mapError(e);
  }
  const notes: string[] = [];
  const yt = youtubeId(url.toString());
  if (yt) {
    try {
      const v = await readYouTube(yt, L.linkChars);
      const meta = [`YouTube video: ${v.title}`, v.channel && `Channel: ${v.channel}`, v.durationSec && `Length: ${fmtClockLong(v.durationSec)}`, v.published && `Published: ${v.published}`, v.views && `Views: ${v.views.toLocaleString("en-US")}`, `URL: https://www.youtube.com/watch?v=${yt}`].filter(Boolean).join("\n");
      const desc = v.description ? `\n\n[Description]\n${v.description.slice(0, 2500)}` : "";
      const tr = v.transcript ? `\n\n[Transcript${v.transcriptAuto ? " (YouTube auto-captions, may contain errors)" : ""}${v.transcriptLang ? `, ${v.transcriptLang}` : ""}]\n${v.transcript}` : "";
      if (!v.transcript) notes.push("YouTube didn't share a transcript for this video, so Keplar read the title, channel and description only.");
      const text = `${meta}${desc}${tr}`.slice(0, L.linkChars);
      return { url: raw, finalUrl: `https://www.youtube.com/watch?v=${yt}`, host: "youtube.com", kind: "youtube", title: v.title, siteName: "YouTube", description: v.channel, image: v.thumbnail, favicon: "https://www.youtube.com/favicon.ico", text, summary: `YouTube${v.durationSec ? ` · ${fmtClockLong(v.durationSec)}` : ""}${v.transcript ? " · transcript" : " · no transcript"}`, truncated: text.length >= L.linkChars, notes };
    } catch {
      // The watch page of a missing or private video is an empty script shell; say what happened instead of "reading" it.
      throw new LinkError("not_found", "That YouTube video isn't available. It may be private or removed, or the link may be wrong.");
    }
  }
  let res;
  try {
    res = await safeFetch(url.toString(), {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,text/plain;q=0.8,application/json;q=0.8,image/*;q=0.7,*/*;q=0.1", "accept-language": "en-US,en;q=0.8" },
      timeoutMs: 12_000,
      maxBytes: PAGE_MAX,
      maxRedirects: 4,
      allowHttp: true,
    });
  } catch (e) {
    throw mapError(e);
  }
  const s = res.status;
  if (s === 404 || s === 410) throw new LinkError("not_found", MSG.not_found);
  if (s === 401 || s === 403 || s === 407 || s === 451) throw new LinkError("denied", MSG.denied);
  if (s === 429) throw new LinkError("rate", MSG.rate);
  if (s >= 500) throw new LinkError("server", MSG.server);
  if (s < 200 || s >= 300) throw new LinkError("network", MSG.network);
  if (/\bnoai\b/i.test(res.headers["x-robots-tag"] ?? "")) throw new LinkError("noai", MSG.noai);
  const ct = (res.headers["content-type"] ?? "").toLowerCase();
  const finalUrl = res.finalUrl;
  const host = hostOf(finalUrl);
  const body = res.body;
  const path = new URL(finalUrl).pathname;
  const fileName = decodeURIComponent(path.split("/").pop() || host).slice(0, 120);

  const img = imageMime(body);
  if (img || ct.startsWith("image/")) {
    if (!img) throw new LinkError("unsupported", "That image format isn't supported. Keplar reads PNG, JPG, WebP and GIF.");
    if (body.length > IMAGE_MAX) throw new LinkError("too_large", "That image is too large to read from a link. Save it and attach it instead.");
    return { url: raw, finalUrl, host, kind: "image", title: fileName, text: "", summary: `Image · ${Math.round(body.length / 1024)} KB`, truncated: false, dataUrl: `data:${img};base64,${body.toString("base64")}`, notes };
  }

  if (ct.includes("application/pdf") || body.subarray(0, 5).toString("latin1") === "%PDF-") {
    const doc = await readUpload({ bytes: new Uint8Array(body), name: fileName, type: "application/pdf" }, { maxBytes: PAGE_MAX, maxPages: L.pdfPages, maxChars: L.linkChars }).catch((e) => { throw mapError(e); });
    const text = `PDF: ${fileName}\nURL: ${finalUrl}\n\n${doc.pages.map((p, i) => `[Page ${i + 1}]\n${p}`).join("\n\n")}`.slice(0, L.linkChars);
    return { url: raw, finalUrl, host, kind: "pdf", title: fileName, text, summary: `PDF · ${doc.numPages} ${doc.numPages === 1 ? "page" : "pages"}`, truncated: doc.truncated, notes };
  }

  if (/^(text\/html|application\/xhtml\+xml)/.test(ct) || (!ct && /^\s*</.test(body.subarray(0, 200).toString("latin1")))) {
    const html = decode(body, ct);
    const p = readHtml(html, finalUrl);
    if (/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*\bnoai\b/i.test(html.slice(0, 200_000))) throw new LinkError("noai", MSG.noai);
    if (p.scriptRendered && !p.description) throw new LinkError("empty", MSG.empty);
    if (p.scriptRendered) notes.push("This page builds its content with scripts, so Keplar could read only its title and description.");
    if (body.length >= PAGE_MAX) notes.push("The page is very long; Keplar read the first part.");
    const b = pageBlock(p, finalUrl, L.linkChars);
    const kindWord = p.structured.some((x) => x.startsWith("Product")) ? "Product page" : p.structured.some((x) => /^(NewsArticle|Article|BlogPosting)/.test(x)) || p.published ? "Article" : "Page";
    return { url: raw, finalUrl, host, kind: "page", title: p.title, siteName: p.siteName, description: p.description, favicon: p.favicon, image: p.image, text: b.text, summary: `${kindWord} · ${p.words.toLocaleString("en-US")} words`, truncated: b.truncated, design: p.design, notes };
  }

  if (/^(text\/|application\/(json|xml|csv|x-ndjson))/.test(ct)) {
    const ext = ct.includes("json") ? ".json" : ct.includes("csv") ? ".csv" : ct.includes("tab-separated") ? ".tsv" : "";
    const name = /\.\w{2,5}$/.test(fileName) ? fileName : `${fileName}${ext || ".txt"}`;
    const x = await extractFile({ bytes: new Uint8Array(body), name, type: ct }, { ...L, docChars: L.linkChars, docBytes: PAGE_MAX }).catch((e) => { throw mapError(e); });
    return { url: raw, finalUrl, host, kind: "data", title: x.title ?? fileName, text: `File: ${name}\nURL: ${finalUrl}\n\n${x.text}`, summary: x.summary, truncated: x.truncated, notes };
  }
  throw new LinkError("unsupported", MSG.unsupported);
}
