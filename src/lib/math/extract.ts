/**
 * Math delimiters in model answers: \( \) and $...$ inline, \[ \] and $$ $$ display. Pure (no DOM, no KaTeX).
 *
 * `maskMath` swaps every complete math span for a private-use placeholder so the Markdown parser never sees it (math
 * is full of `_`, `*`, `|` and line-leading `-`/`1.` that would otherwise be mangled), and leaves code alone: fenced
 * blocks, inline code, `\$` escapes. Currency is not math: a single `$` only opens math when the next character is not
 * whitespace and closes at the first following `$` that has no whitespace before it and no digit after it, so "$5 and
 * $10" and "between $5-$10" stay text. While streaming, an open delimiter with no closer yet is cut from the visible
 * text (it appears when it completes) so raw LaTeX never flashes.
 */
export type MathItem = { tex: string; display: boolean; raw: string };

export const MATH_OPEN = "\uE000";
export const MATH_CLOSE = "\uE001";
export const MATH_TOKEN = /\uE000(\d+)\uE001/g;

const BLANK = /\n[ \t]*\n/;
const MAX_INLINE = 300;
const MAX_PENDING = 4000;

export function hasMathHint(s: string): boolean {
  return s.includes("\\(") || s.includes("\\[") || s.includes("$");
}

export function maskMath(src: string, streaming = false): { text: string; items: MathItem[]; pending: boolean } {
  const s = src.replace(/[\uE000\uE001]/g, "");
  if (!hasMathHint(s)) return { text: s, items: [], pending: false };
  const n = s.length;
  const items: MathItem[] = [];
  let out = "";
  let i = 0;

  const push = (tex: string, display: boolean, raw: string) => {
    items.push({ tex: tex.trim(), display, raw });
    out += MATH_OPEN + (items.length - 1) + MATH_CLOSE;
  };
  const pendingResult = () => ({ text: out.replace(/[ \t]+$/, ""), items, pending: true });
  /** Closed span `[open, close]` starting at i; content must be non-blank and stay inside one paragraph. */
  const span = (openLen: number, close: string) => {
    const j = s.indexOf(close, i + openLen);
    if (j < 0) return { j: -1, ok: false, content: "" };
    const content = s.slice(i + openLen, j);
    return { j, ok: content.trim() !== "" && !BLANK.test(content), content };
  };
  const canPend = (from: number) => streaming && n - from < MAX_PENDING && !BLANK.test(s.slice(from));

  while (i < n) {
    const ch = s[i];

    if (ch === "`") {
      const lineStart = s.lastIndexOf("\n", i - 1) + 1;
      if (s.startsWith("```", i) && s.slice(lineStart, i).trim() === "") {
        // fenced block: copy through the closing fence, or to the end while it is still open
        const nl = s.indexOf("\n", i);
        const m = nl < 0 ? null : /\n[ \t]*```[^\n]*/.exec(s.slice(nl));
        const end = m ? nl + m.index + m[0].length : n;
        out += s.slice(i, end);
        i = end;
        continue;
      }
      let r = 0;
      while (s[i + r] === "`") r++;
      const run = "`".repeat(r);
      let k = s.indexOf(run, i + r);
      while (k >= 0 && s[k + r] === "`") {
        let e = k;
        while (s[e] === "`") e++;
        k = s.indexOf(run, e);
      }
      if (k >= 0 && !BLANK.test(s.slice(i, k))) {
        out += s.slice(i, k + r);
        i = k + r;
      } else {
        out += run;
        i += r;
      }
      continue;
    }

    if (ch === "\\") {
      const nx = s[i + 1];
      if (nx === "(" || nx === "[") {
        const close = nx === "(" ? "\\)" : "\\]";
        const { j, ok, content } = span(2, close);
        if (ok) {
          push(content, nx === "[", s.slice(i, j + 2));
          i = j + 2;
          continue;
        }
        if (j < 0 && canPend(i + 2)) return pendingResult();
        out += ch + nx;
        i += 2;
        continue;
      }
      if (nx === "$") {
        out += "$";
        i += 2;
        continue;
      }
      if (nx === undefined) {
        out += ch;
        i++;
      } else {
        out += ch + nx;
        i += 2;
      }
      continue;
    }

    if (ch === "$") {
      if (s[i + 1] === "$") {
        const { j, ok, content } = span(2, "$$");
        if (ok) {
          push(content, true, s.slice(i, j + 2));
          i = j + 2;
          continue;
        }
        if (j < 0 && canPend(i + 2)) return pendingResult();
        out += "$$";
        i += 2;
        continue;
      }
      const nx = s[i + 1];
      if (nx !== undefined && !/\s/.test(nx)) {
        let k = i + 1;
        for (; k < n; k++) {
          if (s[k] === "\\") { k++; continue; }
          if (s[k] === "$") break;
        }
        if (k < n) {
          const content = s.slice(i + 1, k);
          const closes = !/\s/.test(s[k - 1]) && !/\d/.test(s[k + 1] ?? "") && s[k + 1] !== "$" && content.length <= MAX_INLINE && !BLANK.test(content);
          if (closes) {
            push(content, false, s.slice(i, k + 1));
            i = k + 1;
            continue;
          }
        } else if (!/\d/.test(nx) && n - i < MAX_INLINE && canPend(i + 1)) {
          return pendingResult();
        }
      }
      out += "$";
      i++;
      continue;
    }

    out += ch;
    i++;
  }
  return { text: out, items, pending: false };
}

/** Put the original source back (used when a masked string is healed and handed on as text). */
export function unmaskMath(text: string, items: MathItem[]): string {
  return text.replace(MATH_TOKEN, (_, n: string) => items[Number(n)]?.raw ?? "");
}
