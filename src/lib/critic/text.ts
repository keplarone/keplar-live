/** Offsets ↔ line/column, and small text helpers shared by the rules. */
export class LineIndex {
  private starts: number[] = [0];
  constructor(public src: string) {
    for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) this.starts.push(i + 1);
  }
  pos(offset: number): { line: number; col: number } {
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, col: offset - this.starts[lo] + 1 };
  }
  lineText(line: number) {
    const s = this.starts[line - 1] ?? 0;
    const e = this.starts[line] ?? this.src.length + 1;
    return this.src.slice(s, e - 1);
  }
  lineStart(line: number) { return this.starts[line - 1] ?? 0; }
}

export const clip = (s: string, n = 120) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** Human words from a file name, class or id: "hero-photo_2.jpg" → "Hero photo". */
export function wordsFrom(s: string): string {
  const base = s.split(/[?#]/)[0].split("/").pop() ?? "";
  const w = base.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_.]+/g, " ").replace(/\b(img|image|icon|ico|btn|button|pic|photo|final|copy|v\d+|\d+|keplar|slot)\b/gi, " ").replace(/\s+/g, " ").trim();
  return w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : "";
}

export const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
