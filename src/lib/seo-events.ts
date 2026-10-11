"use client";
/**
 * Browser side of the search-to-activation measurement (server side: src/lib/seo/events.ts).
 * Everything here is a no-op unless the visitor allowed Analytics in the cookie banner. We keep, in this browser only:
 *  - keplar_vid: a random id (no link to an account), used to count distinct browsers
 *  - keplar_lp: the first public page of the visit (path + coarse source class + utm tags), kept 30 days
 *  - keplar_seo_done: which one-time milestones were already reported
 * Prompt text, files, referrer URLs and account details are never read or sent.
 */
import { consentAllows } from "./consent";
import type { SeoEvent, SeoSource } from "./seo/events";

const VID = "keplar_vid";
const LP = "keplar_lp";
const DONE = "keplar_seo_done";
const SESSION_LV = "keplar_lv";
const LP_MAX_AGE = 30 * 864e5;
const ONCE: SeoEvent[] = ["signup_complete", "first_prompt", "synthesis_success"];

type Landing = { p: string; s: SeoSource; u?: string; c?: string; t: number };

const hex = () => {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return [...a].map((x) => x.toString(16).padStart(2, "0")).join("");
};

/** Coarse source class from document.referrer. Only the class leaves the browser, never the URL. */
export function classifySource(referrer: string, selfHost: string): SeoSource {
  if (!referrer) return "direct";
  let h = "";
  try {
    h = new URL(referrer).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "other";
  }
  if (!h) return "direct";
  if (h === selfHost.replace(/^www\./, "")) return "internal";
  if (/(^|\.)(google|bing|duckduckgo|yahoo|ecosia|brave|yandex|baidu|kagi|startpage|qwant)\./.test(h + ".") && !/^(gemini|copilot)\./.test(h)) return "search";
  if (/^(chatgpt\.com|chat\.openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com|you\.com|phind\.com)$/.test(h)) return "ai";
  if (/(^|\.)(x\.com|twitter\.com|t\.co|facebook\.com|instagram\.com|linkedin\.com|lnkd\.in|reddit\.com|youtube\.com|youtu\.be|tiktok\.com|news\.ycombinator\.com|threads\.net|bsky\.app|mastodon\.social)$/.test(h)) return "social";
  return "other";
}

const read = <T,>(k: string, store: Storage = localStorage): T | null => {
  try {
    const v = store.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
};
const write = (k: string, v: unknown, store: Storage = localStorage) => {
  try {
    store.setItem(k, JSON.stringify(v));
  } catch {
    /* storage blocked: skip */
  }
};

function vid(): string {
  let v = read<string>(VID);
  if (!v || !/^[a-f0-9]{16,32}$/.test(v)) {
    v = hex();
    write(VID, v);
  }
  return v;
}

/** The random first-party browser id, only once the visitor allowed Analytics (experiments assign arms from it). */
export function consentedBrowserId(): string | null {
  try {
    return consentAllows("analytics") ? vid() : null;
  } catch {
    return null;
  }
}

/** Coarse device class from the viewport width only (no user agent, no screen fingerprint). */
const device = () => {
  try {
    return window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop";
  } catch {
    return undefined;
  }
};

function send(body: Record<string, unknown>) {
  try {
    const data = JSON.stringify({ ...body, dev: device() });
    if (navigator.sendBeacon?.("/api/seo/event", new Blob([data], { type: "application/json" }))) return;
    void fetch("/api/seo/event", { method: "POST", headers: { "content-type": "application/json" }, body: data, keepalive: true });
  } catch {
    /* measurement must never break the page */
  }
}

/** Call on marketing pages after consent: remembers the first public page of this visit and reports it once per session. */
export function captureLanding(pathname: string, search: string) {
  if (!consentAllows("analytics")) return;
  const q = new URLSearchParams(search);
  const known = read<Landing>(LP);
  const fresh = !known || Date.now() - known.t > LP_MAX_AGE || known.p === "(unknown)";
  const src = classifySource(document.referrer, location.hostname);
  const lp: Landing = fresh
    ? { p: pathname.replace(/\/$/, "") || "/", s: src, u: q.get("utm_source")?.slice(0, 40) || undefined, c: q.get("utm_campaign")?.slice(0, 60) || undefined, t: Date.now() }
    : known;
  if (fresh) write(LP, lp);
  // One landing_view per browser session, and only when this page is really the session's entry (not an in-site click).
  if (!sessionStorage.getItem(SESSION_LV) && src !== "internal") {
    try {
      sessionStorage.setItem(SESSION_LV, "1");
    } catch {
      /* ignore */
    }
    send({ e: "landing_view", landing: pathname.replace(/\/$/, "") || "/", src, vid: vid(), utmSource: q.get("utm_source")?.slice(0, 40) || undefined, utmCampaign: q.get("utm_campaign")?.slice(0, 60) || undefined });
  }
}

/** Report a funnel step, attributed to the stored landing page. One-time milestones are reported once per browser. */
export function seoTrack(event: SeoEvent, extra: { where?: string; level?: string } = {}) {
  try {
    seoTrackInner(event, extra);
  } catch {
    /* measurement must never break the page */
  }
}

function seoTrackInner(event: SeoEvent, extra: { where?: string; level?: string }) {
  if (typeof window === "undefined" || !consentAllows("analytics")) return;
  if (ONCE.includes(event)) {
    const done = read<string[]>(DONE) ?? [];
    if (done.includes(event)) return;
    write(DONE, [...done, event]);
  }
  const lp = read<Landing>(LP);
  send({ e: event, landing: lp?.p ?? "(unknown)", src: lp?.s ?? "other", vid: vid(), utmSource: lp?.u, utmCampaign: lp?.c, ...extra });
}
