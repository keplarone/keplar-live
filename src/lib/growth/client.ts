"use client";
/**
 * Browser side of the product events (server side: ./events.ts). A no-op unless the visitor allowed Analytics in the cookie banner.
 * Uses the same random per-browser id as the search measurement (`keplar_vid`, no link to an account). Never reads or sends
 * prompt or answer text.
 */
import { consentAllows } from "@/lib/consent";
import type { AnswerAction, GrowthEvent } from "./events";

const VID = "keplar_vid";

const hex = (n: number) => {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return [...a].map((x) => x.toString(16).padStart(2, "0")).join("");
};

function vid(): string | null {
  try {
    let v = localStorage.getItem(VID);
    if (v) {
      try {
        v = JSON.parse(v) as string;
      } catch {
        /* plain string */
      }
    }
    if (!v || !/^[a-f0-9]{16,32}$/.test(v)) {
      v = hex(12);
      localStorage.setItem(VID, JSON.stringify(v));
    }
    return v;
  } catch {
    return null;
  }
}

export type GrowthProps = { aid?: string; mode?: "single" | "consensus"; secs?: number; consulted?: number; responded?: number; disagreed?: boolean; action?: AnswerAction; kind?: string; tier?: "free" | "paid" };

export function growthTrack(event: GrowthEvent, props: GrowthProps = {}) {
  try {
    if (!consentAllows("analytics")) return;
    const v = vid();
    if (!v) return;
    const data = JSON.stringify({ e: event, vid: v, ...props });
    if (navigator.sendBeacon?.("/api/growth/event", new Blob([data], { type: "application/json" }))) return;
    void fetch("/api/growth/event", { method: "POST", headers: { "content-type": "application/json" }, body: data, keepalive: true });
  } catch {
    /* measurement must never break the page */
  }
}

/** Ask ids are derived from the message id so a start and its finish pair up without storing anything else. */
export const askId = (messageId: string) => messageId.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(-24) || "ask";
