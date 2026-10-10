/**
 * Legal documents are data, not JSX. Each section is a list of typed blocks;
 * the renderer decides presentation. A `review` block is kept ONLY for a fact
 * the founders must supply (legal entity, postal address, governing
 * jurisdiction); settled decisions are plain text. Inline `[[like this]]` in a
 * paragraph renders as a visible placeholder for a missing fact.
 */
export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "list"; items: string[] }
  | { type: "review"; text: string }
  | { type: "flow" }
  /** A labeled email address, rendered as a mailto link. */
  | { type: "email"; label: string; email: string }
  | {
      type: "compare";
      caption: string;
      columns: [string, string];
      /** `null` renders as a "To be confirmed" placeholder. */
      rows: { topic: string; values: [string | null, string | null] }[];
    };

export type LegalSection = {
  id: string;
  title: string;
  blocks: LegalBlock[];
};

export type LegalDoc = {
  slug: "privacy" | "terms" | "referral-terms";
  title: string;
  subline: string;
  /** null until an effective date is set; rendered as "[DATE]". */
  lastUpdated: string | null;
  intro: string[];
  sections: LegalSection[];
};

export function reviewItems(doc: LegalDoc): { section: LegalSection; text: string; index: number }[] {
  const out: { section: LegalSection; text: string; index: number }[] = [];
  let i = 0;
  for (const section of doc.sections) {
    for (const b of section.blocks) {
      if (b.type === "review") out.push({ section, text: b.text, index: i++ });
    }
  }
  return out;
}
