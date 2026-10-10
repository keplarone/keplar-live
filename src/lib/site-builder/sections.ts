/** Finds the top-level blocks of a page (section, header, footer, and main's direct children) so one of them can be named in a change request. A light scan, not a full HTML parser. */
export type PageSection = { index: number; tag: string; title: string; id: string; chars: number };

const TAGS = /<(section|header|footer|aside|article)\b([^>]*)>/gi;
const strip = (h: string) => h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();

function closeAt(html: string, tag: string, from: number): number {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  re.lastIndex = from;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return m.index + m[0].length;
  }
  return -1;
}

export function listSections(html: string): PageSection[] {
  const body = html.replace(/<!--[\s\S]*?-->/g, "");
  const out: PageSection[] = [];
  let skipUntil = 0;
  TAGS.lastIndex = 0;
  for (let m = TAGS.exec(body); m; m = TAGS.exec(body)) {
    if (m.index < skipUntil) continue; // nested inside a block already listed
    const tag = m[1].toLowerCase();
    const end = closeAt(body, tag, m.index + m[0].length);
    if (end < 0) continue;
    const inner = body.slice(m.index, end);
    skipUntil = end;
    const heading = inner.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i);
    const id = (m[2].match(/\bid="([^"]+)"/i) ?? [])[1] ?? "";
    const label = (m[2].match(/\baria-label="([^"]+)"/i) ?? [])[1] ?? "";
    const title = (heading ? strip(heading[1]) : "") || label || (id ? id.replace(/[-_]/g, " ") : "") || (tag === "header" ? "Header" : tag === "footer" ? "Footer" : `Section ${out.length + 1}`);
    out.push({ index: out.length, tag, title: title.slice(0, 80), id, chars: strip(inner).length });
  }
  return out;
}

/** The change request for one block. It names the page and the block, asks for a fresh take, and says to leave the rest alone. */
export function regeneratePrompt(page: string, s: PageSection, note: string): string {
  const where = s.id ? `the ${s.tag} "${s.title}" (id="${s.id}")` : `the ${s.tag} titled "${s.title}"`;
  const extra = note.trim() ? ` What I want from it: ${note.trim().slice(0, 400)}` : " Give it a fresh take: different wording and a different layout, same purpose.";
  return `Rewrite only ${where} on ${page}.${extra} Do not change any other section, the navigation, the footer or the other pages. Keep the existing styles and class names where they still fit.`;
}

/** Picture slots on a page: photo placeholders the generator left, real <img> tags, and what is wrong with them. */
export type ImageSlot = { kind: "placeholder" | "image"; label: string; src: string; issue: string | null };

export function listImageSlots(html: string): ImageSlot[] {
  const body = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  const out: ImageSlot[] = [];
  for (const m of body.matchAll(/<div\b[^>]*\bclass="[^"]*\bk-ph\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)) {
    const text = strip(m[1]).replace(/^photo:\s*/i, "");
    out.push({ kind: "placeholder", label: (text || "Photo").slice(0, 120), src: "", issue: "A labelled placeholder, not a picture yet" });
  }
  for (const m of body.matchAll(/<img\b([^>]*)>/gi)) {
    const attrs = m[1];
    const src = (attrs.match(/\bsrc="([^"]*)"/i) ?? [])[1] ?? "";
    const alt = (attrs.match(/\balt="([^"]*)"/i) ?? [])[1] ?? "";
    const issue = !alt.trim() ? "No alt text (screen readers skip it)" : /^https?:\/\//i.test(src) ? "Loads from another website, which can break" : null;
    out.push({ kind: "image", label: (alt || src.split("/").pop() || "Image").slice(0, 120), src: src.slice(0, 160), issue });
  }
  return out.slice(0, 60);
}

export function imageSlotPrompt(page: string, slot: ImageSlot, idx: number): string {
  const what = slot.kind === "placeholder" ? `the photo placeholder "${slot.label}"` : `the image "${slot.label}"`;
  const fix = slot.issue && slot.kind === "image" ? ` (${slot.issue.toLowerCase()})` : "";
  return `On ${page}, replace ${what}${fix} (picture number ${idx + 1} on that page) with a better visual: a clean inline SVG illustration or geometric art that fits the site's style and says what the slot is about, with useful alt text. No external image URLs. Do not change anything else.`;
}
