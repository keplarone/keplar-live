/**
 * The Create card's mini look picker and domains panel, as pure helpers (unit-tested): the font pairings and colors an app can
 * switch to with PATCH /api/apps/[id]/theme (no model, no credits), and what the domains panel may offer for a site given
 * /api/domains (plan allowance, server set-up, published or not). The server stays the gate: these only decide what to show.
 */
import { FONT_PAIRINGS } from "@/lib/app-builder/design/presets";
import { normalizeDesign, tokensFor } from "@/lib/app-builder/design/tokens";

export type FontChoice = { id: string; label: string; title: string };

/** Every pairing the app builder knows, labeled by its display face ("Fraunces"), with the full pair as the hover text. */
export const FONT_CHOICES: FontChoice[] = FONT_PAIRINGS.map((f) => ({ id: f.id, label: f.displayName, title: f.name }));

const HEX = /^#[0-9a-f]{6}$/i;

/** The background and accent the app shows now: its picked palette, or the style's own colors for its mode. */
export function currentColors(design: unknown): { bg: string; accent: string } {
  const p = tokensFor(normalizeDesign(design)).palette;
  return { bg: p.bg.toLowerCase(), accent: p.accent.toLowerCase() };
}

/** The theme PATCH for new colors (ink, surface and muted are derived for contrast), or null when invalid or unchanged. */
export function colorPatch(design: unknown, bg: string, accent: string): { palette: { bg: string; accent: string }; paletteSource: "picked" } | null {
  if (!HEX.test(bg) || !HEX.test(accent)) return null;
  const cur = currentColors(design);
  if (cur.bg === bg.toLowerCase() && cur.accent === accent.toLowerCase()) return null;
  return { palette: { bg: bg.toLowerCase(), accent: accent.toLowerCase() }, paletteSource: "picked" };
}

/** Back to the style's own colors. */
export const STYLE_COLORS = { palette: null, paletteSource: "style" } as const;

export type DomainListing = { domains: { id: string; hostname: string; status: string }[]; limit: number; used: number; plan: string; configured: boolean; published: boolean };
export type DomainGate = "free" | "unconfigured" | "unpublished" | "full" | "open";

/** What the panel can offer: the same order of checks as the server's addDomain (plan, set-up, published, allowance). */
export function domainGate(l: DomainListing): DomainGate {
  if (l.limit <= 0) return "free";
  if (!l.configured) return "unconfigured";
  if (!l.published) return "unpublished";
  if (l.used >= l.limit) return "full";
  return "open";
}

/** "https://www.BikeFix.com/shop" -> "www.bikefix.com": what people paste, as a hostname (the server validates it properly). */
export function hostFrom(input: string): string {
  return input.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/\.$/, "");
}
