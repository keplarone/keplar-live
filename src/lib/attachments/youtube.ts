/**
 * YouTube links: public metadata (oEmbed + the watch page's player data) and, when YouTube offers captions to anonymous
 * visitors, the transcript with timestamps. Everything goes through the SSRF-safe fetch. When captions aren't available the
 * read says so and the answer uses the title, channel and description only (never a guessed transcript).
 */
import { safeFetch } from "@/lib/mcp/ssrf";
import { decodeEntities } from "./xml";
import { fmtClockLong } from "./time";

export type YouTubeRead = {
  id: string;
  title: string;
  channel?: string;
  durationSec?: number;
  published?: string;
  views?: number;
  description?: string;
  thumbnail: string;
  transcript?: string;
  transcriptLang?: string;
  transcriptAuto?: boolean;
  chapters: string[];
};

const UA = "Mozilla/5.0 (compatible; KeplarBot/1.0; +https://keplar.one/bot)";

/** The JSON object assigned to `name` in a page script (balanced-brace scan, strings respected). */
export function jsonAfter(html: string, name: string): unknown {
  const i = html.indexOf(name);
  if (i < 0) return null;
  const start = html.indexOf("{", i);
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let j = start; j < html.length && j < start + 3_000_000; j++) {
    const c = html[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, j + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

type Track = { baseUrl?: string; languageCode?: string; kind?: string; name?: { simpleText?: string } };

/** Caption track to use: English made by people, then English auto, then any made by people, then anything. */
export function pickTrack(tracks: Track[]): Track | null {
  const en = (t: Track) => (t.languageCode ?? "").startsWith("en");
  return tracks.find((t) => en(t) && t.kind !== "asr") ?? tracks.find((t) => en(t)) ?? tracks.find((t) => t.kind !== "asr") ?? tracks[0] ?? null;
}

/** json3 captions → "[m:ss] text" paragraphs, a timestamp about every 30 s. */
export function captionsToText(json3: unknown, maxChars: number): string {
  const ev = (json3 as { events?: { tStartMs?: number; segs?: { utf8?: string }[] }[] })?.events ?? [];
  const out: string[] = [];
  let para = "", paraStart = -1, len = 0;
  for (const e of ev) {
    const t = (e.segs ?? []).map((s) => s.utf8 ?? "").join("").replace(/\s+/g, " ").trim();
    if (!t) continue;
    const at = Math.floor((e.tStartMs ?? 0) / 1000);
    // A long silence starts a new paragraph even mid-sentence, so timestamps stay honest.
    if (para && at - paraStart >= 60) {
      const line = `[${fmtClockLong(paraStart)}] ${para}`;
      if (len + line.length > maxChars) { para = ""; break; }
      out.push(line); len += line.length; para = ""; paraStart = -1;
    }
    if (paraStart < 0) paraStart = at;
    para += (para ? " " : "") + t;
    if ((at - paraStart >= 30 && /[.?!]$/.test(t)) || para.length > 600) {
      const line = `[${fmtClockLong(paraStart)}] ${para}`;
      if (len + line.length > maxChars) break;
      out.push(line); len += line.length; para = ""; paraStart = -1;
    }
  }
  if (para && len + para.length < maxChars) out.push(`[${fmtClockLong(Math.max(0, paraStart))}] ${para}`);
  return out.join("\n");
}

/** Old XML caption format fallback. */
export function xmlCaptionsToText(xml: string, maxChars: number): string {
  const out: string[] = [];
  let len = 0, last = -30;
  for (const m of xml.matchAll(/<text start="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g)) {
    const at = Math.floor(Number(m[1]));
    const t = decodeEntities(decodeEntities(m[2])).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!t) continue;
    const piece = at - last >= 30 ? `\n[${fmtClockLong(at)}] ${t}` : ` ${t}`;
    if (at - last >= 30) last = at;
    if (len + piece.length > maxChars) break;
    out.push(piece); len += piece.length;
  }
  return out.join("").trim();
}

/** Chapters from the description ("0:00 Intro" lines). */
export const chaptersFrom = (desc: string) => desc.split("\n").map((l) => l.trim()).filter((l) => /^\(?\d{1,2}:\d{2}(?::\d{2})?\)?\s+\S/.test(l)).slice(0, 40);

export async function readYouTube(id: string, maxChars: number): Promise<YouTubeRead> {
  const watch = `https://www.youtube.com/watch?v=${id}`;
  const out: YouTubeRead = { id, title: "", thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, chapters: [] };
  const [oembed, page] = await Promise.allSettled([
    safeFetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`, { headers: { "user-agent": UA, accept: "application/json" }, timeoutMs: 6000, maxBytes: 64_000 }),
    safeFetch(`${watch}&hl=en&persist_hl=1`, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", "accept-language": "en-US,en;q=0.9", accept: "text/html" }, timeoutMs: 9000, maxBytes: 4_000_000 }),
  ]);
  if (oembed.status === "fulfilled" && oembed.value.status === 200) {
    try {
      const j = JSON.parse(oembed.value.body.toString("utf8")) as { title?: string; author_name?: string };
      out.title = j.title ?? "";
      out.channel = j.author_name;
    } catch { /* ignore */ }
  }
  let tracks: Track[] = [];
  if (page.status === "fulfilled" && page.value.status === 200) {
    const html = page.value.body.toString("utf8");
    const pr = jsonAfter(html, "ytInitialPlayerResponse") as {
      videoDetails?: { title?: string; author?: string; lengthSeconds?: string; shortDescription?: string; viewCount?: string };
      microformat?: { playerMicroformatRenderer?: { publishDate?: string } };
      captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: Track[] } };
    } | null;
    const vd = pr?.videoDetails;
    if (vd) {
      out.title ||= vd.title ?? "";
      out.channel ||= vd.author;
      out.durationSec = Number(vd.lengthSeconds) || undefined;
      out.description = vd.shortDescription?.slice(0, 5000);
      out.views = Number(vd.viewCount) || undefined;
      out.chapters = chaptersFrom(vd.shortDescription ?? "");
    }
    out.published = pr?.microformat?.playerMicroformatRenderer?.publishDate;
    tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  }
  const track = pickTrack(tracks);
  if (track?.baseUrl) {
    try {
      const base = track.baseUrl.startsWith("http") ? track.baseUrl : `https://www.youtube.com${track.baseUrl}`;
      const u = new URL(base);
      if (/(^|\.)youtube\.com$/.test(u.hostname)) {
        const j = await safeFetch(`${base}&fmt=json3`, { headers: { "user-agent": UA }, timeoutMs: 8000, maxBytes: 3_000_000 });
        let text = "";
        if (j.status === 200 && j.body.length > 20) {
          const s = j.body.toString("utf8");
          text = s.trimStart().startsWith("{") ? captionsToText(JSON.parse(s), maxChars) : xmlCaptionsToText(s, maxChars);
        }
        if (text.length > 40) {
          out.transcript = text;
          out.transcriptLang = track.languageCode;
          out.transcriptAuto = track.kind === "asr";
        }
      }
    } catch { /* captions are best effort */ }
  }
  if (!out.title) throw new Error("youtube: nothing readable");
  return out;
}
