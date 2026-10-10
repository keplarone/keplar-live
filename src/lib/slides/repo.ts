/** Decks per user, in the store (Neon in production). Every row is scoped by workspaceId. */
import { collection } from "@/lib/create/platform/store";
import { id, now } from "@/lib/create/platform/ids";
import { clean } from "@/lib/tools/json";
import { normalizeSlide } from "./engine";
import { FIELD_MAX, type Deck, type DeckStyle, type DeckTheme, type Slide } from "./types";

export const decks = () => collection<Deck>("slide_decks");

const STYLE_IDS = new Set<DeckStyle>(["clean", "bold", "academic", "storytelling"]);
const THEME_IDS = new Set<DeckTheme>(["dark", "light", "brand"]);
export const isStyle = (v: unknown): v is DeckStyle => STYLE_IDS.has(v as DeckStyle);
export const isTheme = (v: unknown): v is DeckTheme => THEME_IDS.has(v as DeckTheme);

export function newDeck(workspaceId: string, input: { title: string; topic: string; style: DeckStyle; theme: DeckTheme; slides: Slide[]; model?: string; credits: number }): Deck {
  const t = now();
  return { id: id("deck"), workspaceId, title: input.title, topic: input.topic, style: input.style, theme: input.theme, slides: input.slides, model: input.model, credits: input.credits, createdAt: t, updatedAt: t };
}

/** Slides from the editor (untrusted): validated, trimmed, capped. Keeps ids that look like ids so edits stay stable. */
export function sanitizeSlides(raw: unknown, max: number): Slide[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Slide[] = [];
  const seen = new Set<string>();
  for (const r of raw.slice(0, max)) {
    const s = normalizeSlide(r);
    if (!s) continue;
    const given = (r as { id?: unknown }).id;
    if (typeof given === "string" && /^[A-Za-z0-9_-]{3,40}$/.test(given) && !seen.has(given)) s.id = given;
    seen.add(s.id);
    out.push(s);
  }
  return out.length ? out : null;
}

export const cleanTitle = (v: unknown, fallback: string) => clean(v, FIELD_MAX.title) || fallback;
