"use client";
/**
 * Funnel events. Vercel Web Analytics is cookie-free and aggregate; events here carry only a name, the page or
 * placement, and campaign tags. Never put a question, an email or any account detail in an event.
 */
import { track as vercelTrack } from "@vercel/analytics";
import { consentAllows } from "./consent";
import { parseUtm } from "./utm";
import { seoTrack } from "./seo-events";

export type FunnelEvent = "cta_click" | "try_submit" | "example_click" | "plan_click" | "signup_view" | "pricing_view" | "faq_open" | "checkout_complete" | "download_click" | "pricing_context";

export function track(event: FunnelEvent, props: Record<string, string | number | boolean> = {}) {
  if (!consentAllows("analytics")) return; // no events without the visitor's consent
  if (event === "cta_click" && typeof props.where === "string") seoTrack("cta_click", { where: props.where.toLowerCase().replace(/[^a-z0-9:_-]/g, "").slice(0, 48) }); // first-party funnel (own try/catch inside)
  try {
    let raw = "";
    try {
      raw = sessionStorage.getItem("keplar_utm") ?? "";
    } catch {
      /* ignore */
    }
    vercelTrack(event, { ...props, ...parseUtm(raw) });
  } catch {
    /* analytics must never break the page */
  }
}
