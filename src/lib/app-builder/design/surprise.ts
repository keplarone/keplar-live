/**
 * "Surprise me" and "extract the palette": a distinctive, coherent art direction for a given idea.
 * The model proposes; this file validates everything (style id, fonts id, hex colors) and contrast is enforced later by
 * tokens.ts. Without a model (or when it fails) a seeded deterministic generator still gives a coherent, non-default result.
 */
import { createHash } from "node:crypto";
import { hslToRgb, toHex } from "@/lib/site-builder/color";
import type { PlanId } from "@/lib/create/platform/plans";
import { chainFor } from "../models";
import { llm, parseJsonObject } from "../llm";
import { STYLE_IDS, type DesignChoice, type Palette } from "../types";
import { FONT_PAIRINGS, STYLES, styleById } from "./presets";
import { normalizeDesign, normalizePalette } from "./tokens";

/** Seeded random in [0,1). */
function rng(seed: string) {
  let h = createHash("sha256").update(seed).digest();
  let i = 0;
  return () => {
    if (i + 4 > h.length) {
      h = createHash("sha256").update(h).digest();
      i = 0;
    }
    const v = h.readUInt32BE(i) / 2 ** 32;
    i += 4;
    return v;
  };
}

const hsl = (h: number, s: number, l: number) => toHex(hslToRgb(((h % 360) + 360) % 360, s, l));

/** Harmonious palette from a hue and a mood (dark or light). Contrast is fixed later. */
export function paletteFromHue(h: number, dark: boolean, r: () => number): Palette {
  const scheme = Math.floor(r() * 4); // 0 complementary, 1 split, 2 analogous, 3 triadic
  const h2 = scheme === 0 ? h + 180 : scheme === 1 ? h + 150 : scheme === 2 ? h + 35 : h + 120;
  const tint = 0.06 + r() * 0.14;
  return dark
    ? { bg: hsl(h, tint + 0.1, 0.05 + r() * 0.04), surface: hsl(h, tint + 0.08, 0.1 + r() * 0.03), ink: hsl(h, 0.15, 0.93), muted: hsl(h, 0.1, 0.66), accent: hsl(h2, 0.75 + r() * 0.2, 0.58 + r() * 0.08), accent2: hsl(h, 0.55, 0.7) }
    : { bg: hsl(h, tint + 0.15, 0.93 + r() * 0.04), surface: hsl(h, tint, 0.985), ink: hsl(h, 0.3, 0.09), muted: hsl(h, 0.12, 0.38), accent: hsl(h2, 0.7 + r() * 0.25, 0.42 + r() * 0.1), accent2: hsl(h + 200, 0.45, 0.32) };
}

export function surpriseDeterministic(seed: string): DesignChoice {
  const r = rng(seed);
  const style = STYLES[Math.floor(r() * STYLES.length)];
  const dark = r() < 0.45;
  const fonts = r() < 0.6 ? style.fonts : FONT_PAIRINGS[Math.floor(r() * FONT_PAIRINGS.length)].id;
  return normalizeDesign({
    style: style.id,
    mode: dark ? "dark" : "light",
    palette: paletteFromHue(Math.floor(r() * 360), dark, r),
    paletteSource: "surprise",
    fonts,
    density: style.density,
    shape: style.shape,
    motion: style.motion,
    notes: "",
    direction: `${style.name} with a ${dark ? "dark" : "light"} ground. ${style.character}`,
  });
}

const DESIGN_PROMPT = (idea: string, notes: string) => `You are an award-winning art director. Invent ONE distinctive, coherent art direction for this product. Never generic: no default blue SaaS, no purple gradient blobs, no "clean modern" filler. The look must come from the subject itself (its culture, materials, era, audience).

Product idea: ${idea.slice(0, 1200)}
${notes ? `The owner's notes about the look: ${notes.slice(0, 500)}` : ""}

Allowed style ids: ${STYLE_IDS.join(", ")}.
Allowed font pairing ids: ${FONT_PAIRINGS.map((f) => `${f.id} (${f.name})`).join(", ")}.

Reply with one JSON object only:
{"style":"<style id>","mode":"light|dark","fonts":"<font pairing id>","palette":{"bg":"#RRGGBB","surface":"#RRGGBB","ink":"#RRGGBB","muted":"#RRGGBB","accent":"#RRGGBB","accent2":"#RRGGBB"},"shape":"sharp|soft|round|pill","density":"airy|balanced|dense","motion":"none|subtle|expressive","direction":"<3-4 concrete sentences: the visual concept, signature details (one memorable motif), imagery style, and how type and color are used>"}`;

export async function surpriseFor(plan: PlanId, idea: string, notes = "", seed = idea): Promise<{ design: DesignChoice; usd: number; model: string | null }> {
  try {
    const r = await llm(chainFor(plan, "design"), [{ role: "user", content: DESIGN_PROMPT(idea || "a distinctive personal website", notes) }], {
      maxTokens: 900,
      temperature: 0.95,
      deadline: Date.now() + 40_000,
      json: true,
      accept: (t) => Boolean(normalizePalette(parseJsonObject<Record<string, unknown>>(t)?.palette)),
    });
    const j = parseJsonObject<Record<string, unknown>>(r.text)!;
    const design = normalizeDesign({ ...j, paletteSource: "surprise", notes });
    if (!design.direction) design.direction = styleById(design.style).character;
    return { design, usd: r.usd, model: r.model.id };
  } catch {
    return { design: { ...surpriseDeterministic(seed + Date.now()), notes }, usd: 0, model: null };
  }
}

const PALETTE_PROMPT = (what: string) => `Derive a website color palette from this description of a brand, mood or image. Keep the colors the description names or implies (do not substitute "safe" defaults). Reply with one JSON object only:
{"mode":"light|dark","palette":{"bg":"#RRGGBB","surface":"#RRGGBB","ink":"#RRGGBB","muted":"#RRGGBB","accent":"#RRGGBB","accent2":"#RRGGBB"},"why":"<one sentence>"}

Description: ${what.slice(0, 800)}`;

/** Palette from words ("forest at dawn", "our brand is #0B3D2E and cream") or from an image (data URL, JPEG/PNG/WebP). */
export async function extractPalette(plan: PlanId, input: { text?: string; imageDataUrl?: string }): Promise<{ palette: Palette; mode: "light" | "dark"; why: string; usd: number }> {
  const content: unknown[] = input.imageDataUrl
    ? [{ type: "text", text: PALETTE_PROMPT(input.text || "the attached image: take the dominant and accent colors from it") }, { type: "image_url", image_url: { url: input.imageDataUrl } }]
    : [{ type: "text", text: PALETTE_PROMPT(input.text ?? "") }];
  // Explicit hex codes in the text win without a model call.
  const hexes = (input.text ?? "").match(/#[0-9a-f]{6}\b/gi) ?? [];
  if (!input.imageDataUrl && hexes.length >= 2) {
    const [a, b, c] = hexes;
    const p = normalizePalette({ bg: b, accent: a, accent2: c ?? a });
    if (p) return { palette: p, mode: "light", why: "Taken from the colors you gave.", usd: 0 };
  }
  const r = await llm(chainFor(plan, input.imageDataUrl ? "vision" : "design"), [{ role: "user", content }], {
    maxTokens: 500,
    temperature: 0.4,
    deadline: Date.now() + 40_000,
    json: true,
    accept: (t) => Boolean(normalizePalette(parseJsonObject<Record<string, unknown>>(t)?.palette)),
  });
  const j = parseJsonObject<Record<string, unknown>>(r.text)!;
  return { palette: normalizePalette(j.palette)!, mode: j.mode === "dark" ? "dark" : "light", why: String(j.why ?? "").slice(0, 200), usd: r.usd };
}
