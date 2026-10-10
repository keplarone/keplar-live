/** Small colour helpers (hex only): WCAG contrast, mixing, and nudging a colour until it is readable on a background. */

export type RGB = [number, number, number];

export function parseHex(h: string): RGB | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(h.trim());
  if (!m) return null;
  let x = m[1];
  if (x.length === 3) x = x.split("").map((c) => c + c).join("");
  const n = parseInt(x, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const toHex = ([r, g, b]: RGB) => "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

const lin = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
export const luminance = ([r, g, b]: RGB) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

export function contrast(a: string, b: string): number {
  const x = parseHex(a);
  const y = parseHex(b);
  if (!x || !y) return 21;
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a) ?? [0, 0, 0];
  const y = parseHex(b) ?? [255, 255, 255];
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}
export function hslToRgb(h: number, s: number, l: number): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
export const hueOf = (hex: string) => rgbToHsl(parseHex(hex) ?? [0, 0, 0])[0];

/**
 * Moves `fg` toward black or white (whichever direction helps) in small steps until it reaches `min` contrast on `bg`.
 * Keeps hue. Returns the original when it already passes.
 */
export function ensureContrast(fg: string, bg: string, min: number): string {
  if (contrast(fg, bg) >= min) return fg;
  const rgb = parseHex(fg) ?? [0, 0, 0];
  const [h, s, l0] = rgbToHsl(rgb);
  const bgLum = luminance(parseHex(bg) ?? [255, 255, 255]);
  const dir = bgLum > 0.4 ? -1 : 1;
  let l = l0;
  for (let i = 0; i < 80; i++) {
    l = Math.max(0, Math.min(1, l + dir * 0.01));
    const out = toHex(hslToRgb(h, s, l));
    if (contrast(out, bg) >= min) return out;
  }
  return dir < 0 ? "#000000" : "#ffffff";
}

/** Black or white, whichever reads better on `bg`. */
export const readableOn = (bg: string) => (contrast("#0c0c0c", bg) >= contrast("#ffffff", bg) ? "#0c0c0c" : "#ffffff");
