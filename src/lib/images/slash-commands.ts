/**
 * Slash image commands for Ask (Create image) and Create > Images.
 * Typing `/` opens an autocomplete menu; picking a command (or sending a leading
 * `/Command …`) expands into a strong prompt that keeps the subject from an
 * attached reference or from the text that follows the command.
 */
export type SlashCommand = {
  /** Lowercase id used for matching, e.g. "bts". */
  id: string;
  /** Canonical slash token shown in the menu, e.g. "/BTS". */
  slash: string;
  /** Short title next to the slash token. */
  label: string;
  /** One-line hint in the autocomplete menu. */
  summary: string;
  /** Prefer an attached reference (BTS, Adcreative, Explodeview). Still works text-only. */
  prefersReference: boolean;
  /** Build the expanded prompt. `subject` is never empty. */
  build: (opts: { subject: string; hasReference: boolean }) => string;
};

const refNote = (hasReference: boolean) =>
  hasReference
    ? "Preserve the exact subject, identity, materials and branding from the attached reference image."
    : "Keep the described subject clear and recognizable.";

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  {
    id: "bts",
    slash: "/BTS",
    label: "Behind the scenes",
    summary: "Production-set version of a polished shot",
    prefersReference: true,
    build: ({ subject, hasReference }) =>
      `Behind-the-scenes production photograph of ${subject}: film crew, softboxes, boom mics and camera rigs visible around a carefully lit hero shot, candid documentary mood, shallow depth of field, natural color. ${refNote(hasReference)}`,
  },
  {
    id: "adcreative",
    slash: "/Adcreative",
    label: "Ad creative",
    summary: "Product photo turned into an ad with headline and CTA",
    prefersReference: true,
    build: ({ subject, hasReference }) =>
      `Premium advertising creative featuring ${subject}: clean studio backdrop, bold short headline and a clear call-to-action button in the layout, commercial photography lighting, crisp product focus, modern brand campaign look. ${refNote(hasReference)} Leave readable placeholder marketing text only; no tiny illegible type.`,
  },
  {
    id: "explodeview",
    slash: "/Explodeview",
    label: "Exploded view",
    summary: "Technical exploded parts diagram",
    prefersReference: true,
    build: ({ subject, hasReference }) =>
      `Technical exploded-view illustration of ${subject}: components separated along a clear axis in mid-air, precise engineering cutaways, soft studio lighting, labeled part callouts as clean graphic markers, blueprint-meets-product-render style. ${refNote(hasReference)}`,
  },
  {
    id: "impossibleangle",
    slash: "/Impossibleangle",
    label: "Impossible angle",
    summary: "Surreal impossible camera or geometry",
    prefersReference: false,
    build: ({ subject, hasReference }) =>
      `Photograph of ${subject} from an impossible camera angle: Escher-like geometry, gravity-defying perspective, seamless optical illusion, ultra-sharp detail, cinematic contrast. ${refNote(hasReference)}`,
  },
  {
    id: "surreal",
    slash: "/Surreal",
    label: "Surreal",
    summary: "Surreal architecture or space transformation",
    prefersReference: false,
    build: ({ subject, hasReference }) =>
      `Surreal architectural transformation of ${subject}: dreamlike space, impossible scale shifts, soft volumetric light, quiet uncanny atmosphere, fine-art photography. ${refNote(hasReference)}`,
  },
  {
    id: "cinematic",
    slash: "/Cinematic",
    label: "Cinematic",
    summary: "Movie still with dramatic light and grade",
    prefersReference: false,
    build: ({ subject, hasReference }) =>
      `Cinematic still of ${subject}: anamorphic lens feel, dramatic keyed lighting, rich color grade, atmospheric haze, film grain, 35mm movie frame composition. ${refNote(hasReference)}`,
  },
  {
    id: "productshot",
    slash: "/Productshot",
    label: "Product shot",
    summary: "Clean e-commerce hero product photo",
    prefersReference: true,
    build: ({ subject, hasReference }) =>
      `Clean e-commerce hero product photograph of ${subject}: soft seamless backdrop, evenly diffused studio light, subtle reflection, sharp edges, commercial catalog quality. ${refNote(hasReference)}`,
  },
  {
    id: "sketch",
    slash: "/Sketch",
    label: "Sketch",
    summary: "Hand-drawn pencil or ink sketch",
    prefersReference: false,
    build: ({ subject, hasReference }) =>
      `Hand-drawn sketch of ${subject}: confident pencil and ink lines, light cross-hatching, paper texture, art-study look, no photorealistic shading. ${refNote(hasReference)}`,
  },
  {
    id: "macro",
    slash: "/Macro",
    label: "Macro",
    summary: "Extreme close-up macro detail",
    prefersReference: false,
    build: ({ subject, hasReference }) =>
      `Extreme macro photograph of ${subject}: microscopic surface detail, razor-thin depth of field, sparkling specular highlights, scientific-beauty lighting. ${refNote(hasReference)}`,
  },
  {
    id: "night",
    slash: "/Night",
    label: "Night",
    summary: "Night scene with neon or moonlight",
    prefersReference: false,
    build: ({ subject, hasReference }) =>
      `Night photograph of ${subject}: moonlight and practical neon, long-exposure glow, deep shadows, high dynamic range, quiet nocturnal mood. ${refNote(hasReference)}`,
  },
  {
    id: "flatlay",
    slash: "/Flatlay",
    label: "Flat lay",
    summary: "Overhead flat-lay arrangement",
    prefersReference: false,
    build: ({ subject, hasReference }) =>
      `Overhead flat-lay photograph of ${subject}: neat editorial arrangement on a textured surface, soft daylight, balanced negative space, lifestyle magazine style. ${refNote(hasReference)}`,
  },
  {
    id: "portrait",
    slash: "/Portrait",
    label: "Portrait",
    summary: "Studio portrait lighting",
    prefersReference: true,
    build: ({ subject, hasReference }) =>
      `Studio portrait of ${subject}: flattering Rembrandt or butterfly lighting, clean backdrop, sharp eyes, natural skin texture, editorial portraiture. ${refNote(hasReference)}`,
  },
];

const byId = new Map(SLASH_COMMANDS.map((c) => [c.id, c]));

/** Active `/token` under the caret (token = slash + letters only). */
export function activeSlashToken(text: string, caret: number): { start: number; end: number; query: string } | null {
  const pos = Math.max(0, Math.min(caret, text.length));
  const before = text.slice(0, pos);
  const m = /(?:^|[\s\n])(\/[A-Za-z]*)$/.exec(before);
  if (!m) return null;
  const token = m[1];
  const start = before.length - token.length;
  return { start, end: pos, query: token };
}

/** Filter the catalog for the open menu (`query` includes the leading `/`). */
export function filterSlashCommands(query: string): SlashCommand[] {
  const q = query.replace(/^\//, "").toLowerCase();
  if (!q) return [...SLASH_COMMANDS];
  // Rank so the command whose name starts with what was typed comes first (typing "/ma" + Enter
  // picks /Macro, not /Surreal whose summary happens to contain "transformation").
  const rank = (c: SlashCommand) => {
    if (c.id.startsWith(q) || c.slash.toLowerCase().slice(1).startsWith(q)) return 0;
    const label = c.label.toLowerCase();
    if (label.startsWith(q) || label.split(/\s+/).some((w) => w.startsWith(q))) return 1;
    if (label.includes(q)) return 2;
    if (c.summary.toLowerCase().includes(q)) return 3;
    return -1;
  };
  return SLASH_COMMANDS.map((c, i) => ({ c, i, r: rank(c) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.c);
}

export function expandSlashCommand(cmd: SlashCommand, subject: string, hasReference: boolean): string {
  const subj = subject.trim() || (hasReference ? "the exact subject shown in the attached reference image" : "the subject");
  return cmd.build({ subject: subj, hasReference });
}

/**
 * Parse a leading slash command: `/BTS red sneaker` or `/adcreative`.
 * Returns null when the first token is not a known command.
 */
export function parseLeadingSlash(text: string): { command: SlashCommand; subject: string; range: { start: number; end: number } } | null {
  const m = /^(\s*)(\/[A-Za-z]+)(?:\b|[_\-]?)(.*)$/s.exec(text);
  if (!m) return null;
  const id = m[2].slice(1).toLowerCase();
  const command = byId.get(id);
  if (!command) return null;
  const start = m[1].length;
  const end = start + m[2].length;
  return { command, subject: m[3].replace(/^[\s:.\-]+/, "").trim(), range: { start, end } };
}

/** Expand a leading slash command in a prompt; otherwise return the text unchanged. */
export function expandPromptIfSlash(text: string, opts: { hasReference?: boolean } = {}): { prompt: string; command: SlashCommand | null } {
  const parsed = parseLeadingSlash(text);
  if (!parsed) return { prompt: text, command: null };
  return {
    prompt: expandSlashCommand(parsed.command, parsed.subject, Boolean(opts.hasReference)),
    command: parsed.command,
  };
}

export function slashCommandById(id: string): SlashCommand | undefined {
  return byId.get(id.toLowerCase());
}
