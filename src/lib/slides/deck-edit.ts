/**
 * Hand edits to a saved deck (the chat's Slides card and anything else that edits without the model): change a slide's text and
 * speaker notes, move a slide, delete one. Pure, so the card can show the result at once and PUT /api/slides/decks/[id] the same
 * slides; the limits match the server's sanitizeSlides (FIELD_MAX, at least one slide), so what the card shows is what is saved.
 */
import { FIELD_MAX, type Slide } from "./types";

const clamp = (v: string, max: number) => v.replace(/\s+/g, " ").trim().slice(0, max);

/** One bullet per line; list markers are dropped, empty lines skipped, at most FIELD_MAX.bullets. */
export function bulletsFromText(text: string): string[] {
  return text
    .split("\n")
    .map((b) => clamp(b.replace(/^\s*(?:[-*•]|\d{1,2}[.)])\s+/, ""), FIELD_MAX.bullet))
    .filter(Boolean)
    .slice(0, FIELD_MAX.bullets);
}

export const bulletsToText = (bullets: string[]) => bullets.join("\n");

export type SlideText = { title: string; bullets: string; notes: string };

/** The slide with new text; notes keep their line breaks. Null when the slide would be left with neither a title nor a bullet. */
export function editSlide(slide: Slide, text: SlideText): Slide | null {
  const title = clamp(text.title, FIELD_MAX.title);
  const bullets = bulletsFromText(text.bullets);
  if (!title && !bullets.length) return null;
  const notes = text.notes.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, FIELD_MAX.notes);
  return { ...slide, title, bullets, notes };
}

/** Same edit, applied in the deck; the original array when nothing changed. */
export function withSlideText(slides: Slide[], index: number, text: SlideText): { slides: Slide[]; error?: string } {
  const cur = slides[index];
  if (!cur) return { slides, error: "That slide is not in the deck any more." };
  const next = editSlide(cur, text);
  if (!next) return { slides, error: "A slide needs a title or at least one bullet." };
  if (next.title === cur.title && next.notes === cur.notes && next.bullets.join("\n") === cur.bullets.join("\n")) return { slides };
  return { slides: slides.map((s, i) => (i === index ? next : s)) };
}

/** Moves the slide at `from` to position `to` (both 0-based, clamped into the deck). */
export function moveSlide(slides: Slide[], from: number, to: number): Slide[] {
  if (from < 0 || from >= slides.length) return slides;
  const dest = Math.max(0, Math.min(slides.length - 1, to));
  if (dest === from) return slides;
  const next = slides.slice();
  const [it] = next.splice(from, 1);
  next.splice(dest, 0, it);
  return next;
}

/** The deck without slide `index`; null when it is the only slide (a deck keeps at least one). */
export function removeSlide(slides: Slide[], index: number): Slide[] | null {
  if (index < 0 || index >= slides.length || slides.length <= 1) return null;
  return slides.filter((_, i) => i !== index);
}
