/**
 * Deck colour palettes, shared by the live preview (CSS variables), the PPTX and the PDF export. Hex without "#".
 * Brand rule: no blue or purple. Accents are amber (Dark / Light) and greys; the Keplar theme is monochrome (as in the product videos).
 */
import type { DeckTheme } from "./types";

export type Palette = { bg: string; ink: string; muted: string; accent: string; accent2: string; panel: string; line: string };

export const PALETTES: Record<DeckTheme, Palette> = {
  dark: { bg: "0B0B0D", ink: "EDEDF0", muted: "9A9CA3", accent: "F0C060", accent2: "A4A6AD", panel: "17171B", line: "2A2A30" },
  // C8873A in the videos; a shade deeper so the small amber section labels keep 3.7:1 on white.
  light: { bg: "FFFFFF", ink: "09090B", muted: "62646A", accent: "B5762F", accent2: "6F7178", panel: "F2F3F5", line: "DADBDF" },
  brand: { bg: "09090B", ink: "FFFFFF", muted: "B4B6BD", accent: "EDEDF0", accent2: "8B8D94", panel: "16161A", line: "34343C" },
};

export const paletteVars = (t: DeckTheme): Record<string, string> => {
  const p = PALETTES[t];
  return { "--sl-bg": `#${p.bg}`, "--sl-ink": `#${p.ink}`, "--sl-muted": `#${p.muted}`, "--sl-accent": `#${p.accent}`, "--sl-accent2": `#${p.accent2}`, "--sl-panel": `#${p.panel}`, "--sl-line": `#${p.line}` };
};
