/**
 * Cookie consent. Real gating, not cosmetic.
 *
 * Categories that actually exist:
 *  - essential  (always on, no choice): sign-in session, security, plan + usage counters, theme, this consent record
 *  - analytics  (optional, OFF until the visitor accepts): Vercel Web Analytics + Speed Insights and funnel events
 *
 * Add a category to CATEGORIES (and bump nothing else): CONSENT_VERSION is derived from the list, so everyone is
 * asked again when the categories change. The record is also re-asked after 12 months.
 * Stored first-party in a cookie (`keplar_consent`, 12 months, SameSite=Lax) and mirrored in localStorage.
 */
export const CATEGORIES = ["analytics"] as const;
export type ConsentCategory = (typeof CATEGORIES)[number];

export const CONSENT_COOKIE = "keplar_consent";
export const CONSENT_EVENT = "keplar:consent";
export const CONSENT_OPEN_EVENT = "keplar:consent-open";
export const CONSENT_MAX_AGE_MS = 365 * 864e5;

/** Changes whenever the category list changes. */
export const CONSENT_VERSION = `v1-${CATEGORIES.join("+")}`;

export type ConsentRecord = { version: string; at: number; choices: Record<ConsentCategory, boolean> };

export const rejectAll = (): Record<ConsentCategory, boolean> => ({ analytics: false });
export const acceptAll = (): Record<ConsentCategory, boolean> => ({ analytics: true });

export function makeRecord(choices: Record<ConsentCategory, boolean>, at = Date.now()): ConsentRecord {
  return { version: CONSENT_VERSION, at, choices: { analytics: choices.analytics === true } };
}

export function serialize(r: ConsentRecord): string {
  return encodeURIComponent(JSON.stringify(r));
}

/** Parses a stored record; returns null when it is malformed, from another category list, or older than 12 months. */
export function parseRecord(raw: string | null | undefined, now = Date.now()): ConsentRecord | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(decodeURIComponent(raw)) as Partial<ConsentRecord>;
    if (!r || r.version !== CONSENT_VERSION || typeof r.at !== "number" || !r.choices || typeof r.choices !== "object") return null;
    if (r.at > now + 864e5 || now - r.at > CONSENT_MAX_AGE_MS) return null;
    return { version: r.version, at: r.at, choices: { analytics: (r.choices as Record<string, unknown>).analytics === true } };
  } catch {
    return null;
  }
}

export const allows = (r: ConsentRecord | null, cat: ConsentCategory) => Boolean(r?.choices[cat]);

/* ── browser side ── */

export function readConsent(): ConsentRecord | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${CONSENT_COOKIE}=([^;]*)`));
  let rec = parseRecord(m?.[1]);
  if (!rec) {
    try {
      rec = parseRecord(localStorage.getItem(CONSENT_COOKIE));
    } catch {
      /* storage blocked */
    }
  }
  return rec;
}

export function saveConsent(choices: Record<ConsentCategory, boolean>): ConsentRecord {
  const rec = makeRecord(choices);
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${serialize(rec)}; Path=/; Max-Age=${Math.floor(CONSENT_MAX_AGE_MS / 1000)}; SameSite=Lax${secure}`;
  try {
    localStorage.setItem(CONSENT_COOKIE, serialize(rec));
  } catch {
    /* storage blocked */
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: rec }));
  return rec;
}

/** Opens the banner in "customize" mode (footer link, Settings). */
export const openCookieSettings = () => window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));

/** True when the visitor allowed this category. Used to gate scripts and events. */
export const consentAllows = (cat: ConsentCategory) => allows(readConsent(), cat);
