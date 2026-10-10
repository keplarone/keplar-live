/**
 * Client-safe helpers that turn a reference (a link's design read, an image description, a document) into a short brief
 * for a Create prompt. The references are inspiration only; REFERENCE_RULES travels with them.
 */
import { REFERENCE_RULES } from "@/lib/style/clarity";
import type { PageRead } from "./html";

/** A link's design reference as a brief (pure). */
export function linkBrief(title: string, host: string, design: PageRead["design"] | undefined, description?: string): string {
  const lines = [`Reference site: ${host}${title ? ` ("${title.slice(0, 80)}")` : ""}`];
  if (description) lines.push(`What it is: ${description.slice(0, 160)}`);
  if (design?.sections.length) lines.push(`Section flow: ${design.sections.slice(0, 8).join(" → ")}`);
  if (design?.nav.length) lines.push(`Navigation: ${design.nav.slice(0, 7).join(", ")}`);
  if (design?.palette.length) lines.push(`Palette: ${design.palette.slice(0, 6).join(" ")}`);
  if (design?.fonts.length) lines.push(`Type: ${design.fonts.slice(0, 3).join(", ")}`);
  if (design?.ctas.length) lines.push(`Calls to action: ${design.ctas.slice(0, 4).join(", ")}`);
  return lines.join("\n");
}

/** The reference block appended to a Create prompt, fitted to a character budget. */
export function referenceBlock(briefs: string[], budget: number): string {
  if (!briefs.length || budget < 120) return "";
  const head = `\n\nReferences (inspiration only). ${REFERENCE_RULES}\n`;
  let room = budget - head.length;
  const parts: string[] = [];
  for (const b of briefs) {
    const take = b.slice(0, Math.max(0, Math.min(room, Math.floor((budget - head.length) / briefs.length))));
    if (take.length < 40) break;
    parts.push(`- ${take.replace(/\n/g, "\n  ")}`);
    room -= take.length + 4;
  }
  return parts.length ? head + parts.join("\n") : "";
}
