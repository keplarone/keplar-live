import s from "./Legal.module.css";

/**
 * Inline marker for anything the co-founders or counsel must decide before
 * publication. Deliberately visible: it must never read as settled policy.
 */
export function ReviewNote({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <aside className={s.review} role="note" aria-label="Co-founders and legal review" id={id}>
      <span className={s.reviewLabel}>Co-founders and legal review</span>
      <p className={s.reviewText}>{children}</p>
    </aside>
  );
}

/** Inline placeholder for a value that isn't decided yet, e.g. "[DATE]". */
export function Placeholder({ children }: { children: React.ReactNode }) {
  return <span className={s.placeholder}>{children}</span>;
}
