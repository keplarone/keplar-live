/**
 * Template remixing, pure rules (no I/O). See docs/growth/TEMPLATES.md.
 *
 *  - findPrivate: what stops a site from being offered as a template (contact details, members-only pages, secrets).
 *    We refuse and name the category; we never silently edit the owner's words.
 *  - scrubForRemix: what is removed from a template's files when they are copied into someone else's workspace. A template
 *    is a snapshot of markup and styles. Forms, CRM leads, bookings, orders, members, analytics and chat history live in
 *    other tables keyed by the source site id and are never read here. Owner-specific values that sit in the markup
 *    (links to the owner's uploaded images, their calendar/map/WhatsApp targets, mailto:/tel: links) are cleared.
 *  - addCredit: optional "Based on ..." line, only when the remixer asks for it.
 */
import { findPersonalData } from "@/lib/growth/share-public";

import { CATEGORY_LABEL, TEMPLATE_CATEGORIES, TEMPLATE_LIMITS, TEMPLATE_TEXT, type TemplateCategory } from "./constants";
export { CATEGORY_LABEL, TEMPLATE_CATEGORIES, TEMPLATE_LIMITS, TEMPLATE_TEXT, type TemplateCategory };

const textOf = (html: string) => html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const attrs = (html: string, names: string[]) => [...html.matchAll(new RegExp(`\\b(?:${names.join("|")})="([^"]*)"`, "g"))].map((m) => m[1]);

/** Reasons this site cannot be a template. Empty = fine. */
export function findPrivate(files: Record<string, string>, extraText: string[] = []): string[] {
  const out = new Set<string>();
  const parts: string[] = [...extraText];
  for (const [f, c] of Object.entries(files)) {
    if (!f.endsWith(".html")) continue;
    if (/\bdata-k-gate="page"/.test(c)) out.add("a members-only page (its content must stay private)");
    parts.push(textOf(c), ...attrs(c, ["data-k-seed", "data-k-products", "data-k-note", "data-k-title", "alt", "title", "content"]));
    for (const h of attrs(c, ["href"])) {
      if (/^mailto:/i.test(h)) out.add("an email address");
      if (/^tel:/i.test(h)) out.add("a phone number");
    }
  }
  for (const x of findPersonalData(parts.join("\n"))) out.add(x);
  return [...out];
}

const OWNER_IMAGE = /(?:https?:\/\/[^\s"')]+)?\/i\/[A-Za-z0-9_-]{6,}(?:\.[a-z]{3,4})?/g;

/** Clears owner-specific values from a template's files. Pure; never throws. */
export function scrubForRemix(files: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [f, c] of Object.entries(files)) {
    let s = c;
    if (f.endsWith(".html")) {
      s = s.replace(/<img\b[^>]*\bsrc="[^"]*\/i\/[A-Za-z0-9_-]{6,}[^"]*"[^>]*>/gi, ""); // the owner's uploaded product photos
      s = s.replace(/\b(href|src)="(?:mailto|tel):[^"]*"/gi, '$1="#"');
      s = s.replace(/<div\b[^>]*\bdata-k-feature="[a-z]+"[^>]*>\s*<\/div>/g, (tag) => (/data-k-feature="embeds"/.test(tag) ? tag.replace(/\s+data-k-(?:src|phone|address)="[^"]*"/g, "") : tag)); // calendar / chat / map targets belong to the owner
      s = s.replace(OWNER_IMAGE, "");
    } else if (f.endsWith(".css")) {
      s = s.replace(/url\(\s*["']?[^)"']*\/i\/[A-Za-z0-9_-]{6,}[^)"']*["']?\s*\)/g, "none");
    }
    out[f] = s;
  }
  return out;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Optional credit line for the remixer's home page. Plain text plus one link; nothing is added unless the remixer chose it. */
export function addCredit(files: Record<string, string>, o: { title: string; by?: string | null; url: string }): Record<string, string> {
  const html = files["index.html"];
  if (html === undefined) return files;
  const line = `<p class="k-credit"><small>Based on the “${esc(o.title)}” template${o.by ? ` by ${esc(o.by)}` : ""} on <a href="${esc(o.url)}">Keplar</a>.</small></p>`;
  const next = /<\/footer>/i.test(html) ? html.replace(/<\/footer>(?![\s\S]*<\/footer>)/i, `${line}</footer>`) : /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${line}</body>`) : `${html}${line}`;
  return { ...files, "index.html": next };
}

/** What the remixed site keeps of a brief: structure and style choices only. The owner's idea, copy notes, references, mood board and product import stay behind. */
export function remixBrief<B extends { name: string; kind: string; tone: string[]; pages: string[]; sections: string[]; accent: string | null; mode: string; direction: string; motion: string; recipe?: unknown }>(b: B | undefined, o: { name: string; title: string; description: string }) {
  if (!b) return undefined;
  return { name: o.name, kind: b.kind, idea: `A remix of the “${o.title}” template.`, purpose: o.description, audience: "", tone: b.tone, goal: "", pages: b.pages, sections: b.sections, content: "", imagery: "Graphic shapes and typography; leave clearly marked image placeholders where photos belong", references: "", brandNotes: "", accent: b.accent, mode: b.mode, direction: b.direction, motion: b.motion, ...(b.recipe ? { recipe: b.recipe } : {}) } as unknown as B;
}

export function cleanText(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export const validCommunitySlug = (s: unknown): s is string => typeof s === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*-[a-z0-9]{6}$/.test(s) && s.length <= 80;
export const STARTER_PREFIX = "starter-";
