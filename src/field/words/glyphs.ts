/** 5×7 glyphs. "1" is ink. Used to lay particles into words without a canvas. */
const G: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
};

/** Words the home particles form, in order. The page also says this in real text. */
export const PHRASES = ["KEPLAR", "ASK", "MANY MODELS", "ONE ANSWER", "CREATE", "VERIFY"] as const;

export type WordPoint = { x: number; y: number };

/** Ink pixels for a phrase, centered on the origin. Unknown characters are skipped. */
export function glyphPoints(text: string): WordPoint[] {
  const letters = [...text.toUpperCase()];
  const width = letters.reduce((w, ch) => w + (ch === " " ? 4 : 6), 0);
  let cursor = -width / 2;
  const pts: WordPoint[] = [];
  for (const ch of letters) {
    if (ch === " ") { cursor += 4; continue; }
    const rows = G[ch];
    if (!rows) { cursor += 6; continue; }
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) if (row[x] === "1") pts.push({ x: cursor + x, y: 3 - y });
    }
    cursor += 6;
  }
  return pts;
}

export type ParticleTarget = { x: number; y: number; z: number; aura: boolean };

/**
 * Lay `count` particles onto the phrase. Most sit on the letters, with a small jitter.
 * The last `aura` particles rest on a ring around the word.
 */
export function targetsFor(text: string, count: number, aura: number): ParticleTarget[] {
  const ink = glyphPoints(text);
  const body = Math.max(0, count - aura);
  const out: ParticleTarget[] = [];
  const scale = 0.11;
  const drop = 0.42;
  for (let i = 0; i < body; i++) {
    const p = ink.length ? ink[i % ink.length] : { x: 0, y: 0 };
    const jx = ((i * 17) % 7) - 3;
    const jy = ((i * 13) % 7) - 3;
    out.push({ x: p.x * scale + jx * 0.012, y: p.y * scale + jy * 0.012 - drop, z: ((i * 3) % 5) * 0.02, aura: false });
  }
  for (let i = 0; i < aura; i++) {
    const a = (i / Math.max(1, aura)) * Math.PI * 2;
    out.push({ x: Math.cos(a) * 1.7, y: Math.sin(a) * 0.48 - drop, z: 0.15, aura: true });
  }
  return out;
}
