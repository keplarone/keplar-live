/**
 * Typography previews in the Create studio (look tiles, design picker). Families listed here have a small self-hosted cut in
 * public/fonts/previews (built by scripts/build-preview-fonts.py) served from Keplar's own origin; any other family in a pairing
 * is loaded from Google Fonts for that pairing only (allowed on /app pages, see lib/security/headers.ts APP_PAGE_CSP).
 * Generated apps load their full families themselves; this is just for drawing a few words in the picker.
 */
export const PREVIEW_FONTS_CSS = "/fonts/previews/previews.css";

export const SELF_HOSTED_PREVIEW_FAMILIES: readonly string[] = [
  "Fraunces", "Hanken Grotesk", "Archivo Black", "Space Grotesk", "Bricolage Grotesque", "Nunito", "Bodoni Moda", "Jost", "Geist", "Gloock",
  "DM Sans", "Manrope", "Unbounded", "Inter Tight", "Figtree", "JetBrains Mono", "Syne", "Instrument Serif", "Instrument Sans", "Dela Gothic One",
  "Karla", "Playfair Display", "Sora", "IBM Plex Sans",
];

/** The first family named in a CSS font stack ('"Fraunces", Georgia, serif' -> "Fraunces"); null for generic-only stacks. */
export function firstFamily(stack: string): string | null {
  const m = /^\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z][\w -]*?))\s*(?:,|$)/.exec(stack);
  const name = (m?.[1] ?? m?.[2] ?? m?.[3] ?? "").trim();
  if (!name || /^(ui-monospace|ui-sans-serif|ui-serif|monospace|serif|sans-serif|system-ui|cursive|fantasy)$/i.test(name)) return null;
  return name;
}

/**
 * Which stylesheets the previews need: always the self-hosted CSS, plus the Google stylesheet of each pairing whose display or
 * body family has no local cut. Pure, so it is unit-tested; the DOM side is ensurePreviewFonts.
 */
export function previewStylesheets(pairings: { displayStack: string; bodyStack: string; google: string | null }[]): string[] {
  const local = new Set(SELF_HOSTED_PREVIEW_FAMILIES);
  const out = [PREVIEW_FONTS_CSS];
  for (const p of pairings) {
    const fams = [firstFamily(p.displayStack), firstFamily(p.bodyStack)].filter((f): f is string => Boolean(f));
    if (p.google && fams.some((f) => !local.has(f)) && !out.includes(p.google)) out.push(p.google);
  }
  return out;
}

/** Adds the preview stylesheets to the page once (browser only). Faces download only when text actually uses them. */
export function ensurePreviewFonts(pairings: { displayStack: string; bodyStack: string; google: string | null }[]) {
  if (typeof document === "undefined") return;
  for (const href of previewStylesheets(pairings)) {
    if (document.head.querySelector(`link[data-kpf="${CSS.escape(href)}"]`)) continue;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.dataset.kpf = href;
    document.head.appendChild(l);
  }
}
