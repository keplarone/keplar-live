/** Finds feature placeholders in page HTML (already sanitized, so attributes are validated and quoted). */
import type { FeatureId } from "./catalog";

export type Placeholder = { feature: FeatureId; key: string; attrs: Record<string, string>; raw: string; index: number };

const RE = /<div\b([^>]*\bdata-k-feature="[a-z]+"[^>]*)>\s*<\/div>/g;

export function parseAttrs(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of src.matchAll(/\b(data-k-[a-z]+)="([^"]*)"/g)) out[m[1].slice(7)] = m[2].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  return out;
}

export function findPlaceholders(html: string): Placeholder[] {
  const out: Placeholder[] = [];
  for (const m of html.matchAll(RE)) {
    const attrs = parseAttrs(m[1]);
    if (!attrs.feature) continue;
    out.push({ feature: attrs.feature as FeatureId, key: attrs.id ?? "main", attrs, raw: m[0], index: m.index ?? 0 });
  }
  return out;
}

/** Looks through all of a version's pages for one placeholder; its attributes are the only configuration a submission is checked against. */
export function findIn(files: Record<string, string>, feature: FeatureId, key: string): { placeholder: Placeholder; file: string } | null {
  for (const [file, html] of Object.entries(files)) {
    if (!file.endsWith(".html")) continue;
    const p = findPlaceholders(html).find((x) => x.feature === feature && x.key === key);
    if (p) return { placeholder: p, file };
  }
  return null;
}
