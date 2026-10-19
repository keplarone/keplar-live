/**
 * The mark shown for a model: its parent brand's logo (public/models) when there is one, otherwise a monogram disc.
 * Matched on the catalog id and display name ("live:gemini-3.8-flash", "Gemini 3.8 Flash"). The family is the brand people know
 * the model by (GPT models are "ChatGPT"). Names and logos belong to their owners.
 */
export type ModelMark =
  | { kind: "logo"; src: string; family: string; /** a one-colour logo drawn in the text colour (a mask), so it reads in light and dark */ tint?: boolean }
  | { kind: "mono"; text: string; family: string };

const LOGOS: { rx: RegExp; family: string; src: string; tint?: boolean }[] = [
  { rx: /claude|anthropic/i, family: "Claude", src: "/models/claude.svg" },
  { rx: /\bgpt|openai|chatgpt|\bo[1-9]\b/i, family: "ChatGPT", src: "/models/chatgpt.svg", tint: true },
  { rx: /gemini|gemma|google/i, family: "Gemini", src: "/models/gemini.svg" },
  { rx: /deepseek/i, family: "DeepSeek", src: "/models/deepseek.svg" },
  { rx: /mistral|ministral|codestral|magistral|devstral/i, family: "Mistral", src: "/models/mistral.svg" },
  { rx: /grok|x-?ai\b/i, family: "Grok", src: "/models/grok.svg", tint: true },
  { rx: /qwen|alibaba/i, family: "Qwen", src: "/models/qwen.svg" },
  { rx: /nemotron|nvidia/i, family: "NVIDIA", src: "/models/nvidia.svg" },
  { rx: /llama|\bmeta\b/i, family: "Meta", src: "/models/meta.svg" },
  { rx: /kimi|moonshot/i, family: "Kimi", src: "/models/kimi.svg", tint: true },
];

const MONOS: { rx: RegExp; family: string; text: string }[] = [
  { rx: /glm|zhipu|z\.ai/i, family: "Z.ai", text: "Z" },
  { rx: /\bphi[-\s]?\d|microsoft/i, family: "Microsoft", text: "Ms" },
];

export function modelMark(id: string, name: string): ModelMark {
  const key = `${id} ${name}`;
  for (const l of LOGOS) if (l.rx.test(key)) return { kind: "logo", src: l.src, family: l.family, ...(l.tint ? { tint: true } : {}) };
  for (const m of MONOS) if (m.rx.test(key)) return { kind: "mono", text: m.text, family: m.family };
  const word = (name || id.replace(/^[a-z]+:/, "")).replace(/[^A-Za-z0-9]/g, "");
  return { kind: "mono", text: (word.slice(0, 1).toUpperCase() + word.slice(1, 2).toLowerCase()) || "AI", family: (name || id).replace(/\s*\(free\)\s*$/i, "") };
}

/**
 * The brands behind an answer: one mark per parent brand, in the order the models responded, for the models that actually
 * contributed (responded). Two GPT models give one "ChatGPT". Models that failed, declined or were not needed are left out.
 */
export function answerBrands(models: readonly { id: string; name: string; status?: string }[]): ModelMark[] {
  const out: ModelMark[] = [];
  const seen = new Set<string>();
  for (const m of models) {
    if (m.status && m.status !== "responded") continue;
    const mark = modelMark(m.id, m.name);
    if (seen.has(mark.family)) continue;
    seen.add(mark.family);
    out.push(mark);
  }
  return out;
}

/** "ChatGPT", "ChatGPT and Claude", "ChatGPT, Claude and Gemini". */
export const brandList = (marks: readonly ModelMark[]) => {
  const n = marks.map((m) => m.family);
  return n.length <= 2 ? n.join(" and ") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
};

type PanelModel = { id: string; name: string; status?: string; slot?: string; stance?: string };

/**
 * Who agreed and who did not: the panel models that responded with a stance, split by the majority stance. Answers saved before
 * the majority was recorded fall back to the one stance group whose size equals the agree count; when that is ambiguous, or there
 * is no majority, nobody is placed on a side (the badge then shows counts only).
 */
export function consensusSides<T extends PanelModel>(models: readonly T[], c: { agree: number; majorityStance?: string | null }): { agree: T[]; dissent: T[] } {
  const voters = models.filter((m) => (m.slot ?? "panel") === "panel" && m.status === "responded" && m.stance);
  let major = c.majorityStance ?? null;
  if (!major) {
    const sizes = new Map<string, number>();
    for (const m of voters) sizes.set(m.stance!, (sizes.get(m.stance!) ?? 0) + 1);
    const fits = [...sizes].filter(([, n]) => n === c.agree);
    major = fits.length === 1 ? fits[0][0] : null;
  }
  if (!major) return { agree: [], dissent: [] };
  return { agree: voters.filter((m) => m.stance === major), dissent: voters.filter((m) => m.stance !== major) };
}
