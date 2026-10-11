/**
 * The mark shown for a consulted model: its family's logo (public/models) when there is one, otherwise a monogram disc.
 * Matched on the catalog id and display name ("live:gemini-3.8-flash", "Gemini 3.8 Flash"). Names belong to their owners.
 */
export type ModelMark = { kind: "logo"; src: string; family: string } | { kind: "mono"; text: string; family: string };

const LOGOS: { rx: RegExp; family: string; src: string }[] = [
  { rx: /claude|anthropic/i, family: "Claude", src: "/models/claude.svg" },
  { rx: /\bgpt|openai|chatgpt|\bo[1-9]\b/i, family: "ChatGPT", src: "/models/chatgpt.svg" },
  { rx: /gemini|gemma|google/i, family: "Gemini", src: "/models/gemini.svg" },
  { rx: /deepseek/i, family: "DeepSeek", src: "/models/deepseek.svg" },
  { rx: /mistral|ministral|codestral|magistral|devstral/i, family: "Mistral", src: "/models/mistral.svg" },
  { rx: /grok|x-?ai\b/i, family: "Grok", src: "/models/grok.svg" },
];

const MONOS: { rx: RegExp; family: string; text: string }[] = [
  { rx: /qwen|alibaba/i, family: "Qwen", text: "Qw" },
  { rx: /nemotron|nvidia/i, family: "NVIDIA", text: "Nv" },
  { rx: /glm|zhipu|z\.ai/i, family: "GLM", text: "GL" },
  { rx: /llama|meta/i, family: "Llama", text: "Ll" },
  { rx: /kimi|moonshot/i, family: "Kimi", text: "Ki" },
];

export function modelMark(id: string, name: string): ModelMark {
  const key = `${id} ${name}`;
  for (const l of LOGOS) if (l.rx.test(key)) return { kind: "logo", src: l.src, family: l.family };
  for (const m of MONOS) if (m.rx.test(key)) return { kind: "mono", text: m.text, family: m.family };
  const word = (name || id.replace(/^[a-z]+:/, "")).replace(/[^A-Za-z0-9]/g, "");
  return { kind: "mono", text: (word.slice(0, 1).toUpperCase() + word.slice(1, 2).toLowerCase()) || "AI", family: name || id };
}
