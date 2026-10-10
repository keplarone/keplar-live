import { CopyButton } from "./CopyButton";
import type { Prompt } from "@/lib/kb/prompts";
import s from "./kb.module.css";

/** One copyable prompt with why it works and what to check. Server-rendered; only the copy button is client code. */
export function PromptCard({ p }: { p: Prompt }) {
  return (
    <article className={s.promptCard} id={p.id} aria-labelledby={`${p.id}-t`}>
      <h3 id={`${p.id}-t`} className={s.promptTitle}>{p.title}</h3>
      <figure className={s.codeBlock} style={{ margin: 0 }}>
        <div className={s.codeHead}><span>Prompt template</span><CopyButton text={p.text} label={`prompt: ${p.title}`} /></div>
        <pre tabIndex={0}><code>{p.text}</code></pre>
      </figure>
      <p className={s.promptNote}><strong>Why it works.</strong> {p.why}</p>
      <p className={s.promptNote}><strong>Then check.</strong> {p.check}</p>
    </article>
  );
}
