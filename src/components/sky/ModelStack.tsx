import s from "./Sky.module.css";

/** The model families Keplar routes to, with their marks (public/models). Names belong to their owners. */
export const MODELS = [
  { id: "claude", name: "Claude", src: "/models/claude.svg" },
  { id: "chatgpt", name: "ChatGPT", src: "/models/chatgpt.svg" },
  { id: "gemini", name: "Gemini", src: "/models/gemini.svg" },
  { id: "deepseek", name: "DeepSeek", src: "/models/deepseek.svg" },
  { id: "mistral", name: "Mistral", src: "/models/mistral.svg" },
  { id: "grok", name: "Grok", src: "/models/grok.svg" },
] as const;

/** Overlapping row of model marks in white discs. */
export function ModelStack({ size = 18 }: { size?: number }) {
  return (
    <span className={s.stack}>
      {MODELS.map((m) => (
        <img key={m.id} src={m.src} alt={m.name} title={m.name} width={size} height={size} />
      ))}
    </span>
  );
}
