"use client";

import { useId, useState, type ReactNode } from "react";

/** A show/hide section: a caret that turns, the panel resolves in (sp-swap). Styles: .sp-disc in src/styles/space.css. */
export function Disclosure({ summary, children, defaultOpen = false, className }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={className ? `sp-disc ${className}` : "sp-disc"} data-open={open ? "true" : "false"}>
      <button type="button" className="sp-disc__trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <span className="sp-caret" data-open={open ? "true" : "false"} aria-hidden="true" />
        <span>{summary}</span>
      </button>
      <div id={id} className="sp-disc__panel" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
