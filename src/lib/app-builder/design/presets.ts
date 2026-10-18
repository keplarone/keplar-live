/**
 * Curated art-direction material for generated apps: twelve style directions, typography pairings (Google Fonts, never the
 * default Inter/Roboto/Open Sans look), and per-style palettes for light and dark. Every palette is contrast-checked by
 * tokens.ts before it is used, so a user-picked color can never make text unreadable.
 */
import type { Density, MotionLevel, Palette, Shape, StyleId } from "../types";

export type StylePreset = {
  id: StyleId;
  name: string;
  line: string;
  /** Default font pairing id. */
  fonts: string;
  shape: Shape;
  density: Density;
  motion: MotionLevel;
  light: Palette;
  dark: Palette;
  /** Art direction for the model: what makes this style itself (composition, detail, texture), concretely. */
  character: string;
};

export const STYLES: StylePreset[] = [
  {
    id: "editorial", name: "Editorial", line: "Magazine grids, a serif with attitude, warm paper.", fonts: "fraunces-hanken", shape: "sharp", density: "airy", motion: "subtle",
    light: { bg: "#F4EFE6", surface: "#FBF8F2", ink: "#1D1A16", muted: "#6B645A", accent: "#B4441C", accent2: "#2F4B3A" },
    dark: { bg: "#151311", surface: "#1E1B18", ink: "#EFE8DC", muted: "#A39A8C", accent: "#E07A4F", accent2: "#9DB8A5" },
    character: "Large serif display type with italic emphasis, asymmetric 12-column layouts, narrow text measure beside wide imagery, numbered section labels, hairline rules instead of boxes, pull-quotes, captions under figures. Content reads like a well-art-directed magazine spread.",
  },
  {
    id: "brutalist", name: "Brutalist", line: "Raw grid, heavy borders, loud type, zero decoration.", fonts: "archivo-black-space", shape: "sharp", density: "dense", motion: "none",
    light: { bg: "#F2F0EA", surface: "#FFFFFF", ink: "#0A0A0A", muted: "#4A4A4A", accent: "#FF4A1C", accent2: "#1C3FFF" },
    dark: { bg: "#0B0B0B", surface: "#151515", ink: "#F5F5F0", muted: "#A8A8A0", accent: "#FF5A2E", accent2: "#D7FF3A" },
    character: "Thick 2-3px solid borders, hard offset shadows (no blur), oversized uppercase grotesk, visible grid lines, monospaced metadata, blocks of flat color, buttons that look like stamped labels, intentional misalignment used once. No gradients, no rounded corners, no soft shadows.",
  },
  {
    id: "playful", name: "Playful", line: "Bouncy shapes, chunky type, confident color.", fonts: "bricolage-nunito", shape: "round", density: "balanced", motion: "expressive",
    light: { bg: "#FFF7EC", surface: "#FFFFFF", ink: "#1F1A3A", muted: "#5D5878", accent: "#FF5C8A", accent2: "#2EC4A6" },
    dark: { bg: "#1A1630", surface: "#241F42", ink: "#FFF4E6", muted: "#BDB6DA", accent: "#FF7AA2", accent2: "#5FE3C6" },
    character: "Chunky rounded display type, sticker-like badges with slight rotation, blob or squircle masks on images, springy hover/press feedback, two strong accent colors used in turns, friendly micro-copy, illustrations made from simple SVG shapes. Joyful but organized.",
  },
  {
    id: "luxury", name: "Luxury", line: "Quiet, dark, expensive. Didone type and gold hairlines.", fonts: "bodoni-jost", shape: "sharp", density: "airy", motion: "subtle",
    light: { bg: "#F7F4EF", surface: "#FFFFFF", ink: "#1B1916", muted: "#77705F", accent: "#9A7B3F", accent2: "#3B3530" },
    dark: { bg: "#0D0C0B", surface: "#161412", ink: "#EEE6D6", muted: "#A79E8C", accent: "#C9A45C", accent2: "#7D6A55" },
    character: "Very generous whitespace, letter-spaced small caps labels, thin metallic hairlines, large didone headlines, full-bleed photography, centered or very asymmetric compositions, slow fades. Sparse text, every element precious.",
  },
  {
    id: "minimal", name: "Minimal", line: "Swiss-quiet, precise spacing, one accent.", fonts: "geist-like", shape: "soft", density: "balanced", motion: "subtle",
    light: { bg: "#FAFAF9", surface: "#FFFFFF", ink: "#111111", muted: "#6A6A6A", accent: "#0F766E", accent2: "#111111" },
    dark: { bg: "#0E0F10", surface: "#16181A", ink: "#EDEDED", muted: "#9A9A9A", accent: "#2DD4BF", accent2: "#EDEDED" },
    character: "Precise 8px rhythm, generous margins, crisp sans type with tight tracking on headings, hairline dividers, restrained single accent, content-first layouts with strong alignment. Not empty: dense where the content is (tables, lists), calm elsewhere.",
  },
  {
    id: "retro", name: "Retro", line: "70s/80s print: warm grain, rounded serifs, stripes.", fonts: "recoleta-like", shape: "round", density: "balanced", motion: "subtle",
    light: { bg: "#F3E6CF", surface: "#FBF3E4", ink: "#2B1D14", muted: "#7A5C45", accent: "#D9531E", accent2: "#2E6B5E" },
    dark: { bg: "#21170F", surface: "#2C2017", ink: "#F6E7CD", muted: "#C2A585", accent: "#F07A3A", accent2: "#5FA593" },
    character: "Warm paper tones with a subtle noise texture (CSS), soft rounded serif headlines, sunburst or stripe motifs drawn with CSS gradients (stripes, not blobs), badge seals, offset two-color prints, chunky outlines. Nostalgic but sharp.",
  },
  {
    id: "glassy", name: "Glassy", line: "Translucent layers, depth, light through frosted glass.", fonts: "manrope-mono", shape: "round", density: "balanced", motion: "subtle",
    light: { bg: "#EEF1F5", surface: "#FFFFFF", ink: "#0D1117", muted: "#5B6472", accent: "#6D5DFC", accent2: "#00A3A3" },
    dark: { bg: "#07090D", surface: "#10141B", ink: "#E8EDF5", muted: "#8D98A8", accent: "#8F83FF", accent2: "#3DD6D0" },
    character: "Layered translucent panels (backdrop-filter blur 20px, 1px light borders) over a rich photographic or colored backdrop, soft inner highlights, floating navigation capsule, depth through layering and parallax. Glass only where it creates hierarchy, never everywhere.",
  },
  {
    id: "dimensional", name: "3D", line: "Depth, perspective, objects you could touch.", fonts: "unbounded-inter-tight", shape: "soft", density: "balanced", motion: "expressive",
    light: { bg: "#ECEAE6", surface: "#F8F7F4", ink: "#121212", muted: "#5E5C58", accent: "#FF6A3D", accent2: "#3A5BFF" },
    dark: { bg: "#08080A", surface: "#121216", ink: "#F2F2F2", muted: "#9696A0", accent: "#FF7A4D", accent2: "#7C8CFF" },
    character: "Perspective transforms, layered cards with real depth (stacked shadows), a three.js or CSS 3D hero object tied to the product idea (not a random blob), tilt on pointer (max 6 degrees), lighting-like gradients on surfaces. Use window.THREE when a real 3D scene helps.",
  },
  {
    id: "swiss", name: "Swiss grid", line: "Strict grid, heavy grotesk, one signal color.", fonts: "schibsted", shape: "sharp", density: "dense", motion: "none",
    light: { bg: "#F5F5F2", surface: "#FFFFFF", ink: "#0F0F0F", muted: "#5A5A5A", accent: "#E5391A", accent2: "#0F0F0F" },
    dark: { bg: "#0F0F0F", surface: "#191919", ink: "#F5F5F2", muted: "#A0A0A0", accent: "#FF5436", accent2: "#F5F5F2" },
    character: "Visible 12-column grid, oversized flush-left grotesk, data in aligned tables and rows, small uppercase labels, the accent on exactly one element per screen, rigorous baseline alignment.",
  },
  {
    id: "organic", name: "Organic", line: "Earthy tones, soft forms, natural textures.", fonts: "young-serif-figtree", shape: "round", density: "airy", motion: "subtle",
    light: { bg: "#EFEEE6", surface: "#F8F7F1", ink: "#1E2A22", muted: "#5F6B60", accent: "#4F7A3A", accent2: "#B5673C" },
    dark: { bg: "#121812", surface: "#1A221A", ink: "#E9EDE3", muted: "#A3AF9F", accent: "#8DBF6E", accent2: "#E0955F" },
    character: "Earthy palette, soft organic image masks, generous rounded corners, botanical or material textures, hand-feel serif headings, calm pacing. Avoid floating gradient blobs: use real photography and texture instead.",
  },
  {
    id: "terminal", name: "Terminal", line: "Monospace, phosphor, command-line honesty.", fonts: "jetbrains", shape: "sharp", density: "dense", motion: "subtle",
    light: { bg: "#F1F0E8", surface: "#FFFFFF", ink: "#141414", muted: "#5C5C5C", accent: "#007A3D", accent2: "#B35C00" },
    dark: { bg: "#0A0E0A", surface: "#101710", ink: "#D7F5D0", muted: "#7FA37A", accent: "#4CFF7A", accent2: "#FFB547" },
    character: "Monospace everything, ASCII dividers and box-drawing characters, blinking caret, command prompts as UI affordances, keyboard shortcuts shown inline, status lines, dense information. Hacker-honest, not cosplay.",
  },
  {
    id: "y2k", name: "Y2K", line: "Chrome, pixels and loud optimism.", fonts: "syne-space", shape: "pill", density: "balanced", motion: "expressive",
    light: { bg: "#EDEFFF", surface: "#FFFFFF", ink: "#0E0B2A", muted: "#57527A", accent: "#FF2BD6", accent2: "#00C2FF" },
    dark: { bg: "#0B0A1F", surface: "#15133A", ink: "#F3F0FF", muted: "#A6A0D6", accent: "#FF4FDD", accent2: "#39D7FF" },
    character: "Chrome-like metallic gradients on type or buttons (used once), pixel and star glyphs, pill-shaped controls, bold wide display type, marquee strips, sticker energy. Loud but legible; still one clear hierarchy per screen.",
  },
];

export type FontPairing = { id: string; name: string; display: string; body: string; mono: string; google: string | null; displayName: string; bodyName: string };

const gf = (families: string[]) => `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap`;
const MONO = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace';

export const FONT_PAIRINGS: FontPairing[] = [
  { id: "fraunces-hanken", name: "Fraunces + Hanken Grotesk", displayName: "Fraunces", bodyName: "Hanken Grotesk", display: '"Fraunces", Georgia, serif', body: '"Hanken Grotesk", system-ui, sans-serif', mono: MONO, google: gf(["Fraunces:ital,opsz,wght@0,9..144,300..800;1,9..144,300..700", "Hanken+Grotesk:wght@400;500;600;700", "JetBrains+Mono:wght@400;600"]) },
  { id: "archivo-black-space", name: "Archivo Black + Space Grotesk", displayName: "Archivo Black", bodyName: "Space Grotesk", display: '"Archivo Black", Impact, sans-serif', body: '"Space Grotesk", system-ui, sans-serif', mono: MONO, google: gf(["Archivo+Black", "Space+Grotesk:wght@400;500;700", "JetBrains+Mono:wght@400;600"]) },
  { id: "bricolage-nunito", name: "Bricolage Grotesque + Nunito", displayName: "Bricolage Grotesque", bodyName: "Nunito", display: '"Bricolage Grotesque", system-ui, sans-serif', body: '"Nunito", system-ui, sans-serif', mono: MONO, google: gf(["Bricolage+Grotesque:opsz,wght@12..96,400..800", "Nunito:wght@400;600;700;800", "JetBrains+Mono:wght@400;600"]) },
  { id: "bodoni-jost", name: "Bodoni Moda + Jost", displayName: "Bodoni Moda", bodyName: "Jost", display: '"Bodoni Moda", Didot, Georgia, serif', body: '"Jost", system-ui, sans-serif', mono: MONO, google: gf(["Bodoni+Moda:ital,opsz,wght@0,6..96,400..700;1,6..96,400..600", "Jost:wght@300;400;500;600", "JetBrains+Mono:wght@400;600"]) },
  { id: "geist-like", name: "Geist + Geist Mono", displayName: "Geist", bodyName: "Geist", display: '"Geist", system-ui, sans-serif', body: '"Geist", system-ui, sans-serif', mono: '"Geist Mono", ui-monospace, monospace', google: gf(["Geist:wght@300..800", "Geist+Mono:wght@400;600"]) },
  { id: "recoleta-like", name: "Gloock + DM Sans", displayName: "Gloock", bodyName: "DM Sans", display: '"Gloock", Georgia, serif', body: '"DM Sans", system-ui, sans-serif', mono: MONO, google: gf(["Gloock", "DM+Sans:opsz,wght@9..40,400..700", "JetBrains+Mono:wght@400;600"]) },
  { id: "manrope-mono", name: "Manrope + IBM Plex Mono", displayName: "Manrope", bodyName: "Manrope", display: '"Manrope", system-ui, sans-serif', body: '"Manrope", system-ui, sans-serif', mono: '"IBM Plex Mono", ui-monospace, monospace', google: gf(["Manrope:wght@300..800", "IBM+Plex+Mono:wght@400;500"]) },
  { id: "unbounded-inter-tight", name: "Unbounded + Inter Tight", displayName: "Unbounded", bodyName: "Inter Tight", display: '"Unbounded", system-ui, sans-serif', body: '"Inter Tight", system-ui, sans-serif', mono: MONO, google: gf(["Unbounded:wght@400..800", "Inter+Tight:wght@400;500;600;700", "JetBrains+Mono:wght@400;600"]) },
  { id: "schibsted", name: "Schibsted Grotesk", displayName: "Schibsted Grotesk", bodyName: "Schibsted Grotesk", display: '"Schibsted Grotesk", system-ui, sans-serif', body: '"Schibsted Grotesk", system-ui, sans-serif', mono: MONO, google: gf(["Schibsted+Grotesk:wght@400;500;700;900", "JetBrains+Mono:wght@400;600"]) },
  { id: "young-serif-figtree", name: "Young Serif + Figtree", displayName: "Young Serif", bodyName: "Figtree", display: '"Young Serif", Georgia, serif', body: '"Figtree", system-ui, sans-serif', mono: MONO, google: gf(["Young+Serif", "Figtree:wght@400;500;600;700", "JetBrains+Mono:wght@400;600"]) },
  { id: "jetbrains", name: "JetBrains Mono", displayName: "JetBrains Mono", bodyName: "JetBrains Mono", display: MONO, body: MONO, mono: MONO, google: gf(["JetBrains+Mono:ital,wght@0,400..800;1,400"]) },
  { id: "syne-space", name: "Syne + Space Mono", displayName: "Syne", bodyName: "Space Grotesk", display: '"Syne", system-ui, sans-serif', body: '"Space Grotesk", system-ui, sans-serif', mono: '"Space Mono", ui-monospace, monospace', google: gf(["Syne:wght@500..800", "Space+Grotesk:wght@400;500;700", "Space+Mono:wght@400;700"]) },
  { id: "instrument-serif-sans", name: "Instrument Serif + Instrument Sans", displayName: "Instrument Serif", bodyName: "Instrument Sans", display: '"Instrument Serif", Georgia, serif', body: '"Instrument Sans", system-ui, sans-serif', mono: MONO, google: gf(["Instrument+Serif:ital@0;1", "Instrument+Sans:wght@400;500;600;700", "JetBrains+Mono:wght@400;600"]) },
  { id: "dela-gothic-karla", name: "Dela Gothic One + Karla", displayName: "Dela Gothic One", bodyName: "Karla", display: '"Dela Gothic One", Impact, sans-serif', body: '"Karla", system-ui, sans-serif', mono: MONO, google: gf(["Dela+Gothic+One", "Karla:wght@400;500;700", "JetBrains+Mono:wght@400;600"]) },
  { id: "playfair-sora", name: "Playfair Display + Sora", displayName: "Playfair Display", bodyName: "Sora", display: '"Playfair Display", Georgia, serif', body: '"Sora", system-ui, sans-serif', mono: MONO, google: gf(["Playfair+Display:ital,wght@0,400..900;1,400..700", "Sora:wght@300..700", "JetBrains+Mono:wght@400;600"]) },
  { id: "space-grotesk-plex", name: "Space Grotesk + IBM Plex Sans", displayName: "Space Grotesk", bodyName: "IBM Plex Sans", display: '"Space Grotesk", system-ui, sans-serif', body: '"IBM Plex Sans", system-ui, sans-serif', mono: '"IBM Plex Mono", ui-monospace, monospace', google: gf(["Space+Grotesk:wght@400..700", "IBM+Plex+Sans:wght@400;500;600", "IBM+Plex+Mono:wght@400;500"]) },
];

export const styleById = (id: string | undefined): StylePreset => STYLES.find((s) => s.id === id) ?? STYLES[0];
export const fontsById = (id: string | undefined): FontPairing => FONT_PAIRINGS.find((f) => f.id === id) ?? FONT_PAIRINGS[0];
