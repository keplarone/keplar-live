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

/**
 * Model marks in white discs, drifting sideways as an endless carousel inside a fixed window with soft faded edges.
 * The row is drawn twice and slid by exactly one copy's width, so the loop has no seam; the copy is hidden from assistive tech.
 * Hover pauses it; prefers-reduced-motion shows the still, overlapping row.
 */
export function ModelStack({ size = 18 }: { size?: number }) {
  const row = (copy: boolean) =>
    MODELS.map((m) => <img key={`${copy ? "b" : "a"}-${m.id}`} src={m.src} alt={copy ? "" : m.name} title={copy ? undefined : m.name} width={size} height={size} />);
  return (
    <span className={s.stack} style={{ "--disc": `${size + 10}px`, "--n": MODELS.length } as React.CSSProperties}>
      <span className={s.stackTrack}>
        {row(false)}
        <span className={s.stackCopy} aria-hidden="true">{row(true)}</span>
      </span>
    </span>
  );
}
