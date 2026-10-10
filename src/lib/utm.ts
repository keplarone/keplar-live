"use client";
/**
 * Campaign tags (utm_*) survive the visit: they are kept in sessionStorage (this tab only, gone when it closes),
 * appended to Keplar's own sign-up / app / pricing links, and sent with funnel events. Nothing identifies a person.
 */
import { useSyncExternalStore } from "react";

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
const KEY = "keplar_utm";
const listeners = new Set<() => void>();

function read(): string {
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

/** Save utm_* from the current URL, if it has any. Call once per page load. */
export function captureUtm(search: string = typeof window === "undefined" ? "" : window.location.search) {
  const q = new URLSearchParams(search);
  const found: Record<string, string> = {};
  for (const k of UTM_KEYS) {
    const v = q.get(k);
    if (v) found[k] = v.slice(0, 100);
  }
  if (!Object.keys(found).length) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(found));
  } catch {
    /* storage blocked: skip */
  }
  listeners.forEach((l) => l());
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

/** The stored tags as a JSON string ("" when none, and on the server). */
export function useUtmRaw(): string {
  return useSyncExternalStore(subscribe, read, () => "");
}

export function parseUtm(raw: string): Record<string, string> {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(UTM_KEYS.flatMap((k) => (typeof o[k] === "string" ? [[k, o[k] as string]] : [])));
  } catch {
    return {};
  }
}

/** Add stored tags to an internal link (keeps any it already has). External or hash-only links are returned as is. */
export function withUtm(href: string, utm: Record<string, string>): string {
  if (!href.startsWith("/") || href.startsWith("//") || !Object.keys(utm).length) return href;
  const [path, hash] = href.split("#");
  const [base, qs = ""] = path.split("?");
  const q = new URLSearchParams(qs);
  for (const [k, v] of Object.entries(utm)) if (!q.has(k)) q.set(k, v);
  const out = `${base}?${q.toString()}`;
  return hash ? `${out}#${hash}` : out;
}
