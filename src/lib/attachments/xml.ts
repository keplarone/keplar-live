/** Tiny helpers for reading Office Open XML with regular expressions (well-formed machine-written XML only; nothing is executed). */
const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : "";
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

/** Attribute value from a tag's source text. */
export const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`\\s${name.replace(/[:]/g, "\\:")}="([^"]*)"`).exec(tag);
  return m ? decodeEntities(m[1]) : null;
};

/** Every match of an element (non-nested, lazy) with its inner XML. */
export function* elements(xml: string, tag: string): Generator<{ open: string; inner: string }> {
  const rx = new RegExp(`<${tag}(?=[\\s>/])([^>]*?)(?:/>|>([\\s\\S]*?)</${tag}>)`, "g");
  let m: RegExpExecArray | null;
  while ((m = rx.exec(xml))) yield { open: m[1] ?? "", inner: m[2] ?? "" };
}

/** Concatenated text of all `<tag>` text nodes (e.g. w:t, a:t, t). */
export const texts = (xml: string, tag: string) => {
  let out = "";
  for (const e of elements(xml, tag)) out += decodeEntities(e.inner.replace(/<[^>]+>/g, ""));
  return out;
};
