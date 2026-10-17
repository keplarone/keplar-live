import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

type Pad = "none" | "md" | "lg";

/**
 * The Space card: 28px glass, no border; depth from an inner top highlight and a soft drop. `interactive` adds the hover lift
 * and glow (use it on whole-card links). Styles: .sp-card in src/styles/space.css.
 */
export function Card<T extends ElementType = "div">({ as, pad = "md", interactive, className, children, ...rest }: { as?: T; pad?: Pad; interactive?: boolean; className?: string; children?: ReactNode } & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">) {
  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag className={className ? `sp-card ${className}` : "sp-card"} data-pad={pad} data-interactive={interactive ? "" : undefined} {...rest}>
      {children}
    </Tag>
  );
}

/** A solid panel for dense app UI (no backdrop blur): a raised surface with a title row and optional actions. */
export function Panel({ title, actions, children, className, id, pad }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string; pad?: "none" }) {
  return (
    <section className={className ? `sp-panel ${className}` : "sp-panel"} data-pad={pad} aria-labelledby={title && id ? `${id}-h` : undefined}>
      {title || actions ? (
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 36, marginBottom: 12 }}>
          {title ? <h2 id={id ? `${id}-h` : undefined} style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{title}</h2> : null}
          {actions ? <div style={{ display: "flex", gap: 8 }}>{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/** Notices: info / warn / error / success, a glass box with a colored glow (never a colored border). */
export function Notice({ tone = "info", title, children, shake }: { tone?: "info" | "warn" | "error" | "success"; title?: ReactNode; children?: ReactNode; shake?: boolean }) {
  return (
    <div className="sp-notice" data-tone={tone} data-shake={shake ? "" : undefined} role={tone === "error" ? "alert" : "status"}>
      {title ? <b>{title}</b> : null}
      {children}
    </div>
  );
}
