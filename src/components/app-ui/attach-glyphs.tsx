/**
 * Glyphs for what Keplar reads (16 px grid, 1.4 px hairline, same drawing rules as icons.tsx). Decorative.
 */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
const G = ({ size = 16, children, ...rest }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
    {children}
  </svg>
);

export const GlyphLink = (p: P) => <G {...p}><path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2-2a2.6 2.6 0 0 0-3.7-3.7l-.6.6" /><path d="M9.2 6.8a2.6 2.6 0 0 0-3.7 0l-2 2a2.6 2.6 0 0 0 3.7 3.7l.6-.6" /></G>;
export const GlyphImage = (p: P) => <G {...p}><rect x="2.5" y="3" width="11" height="10" rx="1.5" /><circle cx="6" cy="6.5" r="1.1" /><path d="m3 12 3.6-3.4 2.4 2.2 1.8-1.6L13 11.4" /></G>;
export const GlyphVideo = (p: P) => <G {...p}><rect x="2.5" y="3.5" width="8.5" height="9" rx="1.5" /><path d="m11 6.6 2.5-1.6v6l-2.5-1.6" /></G>;
export const GlyphAudio = (p: P) => <G {...p}><path d="M3 7v2M5.5 5v6M8 3v10M10.5 5.5v5M13 7v2" /></G>;
export const GlyphDoc = (p: P) => <G {...p}><path d="M4 2.5h5l3 3v8H4z" /><path d="M9 2.5v3h3M6 8.5h4M6 11h3" /></G>;
export const GlyphCode = (p: P) => <G {...p}><path d="m5.5 5-3 3 3 3M10.5 5l3 3-3 3M9 3.5 7 12.5" /></G>;
export const GlyphData = (p: P) => <G {...p}><rect x="2.5" y="3" width="11" height="10" rx="1.2" /><path d="M2.5 6.5h11M2.5 9.8h11M6.5 3v10" /></G>;
export const GlyphUpload = (p: P) => <G {...p}><path d="M8 10.5V3M5 5.8 8 2.8l3 3" /><path d="M3 9.5v3a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3" /></G>;
export const GlyphCamera = (p: P) => <G {...p}><path d="M2.5 5.5a1 1 0 0 1 1-1h1.8l1-1.5h3.4l1 1.5h1.8a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z" /><circle cx="8" cy="8.3" r="2.1" /></G>;
export const GlyphWarn = (p: P) => <G {...p}><path d="M8 2.8 14 13H2z" /><path d="M8 6.8v2.6M8 11.2v.1" /></G>;

export const GLYPH: Record<string, (p: P) => React.JSX.Element> = { link: GlyphLink, image: GlyphImage, video: GlyphVideo, audio: GlyphAudio, pdf: GlyphDoc, docx: GlyphDoc, pptx: GlyphDoc, rtf: GlyphDoc, text: GlyphDoc, code: GlyphCode, zip: GlyphCode, csv: GlyphData, xlsx: GlyphData, json: GlyphData };
