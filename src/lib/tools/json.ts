/** Tolerant JSON extraction from model output (fences, preamble, trailing commas, smart quotes around keys are not repaired). */

/** The first balanced {...} (or [...]) in the text, respecting strings. Null when there is none. */
export function firstJsonBlock(text: string): string | null {
  const src = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const start = src.search(/[{[]/);
  if (start < 0) return null;
  const open = src[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (ch === "\\") i++;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return src.slice(start, i + 1);
  }
  return null;
}

export function parseJson<T = unknown>(text: string): T | null {
  const block = firstJsonBlock(text);
  if (!block) return null;
  for (const candidate of [block, block.replace(/,\s*([}\]])/g, "$1")]) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      /* try the repaired form */
    }
  }
  return null;
}

/** Plain text from a value that should be a string: strips control characters and tags, collapses runs of spaces, caps the length. */
export function clean(v: unknown, max: number): string {
  if (typeof v !== "string") return typeof v === "number" ? String(v) : "";
  return v
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}
