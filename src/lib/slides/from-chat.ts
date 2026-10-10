/**
 * A deck request from a chat message (the composer's Slides chip). The message is the brief: a short one is the topic, a long one
 * keeps its first sentence as the topic and the whole message as the outline. "a 6-slide deck" / "10 slides" sets the count.
 * Values are clamped to what the Slides API accepts (the server clamps again).
 */
import { FIELD_MAX } from "./types";

export const DEFAULT_SLIDES = 8;

export function slidesCountFrom(text: string, maxSlides: number): number {
  const m = /\b(\d{1,2})\s*(?:-|\s)?\s*(?:slides?|pages?)\b/i.exec(text);
  const n = m ? Number(m[1]) : DEFAULT_SLIDES;
  return Math.min(Math.max(3, maxSlides), Math.max(3, Math.round(n)));
}

export function deckRequestFrom(prompt: string, maxSlides: number): { topic: string; outline: string; count: number } {
  const text = prompt.replace(/\s+/g, " ").trim();
  const count = slidesCountFrom(text, maxSlides);
  if (text.length <= FIELD_MAX.topic) return { topic: text, outline: "", count };
  const first = /^(.{3,}?[.!?])\s/.exec(text)?.[1] ?? "";
  const topic = (first && first.length <= FIELD_MAX.topic ? first : text.slice(0, FIELD_MAX.topic)).trim();
  return { topic, outline: prompt.trim().slice(0, 6000), count };
}
