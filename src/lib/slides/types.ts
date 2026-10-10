/** Slides: shared types (safe for client code). */
export type SlideLayout = "title" | "content" | "section" | "closing";
export type DeckTheme = "dark" | "light" | "brand";
export type DeckStyle = "clean" | "bold" | "academic" | "storytelling";

export type Slide = {
  id: string;
  layout: SlideLayout;
  title: string;
  /** Section the slide belongs to ("" = none). Shown as a small label. */
  section: string;
  bullets: string[];
  notes: string;
  /** Suggested image, as a prompt. Rendered as a placeholder (no image is generated). */
  imagePrompt: string;
};

export type Deck = {
  id: string;
  workspaceId: string;
  title: string;
  topic: string;
  style: DeckStyle;
  theme: DeckTheme;
  slides: Slide[];
  /** Model that wrote the deck. */
  model?: string;
  /** Credits this deck has cost so far (generation + regenerations). */
  credits: number;
  createdAt: string;
  updatedAt: string;
};

export const STYLES: { id: DeckStyle; label: string; hint: string }[] = [
  { id: "clean", label: "Clean", hint: "Short, plain bullets" },
  { id: "bold", label: "Bold", hint: "Punchy statements" },
  { id: "academic", label: "Academic", hint: "Precise, with evidence" },
  { id: "storytelling", label: "Storytelling", hint: "A narrative arc" },
];

export const THEMES: { id: DeckTheme; label: string }[] = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
  { id: "brand", label: "Keplar" },
];

export const FIELD_MAX = { title: 120, section: 60, bullet: 220, bullets: 8, notes: 1200, imagePrompt: 300, topic: 200 } as const;
