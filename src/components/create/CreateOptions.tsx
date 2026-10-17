import type { ReactNode } from "react";
import c from "./create-intro.module.css";

/**
 * The folded "Options" every Create tab uses for its advanced settings (quality, model, seed, outputs, references…),
 * so the first screen is just the prompt, the main choice and the button. Closed by default; the browser keeps it open
 * while someone works in it.
 */
export function CreateOptions({ summary, children, label = "Options" }: { summary?: string; children: ReactNode; label?: string }) {
  return (
    <details className={c.options}>
      <summary className={c.optionsSummary}>
        <span>{label}</span>
        {summary ? <span className={c.optionsMeta}>{summary}</span> : null}
        <svg width="10" height="10" viewBox="0 0 10 6" aria-hidden="true" className={c.optionsChev}><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </summary>
      <div className={c.optionsBody}>{children}</div>
    </details>
  );
}
